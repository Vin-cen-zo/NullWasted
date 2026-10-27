import random
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.listing import ItemListing, OrderTicket
from app.schemas.listing import (
    DraftRequest,
    DraftResponse,
    PublishRequest,
    ReserveOrderRequest,
)
from app.services.extractor import extract_listing_entities
from app.services.guardrail import evaluate_food_safety
from app.services.pricing import calculate_dynamic_pricing

router = APIRouter()


@router.post("/listings/draft", response_model=DraftResponse)
async def create_draft_listing(request: DraftRequest) -> DraftResponse:
    """Extracts entities from merchant voice/text prompt, applies BPOM guardrail and dynamic pricing."""
    extracted = await extract_listing_entities(request.text, request.audio_base64)

    safety = evaluate_food_safety(
        food_name=extracted["food_name"],
        raw_text=request.text,
        hours_since_cooked=extracted["hours_since_cooked"],
    )

    pricing = calculate_dynamic_pricing(
        original_price=extracted["original_price"],
        minutes_until_closing=extracted["minutes_until_closing"],
        quantity=extracted["quantity"],
    )

    return DraftResponse(
        food_name=extracted["food_name"],
        matched_canonical_dish=safety["matched_canonical_dish"],
        category=safety["category"],
        quantity=extracted["quantity"],
        original_price=extracted["original_price"],
        recommended_discount_percent=pricing["discount_percent"],
        discounted_price=pricing["discounted_price"],
        hours_since_cooked=extracted["hours_since_cooked"],
        bpom_max_hours=safety["bpom_max_hours"],
        minutes_until_closing=extracted["minutes_until_closing"],
        safety_status=safety["safety_status"],
        safety_reason=safety["safety_reason"],
        hazard_description=safety["hazard_description"],
        regulation_ref=safety["regulation_ref"],
        similarity_score=safety["similarity_score"],
        extraction_source=extracted["extraction_source"],
        can_publish=safety["can_publish"],
    )


@router.post("/listings/publish", response_model=ItemListing)
def publish_listing(
    payload: PublishRequest, session: Session = Depends(get_session)
) -> ItemListing:
    """Publishes a validated surplus food listing to the active marketplace catalog.
    Enforces hard food safety guardrail: raises HTTP 400 if safety_status is REJECTED.
    """
    if payload.safety_status == "REJECTED" or payload.hours_since_cooked > payload.bpom_max_hours:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Listing ditolak oleh Guardrail Keamanan Pangan BPOM.",
        )

    discount_percent = max(50, min(70, payload.discount_percent))
    raw_price = payload.original_price * (1.0 - discount_percent / 100.0)
    discounted_price = int((raw_price // 100) * 100)

    listing = ItemListing(
        store_name=payload.store_name,
        location_badge=payload.location_badge,
        food_name=payload.food_name,
        matched_canonical_dish=payload.matched_canonical_dish,
        category=payload.category,
        quantity=payload.quantity,
        initial_quantity=payload.quantity,
        original_price=payload.original_price,
        discounted_price=discounted_price,
        discount_percent=discount_percent,
        hours_since_cooked=payload.hours_since_cooked,
        bpom_max_hours=payload.bpom_max_hours,
        minutes_until_closing=payload.minutes_until_closing,
        safety_status=payload.safety_status,
        safety_reason=payload.safety_reason,
        hazard_description=payload.hazard_description,
        regulation_ref=payload.regulation_ref,
        similarity_score=payload.similarity_score,
        is_active=True,
    )

    session.add(listing)
    session.commit()
    session.refresh(listing)
    return listing


@router.get("/listings/active", response_model=List[ItemListing])
def get_active_listings(session: Session = Depends(get_session)) -> List[ItemListing]:
    """Retrieves all active surplus food listings with quantity > 0 sorted by latest first."""
    statement = (
        select(ItemListing)
        .where(ItemListing.is_active == True, ItemListing.quantity > 0)
        .order_by(ItemListing.created_at.desc())
    )
    results = session.exec(statement).all()
    return list(results)


@router.post("/orders/reserve", response_model=OrderTicket)
def reserve_order(
    payload: ReserveOrderRequest, session: Session = Depends(get_session)
) -> OrderTicket:
    """Reserves surplus food items atomically and issues a digital pickup pass with QR payload."""
    listing = session.get(ItemListing, payload.listing_id)
    if not listing or not listing.is_active or listing.quantity < payload.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stok porsi tidak mencukupi atau listing sudah habis.",
        )

    # Atomic stock decrement
    listing.quantity -= payload.quantity
    if listing.quantity <= 0:
        listing.is_active = False

    session.add(listing)

    order_code = f"#NW-{random.randint(1000, 9999)}"
    total_price = listing.discounted_price * payload.quantity
    qr_payload = f"NULLWASTED|ORDER:{order_code}|ITEM:{listing.id}|QTY:{payload.quantity}"

    ticket = OrderTicket(
        order_code=order_code,
        listing_id=listing.id,
        food_name=listing.food_name,
        store_name=listing.store_name,
        location_badge=listing.location_badge,
        quantity=payload.quantity,
        unit_price=listing.discounted_price,
        total_price=total_price,
        pickup_deadline=f"Sebelum toko tutup ({listing.minutes_until_closing} menit lagi)",
        qr_payload=qr_payload,
        status="RESERVED",
    )

    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    return ticket


@router.delete("/listings/{listing_id}")
def delete_listing(
    listing_id: str, session: Session = Depends(get_session)
) -> dict[str, Any]:
    """Deactivates a listing from the merchant inventory."""
    listing = session.get(ItemListing, listing_id)
    if listing:
        listing.is_active = False
        session.add(listing)
        session.commit()
    return {"status": "deleted", "id": listing_id}
