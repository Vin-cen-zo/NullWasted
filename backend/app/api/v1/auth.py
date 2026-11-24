from datetime import timedelta, timezone
import random
import re
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.clock import get_effective_now_utc, get_effective_now_wib
from app.core.database import get_session
from app.core.security import (
    create_access_token,
    hash_password_pbkdf2,
    require_authenticated_user,
    require_consumer_user,
    require_merchant_user,
    verify_password,
)
from app.models.listing import ItemListing, Store, User, UserFavoriteStore
from app.schemas.listing import (
    AuthResponse,
    ChangePasswordRequest,
    ConsumerLoginRequest,
    ConsumerProfileResponse,
    ConsumerProfileUpdateRequest,
    ConsumerRegisterRequest,
    FavoriteStoresResponse,
    MerchantLoginRequest,
    MerchantRegisterRequest,
    PublicStoreDetailResponse,
    StoreLocationUpdateRequest,
    StoreProfileResponse,
    StoreProfileUpdateRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_store_profile_response(store: Store) -> StoreProfileResponse:
    return StoreProfileResponse(
        id=store.id,
        store_id=store.store_id,
        name=store.name,
        category=getattr(store, "category", None) or "Kuliner & Makanan",
        description=getattr(store, "description", None) or "",
        location_name=store.location_name,
        latitude=store.latitude,
        longitude=store.longitude,
        closing_time=store.closing_time,
        maps_url=store.maps_url,
        is_active=store.is_active,
    )


@router.get("/stores", response_model=List[StoreProfileResponse])
def list_active_stores(session: Session = Depends(get_session)) -> List[StoreProfileResponse]:
    """Retrieves all active registered partner stores for easy switching and discovery."""
    statement = select(Store).where(Store.is_active == True).order_by(Store.name.asc())
    stores = session.exec(statement).all()
    return [_to_store_profile_response(s) for s in stores]


@router.get("/stores/{store_id}", response_model=PublicStoreDetailResponse)
def get_public_store_profile(
    store_id: str,
    session: Session = Depends(get_session),
) -> PublicStoreDetailResponse:
    """Publicly retrieves a partner store profile and its active unexpired surplus listings."""
    target_id = store_id.strip().upper()
    store = session.exec(select(Store).where(Store.store_id == target_id, Store.is_active == True)).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gerai tidak ditemukan.")

    now_utc = get_effective_now_utc()
    rows = session.exec(
        select(ItemListing)
        .where(
            ItemListing.store_id == target_id,
            ItemListing.is_active == True,
            ItemListing.quantity > 0,
        )
        .order_by(ItemListing.created_at.desc())
    ).all()

    active_listings = []
    for item in rows:
        if item.expires_at is None:
            active_listings.append(item)
        else:
            exp_dt = item.expires_at if item.expires_at.tzinfo else item.expires_at.replace(tzinfo=timezone.utc)
            if exp_dt > now_utc:
                active_listings.append(item)

    return PublicStoreDetailResponse(
        store=_to_store_profile_response(store),
        active_listings=active_listings,
        active_listing_count=len(active_listings),
    )


@router.patch("/stores/{store_id}/profile", response_model=StoreProfileResponse)
def update_store_profile(
    store_id: str,
    payload: StoreProfileUpdateRequest,
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_merchant_user),
) -> StoreProfileResponse:
    """Updates partner store metadata (name, category, closing_time, location_name, description).
    Guardrail: changing closing_time NEVER extends active listing expires_at past BPOM safety limit.
    """
    target_id = store_id.strip().upper()
    if user_claims.get("store_id") != target_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pemilik gerai terkait yang dapat mengubah profil gerai.",
        )

    store = session.exec(select(Store).where(Store.store_id == target_id)).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gerai tidak ditemukan.")

    closing_changed = False
    if payload.name is not None and payload.name.strip():
        store.name = payload.name.strip()
    if payload.category is not None and payload.category.strip():
        store.category = payload.category.strip()
    if payload.description is not None:
        store.description = payload.description.strip()
    if payload.location_name is not None and payload.location_name.strip():
        store.location_name = payload.location_name.strip()
    if payload.closing_time is not None and payload.closing_time != store.closing_time:
        store.closing_time = payload.closing_time
        closing_changed = True

    session.add(store)

    # Compute new closing datetime in UTC if closing_time changed
    new_closing_utc = None
    if closing_changed:
        now_wib = get_effective_now_wib()
        close_h, close_m = map(int, store.closing_time.split(":"))
        closing_local = now_wib.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
        if closing_local < now_wib and now_wib.hour >= 18 and close_h < 6:
            closing_local += timedelta(days=1)
        new_closing_utc = closing_local.astimezone(timezone.utc)

    active_listings = session.exec(
        select(ItemListing).where(ItemListing.store_id == target_id, ItemListing.is_active == True)
    ).all()
    for item in active_listings:
        item.store_name = store.name
        item.location_badge = store.location_name
        item.closing_time = store.closing_time
        if new_closing_utc is not None and item.expires_at is not None:
            existing_exp = (
                item.expires_at
                if item.expires_at.tzinfo
                else item.expires_at.replace(tzinfo=timezone.utc)
            )
            # Guardrail #2: ONLY tighten expires_at, NEVER extend past existing BPOM limit
            item.expires_at = min(existing_exp, new_closing_utc)
        session.add(item)

    session.commit()
    session.refresh(store)
    return _to_store_profile_response(store)


@router.patch("/stores/{store_id}/location", response_model=StoreProfileResponse)
@router.put("/stores/{store_id}/location", response_model=StoreProfileResponse)
def update_store_location(
    store_id: str,
    payload: StoreLocationUpdateRequest,
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_merchant_user),
) -> StoreProfileResponse:
    """Updates or removes a partner store's permanent map pinpoint coordinates and syncs active listings."""
    target_id = store_id.strip().upper()
    if user_claims.get("store_id") != target_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pemilik gerai terkait yang dapat mengubah atau menghapus lokasi gerai.",
        )

    store = session.exec(select(Store).where(Store.store_id == target_id)).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gerai tidak ditemukan.")

    has_coords = payload.latitude is not None and payload.longitude is not None
    if has_coords:
        store.latitude = payload.latitude
        store.longitude = payload.longitude
        store.maps_url = f"https://maps.google.com/?q={payload.latitude},{payload.longitude}"
        store.location_name = (
            payload.location_name.strip()
            if payload.location_name and payload.location_name.strip()
            else f"Pin Peta ({payload.latitude:.4f}, {payload.longitude:.4f})"
        )
    else:
        store.latitude = None
        store.longitude = None
        store.maps_url = ""
        store.location_name = (
            payload.location_name.strip()
            if payload.location_name and payload.location_name.strip()
            else "Lokasi peta belum dipasang"
        )

    session.add(store)

    # Sync active listings belonging to this store
    active_listings = session.exec(
        select(ItemListing).where(ItemListing.store_id == target_id, ItemListing.is_active == True)
    ).all()
    for item in active_listings:
        item.latitude = store.latitude
        item.longitude = store.longitude
        item.maps_url = store.maps_url
        item.location_badge = store.location_name
        session.add(item)

    session.commit()
    session.refresh(store)

    return _to_store_profile_response(store)


@router.post("/merchant-register", response_model=AuthResponse)
def merchant_register(
    payload: MerchantRegisterRequest, session: Session = Depends(get_session)
) -> AuthResponse:
    """Registers a new partner store autonomously with email + password and auto-generates a unique store_id."""
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password
    has_coords = payload.latitude is not None and payload.longitude is not None
    raw_loc = (payload.location_name or "").strip()
    if raw_loc:
        location_name = raw_loc
    elif has_coords:
        location_name = f"Pin Peta ({payload.latitude:.4f}, {payload.longitude:.4f})"
    else:
        location_name = "Lokasi peta belum dipasang"

    closing_time = payload.closing_time.strip() or "20:30"
    category = (payload.category or "").strip() or "Kuliner & Makanan"

    existing_email = session.exec(select(Store).where(Store.email == email)).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email gerai sudah terdaftar. Silakan masuk melalui tab Masuk Akun.",
        )

    clean_letters = re.sub(r"[^A-Za-z]", "", name).upper()
    prefix = clean_letters[:3] if len(clean_letters) >= 3 else (clean_letters + "TKO")[:3]
    while True:
        candidate_id = f"{prefix}-{random.randint(1000, 9999)}"
        existing = session.exec(select(Store).where(Store.store_id == candidate_id)).first()
        if not existing:
            break

    maps_url = (
        f"https://maps.google.com/?q={payload.latitude},{payload.longitude}"
        if has_coords
        else ""
    )

    new_store = Store(
        store_id=candidate_id,
        name=name,
        email=email,
        password_hash=hash_password_pbkdf2(password),
        pin_hash="",
        location_name=location_name,
        closing_time=closing_time,
        category=category,
        description="",
        latitude=payload.latitude if has_coords else None,
        longitude=payload.longitude if has_coords else None,
        maps_url=maps_url,
        is_active=True,
    )
    session.add(new_store)
    session.commit()
    session.refresh(new_store)

    token = create_access_token({
        "sub": new_store.store_id,
        "role": "merchant",
        "email": new_store.email,
        "store_id": new_store.store_id,
        "store_name": new_store.name,
    })

    return AuthResponse(
        token=token,
        role="merchant",
        email=new_store.email,
        store_id=new_store.store_id,
        store_name=new_store.name,
        store_category=new_store.category,
        store_description=new_store.description,
        closing_time=new_store.closing_time,
        location_name=new_store.location_name,
        latitude=new_store.latitude,
        longitude=new_store.longitude,
    )


@router.post("/merchant-login", response_model=AuthResponse)
def merchant_login(
    payload: MerchantLoginRequest, session: Session = Depends(get_session)
) -> AuthResponse:
    """Authenticates store staff using email and password against PBKDF2-HMAC-SHA256 hash."""
    email = payload.email.strip().lower()
    statement = select(Store).where(Store.email == email, Store.is_active == True)
    store = session.exec(statement).first()

    if not store or not store.password_hash or not verify_password(payload.password, store.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password akun gerai tidak valid.",
        )

    token = create_access_token({
        "sub": store.store_id,
        "role": "merchant",
        "email": store.email,
        "store_id": store.store_id,
        "store_name": store.name,
    })

    return AuthResponse(
        token=token,
        role="merchant",
        email=store.email,
        store_id=store.store_id,
        store_name=store.name,
        store_category=getattr(store, "category", None) or "Kuliner & Makanan",
        store_description=getattr(store, "description", None) or "",
        closing_time=store.closing_time,
        location_name=store.location_name,
        latitude=store.latitude,
        longitude=store.longitude,
    )


@router.post("/consumer-register", response_model=AuthResponse)
def consumer_register(
    payload: ConsumerRegisterRequest, session: Session = Depends(get_session)
) -> AuthResponse:
    """Registers a new consumer using name, email, password, and optional WhatsApp phone."""
    email = payload.email.strip().lower()
    password = payload.password
    phone = (payload.phone or "").strip()
    name = payload.name.strip()

    existing_user = session.exec(select(User).where(User.email == email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email sudah terdaftar. Silakan masuk melalui tab Masuk Akun.",
        )

    user = User(
        name=name,
        email=email,
        password_hash=hash_password_pbkdf2(password),
        phone=phone,
        role="CONSUMER",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token({
        "sub": user.id,
        "role": "consumer",
        "email": user.email,
        "name": user.name,
        "phone": user.phone,
    })

    return AuthResponse(
        token=token,
        role="consumer",
        email=user.email,
        user_id=user.id,
        customer_name=user.name,
        customer_phone=user.phone,
    )


@router.post("/consumer-login", response_model=AuthResponse)
def consumer_login(
    payload: ConsumerLoginRequest, session: Session = Depends(get_session)
) -> AuthResponse:
    """Authenticates an existing consumer using email and password against PBKDF2-HMAC-SHA256 hash."""
    email = payload.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()

    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password akun konsumen tidak valid.",
        )

    token = create_access_token({
        "sub": user.id,
        "role": "consumer",
        "email": user.email,
        "name": user.name,
        "phone": user.phone,
    })

    return AuthResponse(
        token=token,
        role="consumer",
        email=user.email,
        user_id=user.id,
        customer_name=user.name,
        customer_phone=user.phone,
    )


@router.get("/me", response_model=ConsumerProfileResponse)
def get_consumer_profile(
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_consumer_user),
) -> ConsumerProfileResponse:
    """Retrieves the authenticated consumer's profile."""
    user = session.get(User, user_claims.get("sub"))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Akun konsumen tidak ditemukan.")
    return ConsumerProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone or "",
        role="consumer",
        created_at=user.created_at,
    )


@router.patch("/me", response_model=ConsumerProfileResponse)
def update_consumer_profile(
    payload: ConsumerProfileUpdateRequest,
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_consumer_user),
) -> ConsumerProfileResponse:
    """Updates the authenticated consumer's name and WhatsApp phone number."""
    user = session.get(User, user_claims.get("sub"))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Akun konsumen tidak ditemukan.")

    if payload.name is not None and payload.name.strip():
        user.name = payload.name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip()

    session.add(user)
    session.commit()
    session.refresh(user)
    return ConsumerProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone or "",
        role="consumer",
        created_at=user.created_at,
    )


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_authenticated_user),
) -> dict[str, str]:
    """Changes password for either an authenticated consumer or merchant after verifying current password."""
    role = user_claims.get("role")
    if role == "consumer":
        user = session.get(User, user_claims.get("sub"))
        if not user or not user.password_hash or not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password lama tidak sesuai.",
            )
        user.password_hash = hash_password_pbkdf2(payload.new_password)
        session.add(user)
        session.commit()
        return {"status": "ok", "message": "Password akun konsumen berhasil diperbarui."}

    if role == "merchant":
        store_id = user_claims.get("store_id")
        store = session.exec(select(Store).where(Store.store_id == store_id)).first()
        if not store or not store.password_hash or not verify_password(payload.current_password, store.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password lama tidak sesuai.",
            )
        store.password_hash = hash_password_pbkdf2(payload.new_password)
        session.add(store)
        session.commit()
        return {"status": "ok", "message": "Password akun gerai berhasil diperbarui."}

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Peran pengguna tidak valid.")


@router.get("/favorites", response_model=FavoriteStoresResponse)
def get_favorite_stores(
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_consumer_user),
) -> FavoriteStoresResponse:
    """Returns list of store_ids favorited by the authenticated consumer."""
    user_id = user_claims.get("sub")
    rows = session.exec(
        select(UserFavoriteStore).where(UserFavoriteStore.user_id == user_id)
    ).all()
    return FavoriteStoresResponse(store_ids=[r.store_id for r in rows])


@router.post("/favorites/{store_id}", response_model=FavoriteStoresResponse)
def add_favorite_store(
    store_id: str,
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_consumer_user),
) -> FavoriteStoresResponse:
    """Adds a store to the authenticated consumer's favorites (idempotent)."""
    target_id = store_id.strip().upper()
    store = session.exec(select(Store).where(Store.store_id == target_id, Store.is_active == True)).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gerai tidak ditemukan.")

    user_id = user_claims.get("sub")
    existing = session.exec(
        select(UserFavoriteStore).where(
            UserFavoriteStore.user_id == user_id,
            UserFavoriteStore.store_id == target_id,
        )
    ).first()
    if not existing:
        session.add(UserFavoriteStore(user_id=user_id, store_id=target_id))
        session.commit()

    rows = session.exec(select(UserFavoriteStore).where(UserFavoriteStore.user_id == user_id)).all()
    return FavoriteStoresResponse(store_ids=[r.store_id for r in rows])


@router.delete("/favorites/{store_id}", response_model=FavoriteStoresResponse)
def remove_favorite_store(
    store_id: str,
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_consumer_user),
) -> FavoriteStoresResponse:
    """Removes a store from the authenticated consumer's favorites (idempotent)."""
    target_id = store_id.strip().upper()
    user_id = user_claims.get("sub")
    existing = session.exec(
        select(UserFavoriteStore).where(
            UserFavoriteStore.user_id == user_id,
            UserFavoriteStore.store_id == target_id,
        )
    ).first()
    if existing:
        session.delete(existing)
        session.commit()

    rows = session.exec(select(UserFavoriteStore).where(UserFavoriteStore.user_id == user_id)).all()
    return FavoriteStoresResponse(store_ids=[r.store_id for r in rows])

