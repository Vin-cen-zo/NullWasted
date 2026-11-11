import asyncio
import json
import random
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import compute_minutes_until_closing
from app.models.listing import ItemListing, OrderTicket, Store, StoreMenuItem, utc_now_iso
from app.schemas.listing import (
    CompletePickupRequest,
    DraftRequest,
    DraftResponse,
    MenuItemCreateRequest,
    MenuItemResponse,
    MenuItemUpdateRequest,
    PublishRequest,
    ReserveOrderRequest,
    SmartBundleRequest,
)
from app.services.extractor import extract_listing_entities
from app.services.guardrail import evaluate_food_safety
from app.services.pricing import calculate_dynamic_pricing
from app.services.vector_store import vector_store

router = APIRouter()


def _detect_allergen_tags(text: str) -> list[str]:
    t = text.lower()
    tags = []
    if any(k in t for k in ("santan", "kelapa")):
        tags.append("Santan/Kelapa")
    if any(k in t for k in ("susu", "dairy", "cream", "krim", "keju", "cheese", "mentega", "butter")):
        tags.append("Susu/Dairy")
    if any(k in t for k in ("telur", "egg")):
        tags.append("Telur")
    if any(k in t for k in ("kacang", "peanut")):
        tags.append("Kacang")
    if any(k in t for k in ("gluten", "tepung", "gandum", "roti", "pastry", "mie", "pasta", "croissant", "donat")):
        tags.append("Gluten/Tepung")
    if any(k in t for k in ("ikan", "udang", "cumi", "seafood", "kepiting")):
        tags.append("Seafood/Ikan")
    if any(k in t for k in ("kedelai", "tahu", "tempe", "kecap", "soy")):
        tags.append("Kedelai")
    return tags


# ============================================================================
# 1. STORE MASTER MENU CATALOG CRUD (Layer 1 RAG)
# ============================================================================

@router.get("/menu/{store_id}", response_model=List[MenuItemResponse])
def get_store_menu(store_id: str, session: Session = Depends(get_session)) -> List[MenuItemResponse]:
    """Retrieves all active StoreMenuItems for a specific store."""
    statement = (
        select(StoreMenuItem)
        .where(StoreMenuItem.store_id == store_id, StoreMenuItem.is_active == True)
        .order_by(StoreMenuItem.food_name.asc())
    )
    items = session.exec(statement).all()
    return [
        MenuItemResponse(
            id=item.id,
            store_id=item.store_id,
            food_name=item.food_name,
            original_price=item.original_price,
            typical_cooking_time=item.typical_cooking_time,
            default_hours_cooked=item.default_hours_cooked,
            ingredients=item.ingredients,
            canonical_bpom_dish=item.canonical_bpom_dish,
            category=item.category,
            bpom_max_hours=item.bpom_max_hours,
            portion_size=getattr(item, "portion_size", "Reguler") or "Reguler",
            image_url=item.image_url,
            is_active=item.is_active,
            created_at=item.created_at,
        )
        for item in items
    ]


@router.post("/menu/{store_id}", response_model=MenuItemResponse)
def create_store_menu_item(
    store_id: str, payload: MenuItemCreateRequest, session: Session = Depends(get_session)
) -> MenuItemResponse:
    """Adds a new routine dish to the store catalog with automatic BPOM vector mapping."""
    safety = evaluate_food_safety(
        food_name=payload.food_name,
        raw_text=payload.ingredients,
        hours_since_cooked=payload.default_hours_cooked,
    )
    if safety["safety_status"] == "REJECTED" or not safety["can_publish"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ditolak BPOM: {safety['safety_reason']} Hidangan tidak memenuhi syarat kelayakan pangan dan tidak diizinkan masuk ke Buku Menu.",
        )

    menu_item = StoreMenuItem(
        store_id=store_id,
        food_name=payload.food_name.strip(),
        original_price=payload.original_price,
        typical_cooking_time=payload.typical_cooking_time,
        default_hours_cooked=payload.default_hours_cooked,
        ingredients=payload.ingredients,
        canonical_bpom_dish=safety["matched_canonical_dish"],
        category=safety["category"],
        bpom_max_hours=safety["bpom_max_hours"],
        portion_size=payload.portion_size or "Reguler",
        image_url=payload.image_url,
        is_active=True,
    )
    session.add(menu_item)
    session.commit()
    session.refresh(menu_item)

    return MenuItemResponse(
        id=menu_item.id,
        store_id=menu_item.store_id,
        food_name=menu_item.food_name,
        original_price=menu_item.original_price,
        typical_cooking_time=menu_item.typical_cooking_time,
        default_hours_cooked=menu_item.default_hours_cooked,
        ingredients=menu_item.ingredients,
        canonical_bpom_dish=menu_item.canonical_bpom_dish,
        category=menu_item.category,
        bpom_max_hours=menu_item.bpom_max_hours,
        portion_size=menu_item.portion_size or "Reguler",
        image_url=menu_item.image_url,
        is_active=menu_item.is_active,
        created_at=menu_item.created_at,
    )


@router.put("/menu/{store_id}/{menu_id}", response_model=MenuItemResponse)
def update_store_menu_item(
    store_id: str,
    menu_id: str,
    payload: MenuItemUpdateRequest,
    session: Session = Depends(get_session),
) -> MenuItemResponse:
    """Updates an existing StoreMenuItem."""
    item = session.get(StoreMenuItem, menu_id)
    if not item or item.store_id != store_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item tidak ditemukan.")

    if payload.food_name is not None:
        item.food_name = payload.food_name.strip()
    if payload.original_price is not None:
        item.original_price = payload.original_price
    if payload.typical_cooking_time is not None:
        item.typical_cooking_time = payload.typical_cooking_time
    if payload.default_hours_cooked is not None:
        item.default_hours_cooked = payload.default_hours_cooked
    if payload.ingredients is not None:
        item.ingredients = payload.ingredients
    if payload.portion_size is not None:
        item.portion_size = payload.portion_size
    if payload.image_url is not None:
        item.image_url = payload.image_url
    if payload.is_active is not None:
        item.is_active = payload.is_active

    if payload.food_name is not None or payload.ingredients is not None or payload.default_hours_cooked is not None:
        safety = evaluate_food_safety(
            food_name=item.food_name,
            raw_text=item.ingredients,
            hours_since_cooked=item.default_hours_cooked,
        )
        if safety["safety_status"] == "REJECTED" or not safety["can_publish"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ditolak BPOM: {safety['safety_reason']}",
            )
        item.canonical_bpom_dish = safety["matched_canonical_dish"]
        item.category = safety["category"]
        item.bpom_max_hours = safety["bpom_max_hours"]

    session.add(item)
    session.commit()
    session.refresh(item)

    return MenuItemResponse(
        id=item.id,
        store_id=item.store_id,
        food_name=item.food_name,
        original_price=item.original_price,
        typical_cooking_time=item.typical_cooking_time,
        default_hours_cooked=item.default_hours_cooked,
        ingredients=item.ingredients,
        canonical_bpom_dish=item.canonical_bpom_dish,
        category=item.category,
        bpom_max_hours=item.bpom_max_hours,
        portion_size=getattr(item, "portion_size", "Reguler") or "Reguler",
        image_url=item.image_url,
        is_active=item.is_active,
        created_at=item.created_at,
    )


@router.delete("/menu/{store_id}/{menu_id}")
def delete_store_menu_item(
    store_id: str, menu_id: str, session: Session = Depends(get_session)
) -> dict[str, Any]:
    """Deactivates a StoreMenuItem from the store's master catalog."""
    item = session.get(StoreMenuItem, menu_id)
    if not item or item.store_id != store_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item tidak ditemukan.")

    item.is_active = False
    session.add(item)
    session.commit()
    return {"status": "deactivated", "id": menu_id}


# ============================================================================
# 2. CONTEXT-AWARE LISTING DRAFT & PUBLISH
# ============================================================================

@router.post("/listings/draft", response_model=DraftResponse)
async def create_draft_listing(
    request: DraftRequest, session: Session = Depends(get_session)
) -> DraftResponse:
    """Extracts entities from merchant voice/text prompt with Context-Aware Dual-Mode Slot Filling."""
    extracted = await extract_listing_entities(request.text, request.audio_base64)
    if extracted.get("has_negative_value", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Harga atau jumlah porsi tidak boleh bernilai negatif.",
        )
    target_store_id = request.store_id or "FTUI-001"

    # Fetch store details
    store_stmt = select(Store).where(Store.store_id == target_store_id)
    store = session.exec(store_stmt).first()
    store_closing = store.closing_time if store else (request.store_closing_time or "20:30")

    # Fetch catalog items for this store
    catalog_stmt = select(StoreMenuItem).where(
        StoreMenuItem.store_id == target_store_id, StoreMenuItem.is_active == True
    )
    catalog_items = session.exec(catalog_stmt).all()

    # Search for catalog match
    matched_menu: Optional[StoreMenuItem] = None
    raw_lower = request.text.lower()
    extracted_name_lower = extracted["food_name"].lower()

    for item in catalog_items:
        item_lower = item.food_name.lower()
        if (
            item_lower in raw_lower
            or item_lower in extracted_name_lower
            or extracted_name_lower in item_lower
            or any(word in raw_lower for word in item_lower.split() if len(word) >= 4)
        ):
            matched_menu = item
            break

    # Context-Aware Slot Resolution
    if matched_menu:
        food_name = matched_menu.food_name
        image_url = matched_menu.image_url
        # Price resolution
        if not extracted.get("price_mentioned", False):
            original_price = matched_menu.original_price
            needs_manual_price = False
        else:
            original_price = extracted["original_price"]
            needs_manual_price = False

        # Cooking time resolution
        if not extracted.get("cooking_time_mentioned", False):
            hours_since_cooked = matched_menu.default_hours_cooked
            catalog_match_status = "MATCHED_CATALOG"
        else:
            hours_since_cooked = extracted["hours_since_cooked"]
            catalog_match_status = "MATCHED_WITH_OVERRIDE"

        can_save_to_catalog = False
        matched_menu_item_id = matched_menu.id
    else:
        # Ad-hoc item
        food_name = extracted["food_name"]
        image_url = None
        can_save_to_catalog = True
        matched_menu_item_id = None
        hours_since_cooked = extracted["hours_since_cooked"]

        if extracted.get("price_mentioned", False):
            original_price = extracted["original_price"]
            catalog_match_status = "ADHOC_COMPLETE"
            needs_manual_price = False
        else:
            original_price = extracted["original_price"]  # default placeholder 20000
            catalog_match_status = "ADHOC_NEEDS_PRICE"
            needs_manual_price = True

    if extracted["quantity"] > 200 or original_price > 2000000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kuantitas porsi (maks 200) atau harga normal (maks Rp 2.000.000) melampaui batas kewajaran retail.",
        )

    # Closing minutes calculation: use prompt if explicitly mentioned, else real compute
    if extracted.get("explicit_closing_mentioned", False):
        minutes_until_closing = extracted["minutes_until_closing"]
    else:
        minutes_until_closing = compute_minutes_until_closing(store_closing)

    # Food safety guardrail evaluation
    safety = await asyncio.to_thread(
        evaluate_food_safety,
        food_name=food_name,
        raw_text=request.text,
        hours_since_cooked=hours_since_cooked,
    )

    can_save_to_catalog = bool(can_save_to_catalog and safety["safety_status"] == "SAFE" and safety["can_publish"])

    # Dynamic pricing computation
    pricing = calculate_dynamic_pricing(
        original_price=original_price,
        minutes_until_closing=minutes_until_closing,
        quantity=extracted["quantity"],
    )

    return DraftResponse(
        food_name=food_name,
        matched_canonical_dish=safety["matched_canonical_dish"],
        category=safety["category"],
        quantity=extracted["quantity"],
        original_price=original_price,
        recommended_discount_percent=pricing["discount_percent"],
        discounted_price=pricing["discounted_price"],
        hours_since_cooked=hours_since_cooked,
        bpom_max_hours=safety["bpom_max_hours"],
        minutes_until_closing=minutes_until_closing,
        safety_status=safety["safety_status"],
        safety_reason=safety["safety_reason"],
        hazard_description=safety["hazard_description"],
        regulation_ref=safety["regulation_ref"],
        similarity_score=safety["similarity_score"],
        extraction_source=extracted["extraction_source"],
        can_publish=safety["can_publish"],
        portion_size=extracted.get("portion_size", "Reguler") or "Reguler",
        store_id=target_store_id,
        catalog_match_status=catalog_match_status,
        matched_menu_item_id=matched_menu_item_id,
        needs_manual_price=needs_manual_price,
        can_save_to_catalog=can_save_to_catalog,
        closing_time=store_closing,
        image_url=image_url,
    )


@router.post("/listings/publish", response_model=ItemListing)
def publish_listing(
    payload: PublishRequest, session: Session = Depends(get_session)
) -> ItemListing:
    """Publishes a validated surplus food listing to the active marketplace catalog.
    Enforces hard food safety guardrail: raises HTTP 400 if safety_status is REJECTED.
    """
    server_eval = evaluate_food_safety(
        food_name=payload.food_name,
        raw_text=payload.food_name,
        hours_since_cooked=payload.hours_since_cooked,
    )
    if (
        payload.safety_status == "REJECTED"
        or payload.hours_since_cooked > payload.bpom_max_hours
        or server_eval["safety_status"] == "REJECTED"
        or not server_eval["can_publish"]
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Listing ditolak oleh Guardrail Keamanan Pangan BPOM: {server_eval.get('safety_reason', 'Bahan berbahaya atau kadaluarsa.')}",
        )

    discount_percent = max(50, min(70, payload.discount_percent))
    if payload.discounted_price is not None and payload.discounted_price > 0:
        discounted_price = payload.discounted_price
    else:
        raw_price = payload.original_price * (1.0 - discount_percent / 100.0)
        discounted_price = int((raw_price // 100) * 100)

    image_url = payload.image_url
    if payload.is_bundle and not image_url:
        image_url = "/assets/foods/mystery_bag.jpg"

    listing = ItemListing(
        store_id=payload.store_id,
        store_name=payload.store_name,
        location_badge=payload.location_badge,
        maps_url=f"https://maps.google.com/?q={payload.latitude},{payload.longitude}",
        latitude=payload.latitude,
        longitude=payload.longitude,
        closing_time=payload.closing_time,
        is_bundle=payload.is_bundle,
        bundled_items_json=payload.bundled_items_json,
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
        portion_size=payload.portion_size or "Reguler",
        image_url=image_url,
        is_active=True,
    )

    session.add(listing)
    session.commit()
    session.refresh(listing)
    return listing


# ============================================================================
# 3. SMART MYSTERY BAG BUNDLING ENGINE
# ============================================================================

@router.post("/listings/smart-bundle", response_model=ItemListing)
def create_smart_bundle(
    payload: SmartBundleRequest, session: Session = Depends(get_session)
) -> ItemListing:
    """Combines low-stock (1-2 portions) items into a discounted surprise Mystery Bag listing."""
    target_store_id = payload.store_id or "FTUI-001"

    # Query eligible listings: active, not bundle, safe, quantity in [1, 2]
    statement = (
        select(ItemListing)
        .where(
            ItemListing.store_id == target_store_id,
            ItemListing.is_active == True,
            ItemListing.is_bundle == False,
            ItemListing.safety_status == "SAFE",
            ItemListing.quantity >= 1,
            ItemListing.quantity <= 2,
        )
    )
    eligible_items = session.exec(statement).all()

    if len(eligible_items) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Minimal 2 menu aktif berporsi kecil (1-2 porsi) diperlukan untuk membuat Mystery Bag.",
        )

    total_original_price = sum(item.original_price * item.quantity for item in eligible_items)
    clamped_discount = max(60, min(70, payload.discount_percent))
    raw_discounted = total_original_price * (1.0 - clamped_discount / 100.0)
    discounted_price = int((raw_discounted // 100) * 100)

    bundle_hours_cooked = max(item.hours_since_cooked for item in eligible_items)
    bundle_bpom_max = min(item.bpom_max_hours for item in eligible_items)

    if bundle_hours_cooked > bundle_bpom_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batas umur simpan mikrobiologis terketat terlampaui ({bundle_hours_cooked}j > {bundle_bpom_max}j).",
        )

    # Determine bundle title
    if payload.custom_bundle_name and payload.custom_bundle_name.strip():
        bundle_name = payload.custom_bundle_name.strip()
    elif all(item.category == "LOW_PERISHABILITY" for item in eligible_items):
        bundle_name = "Mystery Bakery & Pastry Bag"
    else:
        bundle_name = "Paket Kejutan Lauk & Makanan Hemat (Surprise Bag)"

    # Build bundled items JSON with ingredients and allergen tags
    bundled_items_data = []
    for item in eligible_items:
        stmt_menu = select(StoreMenuItem).where(
            StoreMenuItem.store_id == target_store_id,
            StoreMenuItem.food_name == item.food_name,
        )
        matched_cat = session.exec(stmt_menu).first()
        if matched_cat and matched_cat.ingredients:
            ing_str = matched_cat.ingredients
        else:
            dish_match, _ = vector_store.search_similar_dish(item.food_name)
            ing_raw = dish_match.get("ingredients", [])
            ing_str = ", ".join(ing_raw) if isinstance(ing_raw, list) else str(ing_raw)
            if not ing_str:
                ing_str = "Bahan pangan olahan segar pilihan dapur"

        tags = _detect_allergen_tags(f"{item.food_name} {ing_str}")
        ing_list = [i.strip() for i in ing_str.split(",") if i.strip()]
        bundled_items_data.append({
            "food_name": item.food_name,
            "quantity": item.quantity,
            "original_price": item.original_price,
            "ingredients": ing_list,
            "allergen_tags": tags,
        })
    bundled_json = json.dumps(bundled_items_data, ensure_ascii=False)

    # Deactivate individual items in the same transaction
    for item in eligible_items:
        item.is_active = False
        item.quantity = 0
        session.add(item)

    base = eligible_items[0]
    bundle_listing = ItemListing(
        store_id=target_store_id,
        store_name=base.store_name,
        location_badge=base.location_badge,
        maps_url=base.maps_url,
        latitude=base.latitude,
        longitude=base.longitude,
        closing_time=base.closing_time,
        is_bundle=True,
        bundled_items_json=bundled_json,
        food_name=bundle_name,
        matched_canonical_dish="Mystery Bag Surprise",
        category=base.category,
        quantity=1,
        initial_quantity=1,
        original_price=total_original_price,
        discounted_price=discounted_price,
        discount_percent=clamped_discount,
        hours_since_cooked=bundle_hours_cooked,
        bpom_max_hours=bundle_bpom_max,
        minutes_until_closing=min(item.minutes_until_closing for item in eligible_items),
        safety_status="SAFE",
        safety_reason=f"Mystery bag menggabungkan {len(eligible_items)} menu dengan batas konsumsi terketat {bundle_bpom_max} jam.",
        hazard_description="Paket makanan kombinasi tersertifikasi aman mikrobiologis PerBPOM No. 16/2019.",
        regulation_ref="PerBPOM No. 16/2019 Rekomendasi Bundling",
        similarity_score=0.95,
        image_url="/assets/foods/mystery_bag.jpg",
        is_active=True,
    )

    session.add(bundle_listing)
    session.commit()
    session.refresh(bundle_listing)
    return bundle_listing


# ============================================================================
# 4. ACTIVE CATALOG & ORDERS
# ============================================================================

@router.get("/listings/active", response_model=List[ItemListing])
def get_active_listings(
    store_id: Optional[str] = None, session: Session = Depends(get_session)
) -> List[ItemListing]:
    """Retrieves all active surplus food listings with quantity > 0 sorted by latest first."""
    statement = (
        select(ItemListing)
        .where(ItemListing.is_active == True, ItemListing.quantity > 0)
    )
    if store_id:
        statement = statement.where(ItemListing.store_id == store_id)

    statement = statement.order_by(ItemListing.created_at.desc())
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
    customer = payload.customer_name.strip() or "Konsumen NullWasted"
    phone = payload.customer_phone.strip() or "0812-8899-0011"
    payment_method = payload.payment_method or "CASH_ON_PICKUP"
    payment_status = "PAID" if payment_method == "SIMULATED_QRIS" else "UNPAID"

    qr_payload = f"NULLWASTED|ORDER:{order_code}|STORE:{listing.store_id}|ITEM:{listing.id}|QTY:{payload.quantity}|USER:{customer}"

    ticket = OrderTicket(
        order_code=order_code,
        store_id=listing.store_id,
        customer_name=customer,
        customer_phone=phone,
        listing_id=listing.id,
        food_name=listing.food_name,
        store_name=listing.store_name,
        location_badge=listing.location_badge,
        image_url=listing.image_url,
        quantity=payload.quantity,
        unit_price=listing.discounted_price,
        total_price=total_price,
        pickup_deadline=f"Sebelum toko tutup ({listing.minutes_until_closing} menit lagi)",
        qr_payload=qr_payload,
        payment_method=payment_method,
        payment_status=payment_status,
        status="RESERVED",
    )

    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    return ticket


@router.get("/orders/active", response_model=List[OrderTicket])
def get_active_orders(
    store_id: Optional[str] = None,
    customer_phone: Optional[str] = None,
    customer_name: Optional[str] = None,
    session: Session = Depends(get_session),
) -> List[OrderTicket]:
    """Retrieves order tickets with optional multi-tenant filtering (store_id or customer_phone)."""
    statement = select(OrderTicket)
    if store_id:
        statement = statement.where(OrderTicket.store_id == store_id)
    if customer_phone:
        statement = statement.where(OrderTicket.customer_phone == customer_phone)
    elif customer_name:
        statement = statement.where(OrderTicket.customer_name == customer_name)

    statement = statement.order_by(OrderTicket.created_at.desc())
    results = session.exec(statement).all()
    return list(results)


@router.post("/orders/{order_id}/cancel", response_model=OrderTicket)
def cancel_order(
    order_id: str, session: Session = Depends(get_session)
) -> OrderTicket:
    """Cancels a reserved order and atomically rolls back stock to the listing."""
    ticket = session.get(OrderTicket, order_id)
    if not ticket:
        # Search by order_code as fallback
        statement = select(OrderTicket).where(OrderTicket.order_code == order_id)
        ticket = session.exec(statement).first()

    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tiket pesanan tidak ditemukan.")

    if ticket.status == "CANCELLED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tiket sudah berstatus DIBATALKAN.")

    if ticket.status == "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tiket sudah COMPLETED dan diambil. Tidak dapat dibatalkan.",
        )

    ticket.status = "CANCELLED"
    ticket.cancelled_at = utc_now_iso()
    if ticket.payment_status == "PAID":
        ticket.payment_status = "REFUNDED"

    session.add(ticket)

    # Atomic stock rollback
    listing = session.get(ItemListing, ticket.listing_id)
    if listing:
        listing.quantity += ticket.quantity
        listing.is_active = True
        session.add(listing)

    session.commit()
    session.refresh(ticket)
    return ticket


@router.post("/orders/complete-pickup", response_model=OrderTicket)
def complete_order_pickup(
    payload: CompletePickupRequest, session: Session = Depends(get_session)
) -> OrderTicket:
    """Validates order ticket pickup code at cashier with cross-store fraud detection."""
    raw_code = payload.order_code.strip()

    # Normalize order code or QR payload
    normalized_code = raw_code.upper()
    if "ORDER:" in normalized_code:
        parts = normalized_code.split("ORDER:")
        if len(parts) > 1:
            extracted_code = parts[1].split("|")[0].strip()
            normalized_code = extracted_code

    if not normalized_code.startswith("#") and normalized_code.startswith("NW-"):
        normalized_code = f"#{normalized_code}"
    elif normalized_code.isdigit() and len(normalized_code) == 4:
        normalized_code = f"#NW-{normalized_code}"

    # Search by order_code or full qr_payload
    statement = select(OrderTicket).where(
        (OrderTicket.order_code == normalized_code) | (OrderTicket.qr_payload == raw_code)
    )
    ticket = session.exec(statement).first()

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kode pesanan tidak ditemukan di database.",
        )

    if ticket.status == "CANCELLED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tiket pesanan ini telah dibatalkan oleh konsumen.",
        )

    if ticket.status == "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tiket pesanan ini sudah pernah diverifikasi dan diserahterimakan sebelumnya.",
        )

    # Cross-Store Cashier Fraud Validation
    if payload.store_id and ticket.store_id != payload.store_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"PENOLAKAN KEAMANAN LINTAS GERAI: Tiket {ticket.order_code} adalah pesanan milik gerai {ticket.store_name} ({ticket.store_id}), bukan gerai Anda!",
        )

    ticket.status = "COMPLETED"
    ticket.payment_status = "PAID"
    ticket.completed_at = utc_now_iso()
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
