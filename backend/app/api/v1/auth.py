import random
import re
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import create_access_token, get_optional_user, hash_pin_pbkdf2, verify_pin
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
    """Registers a new partner store autonomously, hashes PIN, and auto-generates a unique store_id."""
    name = payload.name.strip()
    pin = payload.pin.strip()
    has_coords = payload.latitude is not None and payload.longitude is not None
    raw_loc = (payload.location_name or "").strip()
    if raw_loc:
        location_name = raw_loc
    elif has_coords:
        location_name = f"Pin Peta ({payload.latitude:.4f}, {payload.longitude:.4f})"
    else:
        location_name = "Lokasi peta belum dipasang"

    closing_time = payload.closing_time.strip() or "20:30"

    if len(pin) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIN Kasir / Dapur minimal 4 karakter.",
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
        pin_hash=hash_pin_pbkdf2(pin),
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
        "store_id": new_store.store_id,
        "store_name": new_store.name,
    })

    return AuthResponse(
        token=token,
        role="merchant",
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
    """Authenticates store staff using store_id and PIN against SHA-256 hash. Returns stateless JWT token."""
    target_id = payload.store_id.strip().upper()
    statement = select(Store).where(Store.store_id == target_id, Store.is_active == True)
    store = session.exec(statement).first()

    if not store or not verify_pin(payload.pin.strip(), store.pin_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Store ID atau PIN Staf Dapur tidak valid.",
        )

    token = create_access_token({
        "sub": store.store_id,
        "role": "merchant",
        "store_id": store.store_id,
        "store_name": store.name,
    })

    return AuthResponse(
        token=token,
        role="merchant",
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
    """Registers a new consumer using name and phone number. Returns stateless JWT token."""
    phone = payload.phone.strip()
    name = payload.name.strip()

    if not phone or not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nama dan nomor telepon wajib diisi.",
        )

    statement = select(User).where(User.phone == phone)
    existing_user = session.exec(statement).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nomor WhatsApp sudah terdaftar. Silakan masuk melalui tab Masuk Akun.",
        )

    user = User(name=name, phone=phone, role="CONSUMER")
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token({
        "sub": user.id,
        "role": "consumer",
        "name": user.name,
        "phone": user.phone,
    })

    return AuthResponse(
        token=token,
        role="consumer",
        user_id=user.id,
        customer_name=user.name,
        customer_phone=user.phone,
    )


@router.post("/consumer-login", response_model=AuthResponse)
def consumer_login(
    payload: ConsumerLoginRequest, session: Session = Depends(get_session)
) -> AuthResponse:
    """Registers or logs in a consumer using name and phone number. Returns stateless JWT token."""
    phone = payload.phone.strip()

    if not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nomor telepon wajib diisi.",
        )

    statement = select(User).where(User.phone == phone)
    user = session.exec(statement).first()

    if user:
        if payload.name and payload.name.strip():
            req_name = payload.name.strip()
            if user.name != req_name:
                user.name = req_name
                session.add(user)
                session.commit()
                session.refresh(user)
    else:
        if payload.name and payload.name.strip():
            req_name = payload.name.strip()
            user = User(name=req_name, phone=phone, role="CONSUMER")
            session.add(user)
            session.commit()
            session.refresh(user)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nomor WhatsApp belum terdaftar. Silakan daftar akun konsumen baru terlebih dahulu.",
            )

    token = create_access_token({
        "sub": user.id,
        "role": "consumer",
        "name": user.name,
        "phone": user.phone,
    })

    return AuthResponse(
        token=token,
        role="consumer",
        user_id=user.id,
        customer_name=user.name,
        customer_phone=user.phone,
    )

