from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import create_access_token, verify_pin
from app.models.listing import Store, User
from app.schemas.listing import (
    AuthResponse,
    ConsumerLoginRequest,
    MerchantLoginRequest,
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


@router.post("/consumer-login", response_model=AuthResponse)
def consumer_login(
    payload: ConsumerLoginRequest, session: Session = Depends(get_session)
) -> AuthResponse:
    """Registers or logs in a consumer using name and phone number. Returns stateless JWT token."""
    phone = payload.phone.strip()
    name = payload.name.strip()

    if not phone or not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nama dan nomor telepon wajib diisi.",
        )

    statement = select(User).where(User.phone == phone)
    user = session.exec(statement).first()

    if not user:
        user = User(name=name, phone=phone, role="CONSUMER")
        session.add(user)
        session.commit()
        session.refresh(user)
    elif user.name != name:
        user.name = name
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
