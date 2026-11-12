"""Comprehensive edge-case regression suite covering Sprint 3 system hardening."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.database import get_session
from app.core.security import hash_pin, hash_pin_pbkdf2, verify_pin
from app.core.seed import seed_initial_data
from app.main import app
from app.models.listing import ItemListing, OrderTicket
from app.services.vector_store import vector_store


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_initial_data(session)
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def _insert_listing(
    session: Session,
    *,
    store_id: str = "FTUI-001",
    food_name: str = "Roti Brioche",
    quantity: int = 3,
    expires_at: datetime | None = None,
    is_active: bool = True,
) -> ItemListing:
    listing = ItemListing(
        store_id=store_id,
        store_name="Dapur Barokah" if store_id == "FTUI-001" else "Warung Margonda",
        location_badge="Kantin FTUI",
        maps_url="https://maps.google.com/?q=-6.3621,106.8246",
        latitude=-6.3621,
        longitude=106.8246,
        closing_time="23:59",
        food_name=food_name,
        matched_canonical_dish="Roti Brioche",
        category="LOW_PERISHABILITY",
        quantity=quantity,
        initial_quantity=quantity,
        original_price=20000,
        discounted_price=10000,
        discount_percent=50,
        hours_since_cooked=1.0,
        bpom_max_hours=24.0,
        minutes_until_closing=120,
        safety_status="SAFE",
        safety_reason="Aman suhu ruang",
        hazard_description="Rendah risiko",
        regulation_ref="PerBPOM No. 16/2019",
        expires_at=expires_at,
        is_active=is_active,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)
    return listing


def test_atomic_checkout_exhausted_stock_returns_409(client: TestClient, session: Session):
    """Verifies atomic SQL stock decrement prevents negative inventory and returns HTTP 409."""
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    single_item = _insert_listing(session, food_name="Matcha Roll", quantity=1, expires_at=future)

    res1 = client.post(
        "/api/v1/orders/reserve",
        json={
            "listing_id": single_item.id,
            "quantity": 1,
            "customer_name": "Budi",
            "customer_phone": "0812-8899-0011",
            "payment_method": "CASH_ON_PICKUP",
        },
    )
    assert res1.status_code == 200

    res2 = client.post(
        "/api/v1/orders/reserve",
        json={
            "listing_id": single_item.id,
            "quantity": 1,
            "customer_name": "Siti",
            "customer_phone": "0813-9988-7766",
            "payment_method": "CASH_ON_PICKUP",
        },
    )
    assert res2.status_code == 409

    multi_item = _insert_listing(session, food_name="Choco Muffin", quantity=2, expires_at=future)
    res_oversell = client.post(
        "/api/v1/orders/reserve",
        json={
            "listing_id": multi_item.id,
            "quantity": 5,
            "customer_name": "Siti",
            "customer_phone": "0813-9988-7766",
            "payment_method": "CASH_ON_PICKUP",
        },
    )
    assert res_oversell.status_code == 409
    session.refresh(multi_item)
    assert multi_item.quantity == 2


def test_cashier_order_code_normalization_variants(client: TestClient, session: Session):
    """Verifies bare digits (8888), #8888, and #NW-8888 all resolve during cashier pickup."""
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    item = _insert_listing(session, food_name="Bagel Wijen", quantity=5, expires_at=future)

    orders = []
    for idx in range(3):
        res = client.post(
            "/api/v1/orders/reserve",
            json={
                "listing_id": item.id,
                "quantity": 1,
                "customer_name": f"Pembeli {idx}",
                "customer_phone": f"08128899001{idx}",
                "payment_method": "CASH_ON_PICKUP",
            },
        )
        assert res.status_code == 200
        orders.append(res.json())

    digits_0 = orders[0]["order_code"].replace("#NW-", "")
    digits_1 = orders[1]["order_code"].replace("#NW-", "")
    digits_2 = orders[2]["order_code"].replace("#NW-", "")

    r0 = client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": digits_0, "store_id": "FTUI-001"},
    )
    assert r0.status_code == 200
    assert r0.json()["status"] == "COMPLETED"

    r1 = client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": f"#{digits_1}", "store_id": "FTUI-001"},
    )
    assert r1.status_code == 200
    assert r1.json()["status"] == "COMPLETED"

    r2 = client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": f"  #nw-{digits_2} ", "store_id": "FTUI-001"},
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "COMPLETED"


def test_cross_store_pickup_rejection_403(client: TestClient, session: Session):
    """Verifies another merchant store cannot claim or complete someone else's order."""
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    item = _insert_listing(session, store_id="FTUI-001", food_name="Nasi Uduk", quantity=2, expires_at=future)

    order = client.post(
        "/api/v1/orders/reserve",
        json={
            "listing_id": item.id,
            "quantity": 1,
            "customer_name": "Budi",
            "customer_phone": "081288990011",
            "payment_method": "CASH_ON_PICKUP",
        },
    ).json()

    forbidden = client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": order["order_code"], "store_id": "MARGONDA-042"},
    )
    assert forbidden.status_code == 403

    ticket = session.get(OrderTicket, order["id"])
    assert ticket is not None
    assert ticket.status != "COMPLETED"


def test_bug28_guardrail_rejects_spoilage_on_publish_with_keyword_args(client: TestClient):
    """Verifies publish_listing rejects HIGH_PERISHABILITY >4h despite spoofed safety_status."""
    res = client.post(
        "/api/v1/listings/publish",
        json={
            "food_name": "Klappertaart Santan",
            "matched_canonical_dish": "Klappertaart Coconut Custard",
            "category": "HIGH_PERISHABILITY",
            "quantity": 3,
            "original_price": 30000,
            "discount_percent": 50,
            "hours_since_cooked": 6.5,
            "bpom_max_hours": 4.0,
            "minutes_until_closing": 60,
            "safety_status": "SAFE",
            "safety_reason": "Spoofed SAFE",
            "hazard_description": "Spoofed",
            "store_id": "FTUI-001",
            "closing_time": "23:59",
        },
    )
    assert res.status_code == 400


def test_expired_listing_excluded_from_active_feed(client: TestClient, session: Session):
    """Verifies listings past expires_at are hidden from /api/v1/listings/active."""
    past = datetime.now(timezone.utc) - timedelta(minutes=15)
    future = datetime.now(timezone.utc) + timedelta(hours=3)
    expired = _insert_listing(session, food_name="Expired Croissant", quantity=3, expires_at=past)
    fresh = _insert_listing(session, food_name="Fresh Croissant", quantity=3, expires_at=future)

    active_ids = {row["id"] for row in client.get("/api/v1/listings/active").json()}
    assert expired.id not in active_ids
    assert fresh.id in active_ids


def test_order_cancel_does_not_revive_expired_listing(client: TestClient, session: Session):
    """Verifies cancelling an order for an expired listing does not re-activate it."""
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    item = _insert_listing(session, food_name="Ephemeral Donut", quantity=1, expires_at=future)

    order = client.post(
        "/api/v1/orders/reserve",
        json={
            "listing_id": item.id,
            "quantity": 1,
            "customer_name": "Budi",
            "customer_phone": "081288990011",
            "payment_method": "CASH_ON_PICKUP",
        },
    ).json()

    session.refresh(item)
    assert item.quantity == 0
    assert item.is_active is False

    item.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    session.add(item)
    session.commit()

    cancel_res = client.post(
        f"/api/v1/orders/{order['id']}/cancel",
        json={"customer_phone": "081288990011"},
    )
    assert cancel_res.status_code == 200

    session.refresh(item)
    assert item.is_active is False
    active_ids = {row["id"] for row in client.get("/api/v1/listings/active").json()}
    assert item.id not in active_ids


def test_pydantic_validators_reject_malformed_inputs_422(client: TestClient):
    """Verifies Pydantic rejects invalid Indonesian phone numbers, closing times, and PINs."""
    bad_phone_1 = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "User Satu", "phone": "12345", "address": "Depok"},
    )
    assert bad_phone_1.status_code == 422

    bad_phone_2 = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "User Dua", "phone": "07123456789", "address": "Depok"},
    )
    assert bad_phone_2.status_code == 422

    bad_time = client.post(
        "/api/v1/auth/merchant-register",
        json={
            "name": "Toko Test",
            "pin": "1234",
            "location_name": "Jalan Margonda Raya No. 1",
            "closing_time": "25:99",
        },
    )
    assert bad_time.status_code == 422

    bad_pin = client.post(
        "/api/v1/auth/merchant-register",
        json={
            "name": "Toko Test",
            "pin": "ab12",
            "location_name": "Jalan Margonda Raya No. 1",
            "closing_time": "21:30",
        },
    )
    assert bad_pin.status_code == 422


def test_bilingual_english_fusion_food_mapping():
    """Verifies Roasted Chicken and Cheesecake map to the expanded BPOM knowledge base."""
    chicken_match, chicken_score = vector_store.search_similar_dish("Roasted Chicken")
    assert chicken_score >= 0.85
    assert "Roasted Chicken" in chicken_match["canonical_name"]
    assert chicken_match["category"] == "MEDIUM_PERISHABILITY"
    assert chicken_match["bpom_max_hours"] == 8.0

    cake_match, cake_score = vector_store.search_similar_dish("Cheesecake")
    assert cake_score >= 0.85
    assert "Cheesecake" in cake_match["canonical_name"]
    assert cake_match["category"] == "HIGH_PERISHABILITY"
    assert cake_match["bpom_max_hours"] == 4.0


def test_pbkdf2_hashing_and_legacy_sha256_fallback():
    """Verifies PBKDF2 hashing and backward-compatible SHA-256 verification."""
    pbkdf2_digest = hash_pin_pbkdf2("4321")
    legacy_digest = hash_pin("4321")

    assert pbkdf2_digest.startswith("pbkdf2_sha256$")
    assert verify_pin("4321", pbkdf2_digest) is True
    assert verify_pin("9999", pbkdf2_digest) is False

    assert verify_pin("4321", legacy_digest) is True
    assert verify_pin("9999", legacy_digest) is False


def test_food_type_separation_and_seblak_accepted(client: TestClient):
    """Verifies Es Cendol Durian -> BEVERAGE, Croissant -> BAKERY, Seblak -> MEAL & safe."""
    from app.services.guardrail import evaluate_food_safety

    res_cendol = evaluate_food_safety(
        "Es Cendol Durian",
        hours_since_cooked=1.0,
        ai_is_edible=True,
        ai_food_type="BEVERAGE",
    )
    assert res_cendol["can_publish"] is True
    assert res_cendol["safety_status"] == "SAFE"
    assert res_cendol["food_type"] == "BEVERAGE"

    res_croissant = evaluate_food_safety(
        "Croissant Mentega",
        hours_since_cooked=2.0,
        ai_is_edible=True,
        ai_food_type="BAKERY",
    )
    assert res_croissant["can_publish"] is True
    assert res_croissant["safety_status"] == "SAFE"
    assert res_croissant["food_type"] == "BAKERY"

    res_seblak = evaluate_food_safety(
        "Seblak Ceker",
        hours_since_cooked=1.5,
        ai_is_edible=True,
        ai_food_type="MEAL",
    )
    assert res_seblak["can_publish"] is True
    assert res_seblak["safety_status"] == "SAFE"
    assert res_seblak["food_type"] == "MEAL"

    # Non-food remains strictly rejected even if AI fails to flag it
    res_shoe = evaluate_food_safety(
        "Sepatu Kulit",
        hours_since_cooked=1.0,
        ai_is_edible=False,
    )
    assert res_shoe["can_publish"] is False
    assert res_shoe["safety_status"] == "REJECTED"


def test_bekasi_store_registration_pinpoint_and_optional_consumer_address(client: TestClient):
    """Verifies non-FTUI coordinates (Bekasi) are preserved, pinpoints update/remove cleanly, and consumer address is optional."""
    bekasi_lat, bekasi_lng = -6.2383, 106.9756

    reg_res = client.post(
        "/api/v1/auth/merchant-register",
        json={
            "name": "Warung Bekasi Raya",
            "pin": "2468",
            "location_name": "Bekasi Timur",
            "closing_time": "21:30",
            "latitude": bekasi_lat,
            "longitude": bekasi_lng,
        },
    )
    assert reg_res.status_code == 200
    merchant = reg_res.json()
    store_id = merchant["store_id"]
    token = merchant["token"]
    assert merchant["latitude"] == pytest.approx(bekasi_lat)
    assert merchant["longitude"] == pytest.approx(bekasi_lng)

    # Store must appear in GET /api/v1/auth/stores even before publishing any listing
    stores_res = client.get("/api/v1/auth/stores")
    assert stores_res.status_code == 200
    bekasi_store = next((s for s in stores_res.json() if s["store_id"] == store_id), None)
    assert bekasi_store is not None
    assert bekasi_store["latitude"] == pytest.approx(bekasi_lat)
    assert bekasi_store["longitude"] == pytest.approx(bekasi_lng)

    # Publishing without explicit lat/lng must inherit the Bekasi store coordinates, never FTUI defaults
    pub_res = client.post(
        "/api/v1/listings/publish",
        json={
            "food_name": "Es Cendol Durian",
            "matched_canonical_dish": "Es Cendol",
            "original_price": 25000,
            "discounted_price": 10000,
            "discount_percent": 60,
            "hours_since_cooked": 1.0,
            "category": "MEDIUM_PERISHABILITY",
            "food_type": "BEVERAGE",
            "bpom_max_hours": 8.0,
            "minutes_until_closing": 120,
            "safety_status": "SAFE",
            "safety_reason": "Minuman segar layak konsumsi.",
            "hazard_description": "Sesuai batas suhu ruang PerBPOM.",
            "regulation_ref": "PerBPOM No. 16 Tahun 2019",
            "quantity": 3,
            "store_id": store_id,
            "store_name": "Warung Bekasi Raya",
            "location_badge": "Bekasi Timur",
            "closing_time": "21:30",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert pub_res.status_code == 200
    published = pub_res.json()
    assert published["latitude"] == pytest.approx(bekasi_lat)
    assert published["longitude"] == pytest.approx(bekasi_lng)
    assert published["food_type"] == "BEVERAGE"

    # Store pinpoint move & clear (remove location)
    moved_res = client.put(
        f"/api/v1/auth/stores/{store_id}/location",
        json={"latitude": -6.25, "longitude": 107.0, "location_name": "Bekasi Selatan"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert moved_res.status_code == 200
    assert moved_res.json()["latitude"] == pytest.approx(-6.25)

    removed_res = client.patch(
        f"/api/v1/auth/stores/{store_id}/location",
        json={"latitude": None, "longitude": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert removed_res.status_code == 200
    assert removed_res.json()["latitude"] is None
    assert removed_res.json()["longitude"] is None

    # Consumer registration succeeds without address
    cons_res = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "Pembeli Bekasi", "phone": "081299988877"},
    )
    assert cons_res.status_code == 200
    assert cons_res.json()["customer_name"] == "Pembeli Bekasi"
