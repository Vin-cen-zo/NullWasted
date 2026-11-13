import random
import re
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import (
    create_access_token,
    get_optional_user,
    hash_password_pbkdf2,
    verify_password,
)
from app.models.listing import ItemListing, Store, User
from app.schemas.listing import (
    AuthResponse,
    ConsumerLoginRequest,
    ConsumerRegisterRequest,
    MerchantLoginRequest,
    MerchantRegisterRequest,
    StoreLocationUpdateRequest,
    StoreProfileResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/stores", response_model=List[StoreProfileResponse])
def list_active_stores(session: Session = Depends(get_session)) -> List[StoreProfileResponse]:
    """Retrieves all active registered partner stores for easy switching and discovery."""
    statement = select(Store).where(Store.is_active == True).order_by(Store.name.asc())
    stores = session.exec(statement).all()
    return [
        StoreProfileResponse(
            id=s.id,
            store_id=s.store_id,
            name=s.name,
            location_name=s.location_name,
            latitude=s.latitude,
            longitude=s.longitude,
            closing_time=s.closing_time,
            maps_url=s.maps_url,
            is_active=s.is_active,
        )
        for s in stores
    ]


@router.patch("/stores/{store_id}/location", response_model=StoreProfileResponse)
@router.put("/stores/{store_id}/location", response_model=StoreProfileResponse)
def update_store_location(
    store_id: str,
    payload: StoreLocationUpdateRequest,
    session: Session = Depends(get_session),
    user_claims: Optional[dict[str, Any]] = Depends(get_optional_user),
) -> StoreProfileResponse:
    """Updates or removes a partner store's permanent map pinpoint coordinates and syncs active listings."""
    target_id = store_id.strip().upper()
    if user_claims is not None:
        if user_claims.get("role") != "merchant" or user_claims.get("store_id") != target_id:
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

    return StoreProfileResponse(
        id=store.id,
        store_id=store.store_id,
        name=store.name,
        location_name=store.location_name,
        latitude=store.latitude,
        longitude=store.longitude,
        closing_time=store.closing_time,
        maps_url=store.maps_url,
        is_active=store.is_active,
    )


@router.post("/merchant-register", response_model=AuthResponse)
def merchant_register(
    payload: MerchantRegisterRequest, session: Session = Depends(get_session)
) -> AuthResponse:
    """Registers a new partner store autonomously with email + password and auto-generates a unique store_id."""
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password.strip()
    has_coords = payload.latitude is not None and payload.longitude is not None
    raw_loc = (payload.location_name or "").strip()
    if raw_loc:
        location_name = raw_loc
    elif has_coords:
        location_name = f"Pin Peta ({payload.latitude:.4f}, {payload.longitude:.4f})"
    else:
        location_name = "Lokasi peta belum dipasang"

    closing_time = payload.closing_time.strip() or "20:30"

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

    if not store or not store.password_hash or not verify_password(payload.password.strip(), store.password_hash):
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
    password = payload.password.strip()
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

    if not user or not user.password_hash or not verify_password(payload.password.strip(), user.password_hash):
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

