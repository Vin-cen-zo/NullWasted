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
    """Verifies Pydantic rejects invalid emails, short passwords, invalid phones, and closing times."""
    bad_email_consumer = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "User Satu", "email": "bukan-email", "password": "password123", "address": "Depok"},
    )
    assert bad_email_consumer.status_code == 422

    bad_pw_consumer = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "User Satu", "email": "satu@nullwasted.id", "password": "123", "address": "Depok"},
    )
    assert bad_pw_consumer.status_code == 422

    bad_phone_1 = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "User Satu", "email": "satu@nullwasted.id", "password": "password123", "phone": "12345", "address": "Depok"},
    )
    assert bad_phone_1.status_code == 422

    bad_phone_2 = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "User Dua", "email": "dua@nullwasted.id", "password": "password123", "phone": "07123456789", "address": "Depok"},
    )
    assert bad_phone_2.status_code == 422

    bad_time = client.post(
        "/api/v1/auth/merchant-register",
        json={
            "name": "Toko Test",
            "email": "tokotest@nullwasted.id",
            "password": "password123",
            "location_name": "Jalan Margonda Raya No. 1",
            "closing_time": "25:99",
        },
    )
    assert bad_time.status_code == 422

    bad_merchant_pw = client.post(
        "/api/v1/auth/merchant-register",
        json={
            "name": "Toko Test",
            "email": "tokotest2@nullwasted.id",
            "password": "123",
            "location_name": "Jalan Margonda Raya No. 1",
            "closing_time": "21:30",
        },
    )
    assert bad_merchant_pw.status_code == 422


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
            "email": "warungbekasi@nullwasted.id",
            "password": "bekasi1234",
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

    # Consumer registration succeeds without address (email + password, optional phone)
    cons_res = client.post(
        "/api/v1/auth/consumer-register",
        json={
            "name": "Pembeli Bekasi",
            "email": "pembeli.bekasi@nullwasted.id",
            "password": "pembeli123",
            "phone": "081299988877",
        },
    )
    assert cons_res.status_code == 200
    assert cons_res.json()["customer_name"] == "Pembeli Bekasi"


def test_publish_hardening_price_tamper_reclassify_ai_and_cooked_at(
    client: TestClient, session: Session, monkeypatch
):
    """Covers Group B: price tamper override, preview edit re-evaluation, unknown dish AI check, and future cooked_at_hhmm."""
    from app.api.v1 import listings as listings_api

    login_res = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "dapurbarokah@nullwasted.id", "password": "nullwasted123"},
    )
    token = login_res.json()["token"]
    sim_headers = {
        "Authorization": f"Bearer {token}",
        "X-Simulated-Time": "2026-11-12T12:00:00+07:00",
    }

    # 1. Price tamper override (spoofed discounted_price=1000 overridden to 16000 for 60% of 40000)
    res_tamper = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Croissant Mentega",
            "matched_canonical_dish": "Croissant Mentega",
            "original_price": 40000,
            "discounted_price": 1000,
            "discount_percent": 60,
            "hours_since_cooked": 1.0,
            "category": "LOW_PERISHABILITY",
            "food_type": "BAKERY",
            "bpom_max_hours": 24.0,
            "minutes_until_closing": 120,
            "safety_status": "SAFE",
            "safety_reason": "Roti aman.",
            "hazard_description": "Sesuai batas suhu ruang.",
            "regulation_ref": "PerBPOM No. 16/2019",
            "quantity": 2,
            "closing_time": "20:30",
        },
        headers=sim_headers,
    )
    assert res_tamper.status_code == 200
    assert res_tamper.json()["discounted_price"] == 16000
    assert res_tamper.json()["discount_percent"] == 60

    # 2. Preview edit spoofing (Croissant metadata -> Gulai Santan Padang) forces server re-evaluation
    res_reclass = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Gulai Santan Padang",
            "matched_canonical_dish": "Croissant",
            "original_price": 30000,
            "discounted_price": 15000,
            "discount_percent": 50,
            "hours_since_cooked": 2.0,
            "category": "LOW_PERISHABILITY",
            "food_type": "BAKERY",
            "bpom_max_hours": 24.0,
            "minutes_until_closing": 120,
            "safety_status": "SAFE",
            "safety_reason": "Spoofed",
            "hazard_description": "Spoofed",
            "regulation_ref": "PerBPOM",
            "quantity": 2,
            "closing_time": "20:30",
        },
        headers=sim_headers,
    )
    assert res_reclass.status_code == 200
    reclass_data = res_reclass.json()
    assert reclass_data["category"] == "HIGH_PERISHABILITY"
    assert reclass_data["bpom_max_hours"] == 4.0

    # 3. Unknown dish (< 0.72 similarity) triggers classify_dish_with_ai and rejects non-food / accepts valid regional dish
    async def fake_ai_nonfood(food_name: str, ingredients: str = ""):
        return {
            "is_edible_food": False,
            "food_type": "MEAL",
            "inferred_risk": "MEDIUM_PERISHABILITY",
            "canonical_match": food_name,
        }

    monkeypatch.setattr(listings_api, "classify_dish_with_ai", fake_ai_nonfood)
    res_nonfood = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Sabun Cuci Xylophone Z99",
            "matched_canonical_dish": "Sabun Cuci Xylophone",
            "original_price": 20000,
            "discounted_price": 10000,
            "discount_percent": 50,
            "hours_since_cooked": 1.0,
            "category": "MEDIUM_PERISHABILITY",
            "food_type": "MEAL",
            "bpom_max_hours": 8.0,
            "minutes_until_closing": 120,
            "safety_status": "SAFE",
            "safety_reason": "Bypass attempt",
            "hazard_description": "Bypass",
            "regulation_ref": "PerBPOM",
            "quantity": 1,
            "closing_time": "20:30",
        },
        headers=sim_headers,
    )
    assert res_nonfood.status_code == 400

    async def fake_ai_valid(food_name: str, ingredients: str = ""):
        return {
            "is_edible_food": True,
            "food_type": "MEAL",
            "inferred_risk": "MEDIUM_PERISHABILITY",
            "canonical_match": "Laksa Cibinong",
        }

    monkeypatch.setattr(listings_api, "classify_dish_with_ai", fake_ai_valid)
    res_regional = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Laksa Cibinong Z99",
            "matched_canonical_dish": "Laksa Cibinong",
            "original_price": 20000,
            "discounted_price": 10000,
            "discount_percent": 50,
            "hours_since_cooked": 1.0,
            "category": "MEDIUM_PERISHABILITY",
            "food_type": "MEAL",
            "bpom_max_hours": 8.0,
            "minutes_until_closing": 120,
            "safety_status": "SAFE",
            "safety_reason": "Valid",
            "hazard_description": "Safe",
            "regulation_ref": "PerBPOM",
            "quantity": 1,
            "closing_time": "20:30",
        },
        headers=sim_headers,
    )
    assert res_regional.status_code == 200

    # 4. Future cooked_at_hhmm at 12:00 WIB rejected HTTP 400
    res_future_cook = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Croissant Mentega",
            "matched_canonical_dish": "Croissant Mentega",
            "original_price": 20000,
            "discounted_price": 10000,
            "discount_percent": 50,
            "hours_since_cooked": 1.0,
            "cooked_at_hhmm": "15:00",
            "category": "LOW_PERISHABILITY",
            "food_type": "BAKERY",
            "bpom_max_hours": 24.0,
            "minutes_until_closing": 120,
            "safety_status": "SAFE",
            "safety_reason": "Valid",
            "hazard_description": "Safe",
            "regulation_ref": "PerBPOM",
            "quantity": 1,
            "closing_time": "20:30",
        },
        headers=sim_headers,
    )
    assert res_future_cook.status_code == 400


def test_ghost_publish_blocked_and_smart_bundle_expiry_clamp(client: TestClient, session: Session):
    """Covers Group C2 & C3: blocks post-closing Ghost Publish and clamps Smart Bundle expiry."""
    from datetime import timezone

    login_res = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "dapurbarokah@nullwasted.id", "password": "nullwasted123"},
    )
    token = login_res.json()["token"]

    # 1. Ghost publish at 21:00 WIB when closing_time=20:30 & minutes_until_closing=0 -> HTTP 400
    res_ghost = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Nasi Ayam Bakar",
            "matched_canonical_dish": "Nasi Ayam Bakar",
            "original_price": 24000,
            "discounted_price": 12000,
            "discount_percent": 50,
            "hours_since_cooked": 1.0,
            "category": "MEDIUM_PERISHABILITY",
            "food_type": "MEAL",
            "bpom_max_hours": 8.0,
            "minutes_until_closing": 0,
            "safety_status": "SAFE",
            "safety_reason": "Aman",
            "hazard_description": "Sesuai batas suhu ruang",
            "regulation_ref": "PerBPOM No. 16/2019",
            "quantity": 2,
            "closing_time": "20:30",
        },
        headers={
            "Authorization": f"Bearer {token}",
            "X-Simulated-Time": "2026-11-12T21:00:00+07:00",
        },
    )
    assert res_ghost.status_code == 400

    # 2. Smart Bundle ignores expired listing and clamps bundle expiry to shortest constituent expiry
    from sqlmodel import select
    for existing in session.exec(select(ItemListing).where(ItemListing.store_id == "FTUI-001")).all():
        existing.is_active = False
        session.add(existing)
    session.commit()

    sim_utc = datetime(2026, 11, 12, 5, 0, 0, tzinfo=timezone.utc)  # 12:00 WIB in UTC
    expired_item = ItemListing(
        id="EXPIRED-BUNDLE-CAND",
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        food_name="Ayam Basi Kedaluwarsa",
        matched_canonical_dish="Ayam Goreng",
        category="MEDIUM_PERISHABILITY",
        food_type="MEAL",
        quantity=2,
        initial_quantity=2,
        original_price=20000,
        discount_percent=50,
        discounted_price=10000,
        hours_since_cooked=2.0,
        bpom_max_hours=8.0,
        minutes_until_closing=60,
        closing_time="20:30",
        expires_at=sim_utc - timedelta(minutes=15),
        safety_status="SAFE",
        safety_reason="Ok",
        hazard_description="Sesuai batas suhu ruang",
        regulation_ref="PerBPOM No. 16/2019",
        is_active=True,
    )
    valid_tight_item = ItemListing(
        id="VALID-TIGHT-CAND-1",
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        food_name="Tempe Oregan Fresh",
        matched_canonical_dish="Tempe Oregan",
        category="MEDIUM_PERISHABILITY",
        food_type="MEAL",
        quantity=1,
        initial_quantity=1,
        original_price=15000,
        discount_percent=50,
        discounted_price=7500,
        hours_since_cooked=1.0,
        bpom_max_hours=8.0,
        minutes_until_closing=45,
        closing_time="20:30",
        expires_at=sim_utc + timedelta(minutes=45),
        safety_status="SAFE",
        safety_reason="Ok",
        hazard_description="Sesuai batas suhu ruang",
        regulation_ref="PerBPOM No. 16/2019",
        is_active=True,
    )
    valid_second_item = ItemListing(
        id="VALID-TIGHT-CAND-2",
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        food_name="Tahu Bacem",
        matched_canonical_dish="Tahu Bacem",
        category="MEDIUM_PERISHABILITY",
        food_type="MEAL",
        quantity=2,
        initial_quantity=2,
        original_price=15000,
        discount_percent=50,
        discounted_price=7500,
        hours_since_cooked=1.0,
        bpom_max_hours=8.0,
        minutes_until_closing=180,
        closing_time="20:30",
        expires_at=sim_utc + timedelta(hours=3),
        safety_status="SAFE",
        safety_reason="Ok",
        hazard_description="Sesuai batas suhu ruang",
        regulation_ref="PerBPOM No. 16/2019",
        is_active=True,
    )
    session.add(expired_item)
    session.add(valid_tight_item)
    session.add(valid_second_item)
    session.commit()

    res_bundle = client.post(
        "/api/v1/listings/smart-bundle",
        json={"store_id": "FTUI-001"},
        headers={
            "Authorization": f"Bearer {token}",
            "X-Simulated-Time": "2026-11-12T12:00:00+07:00",
        },
    )
    assert res_bundle.status_code == 200
    b_data = res_bundle.json()
    assert "Ayam Basi Kedaluwarsa" not in b_data.get("bundled_items_json", "")
    assert "Tempe Oregan Fresh" in b_data.get("bundled_items_json", "")
    bundle_exp = datetime.fromisoformat(b_data["expires_at"].replace("Z", ""))
    assert bundle_exp <= sim_utc.replace(tzinfo=None) + timedelta(minutes=46)


def test_reserve_expired_rejected_wib_deadline_and_init_db_pinpoint(
    client: TestClient, session: Session, monkeypatch
):
    """Covers Group C4 & C5: reserve rejects expired listing, formats WIB pickup_deadline, and init_db preserves pinpoint."""
    from datetime import timezone
    from app.core import database as db_mod

    sim_utc = datetime(2026, 11, 12, 5, 0, 0, tzinfo=timezone.utc)  # 12:00 WIB
    expired_item = ItemListing(
        id="RESV-EXPIRED-1",
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        food_name="Sate Expired",
        matched_canonical_dish="Sate Ayam",
        category="MEDIUM_PERISHABILITY",
        food_type="MEAL",
        quantity=4,
        initial_quantity=4,
        original_price=25000,
        discount_percent=50,
        discounted_price=12500,
        hours_since_cooked=2.0,
        bpom_max_hours=8.0,
        minutes_until_closing=60,
        closing_time="20:30",
        expires_at=sim_utc - timedelta(minutes=10),
        safety_status="SAFE",
        safety_reason="Ok",
        hazard_description="Sesuai batas suhu ruang",
        regulation_ref="PerBPOM No. 16/2019",
        is_active=True,
    )
    valid_item = ItemListing(
        id="RESV-VALID-1",
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        food_name="Roti Gandum Segar",
        matched_canonical_dish="Roti Gandum",
        category="LOW_PERISHABILITY",
        food_type="BAKERY",
        quantity=4,
        initial_quantity=4,
        original_price=20000,
        discount_percent=50,
        discounted_price=10000,
        hours_since_cooked=1.0,
        bpom_max_hours=24.0,
        minutes_until_closing=120,
        closing_time="20:30",
        expires_at=sim_utc + timedelta(hours=3),
        safety_status="SAFE",
        safety_reason="Ok",
        hazard_description="Sesuai batas suhu ruang",
        regulation_ref="PerBPOM No. 16/2019",
        is_active=True,
    )
    session.add(expired_item)
    session.add(valid_item)
    session.commit()

    r_exp = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": "RESV-EXPIRED-1", "quantity": 1, "customer_name": "Budi", "customer_phone": "081211122233"},
        headers={"X-Simulated-Time": "2026-11-12T12:00:00+07:00"},
    )
    assert r_exp.status_code == 400
    session.refresh(expired_item)
    assert expired_item.is_active is False

    r_ok = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": "RESV-VALID-1", "quantity": 1, "customer_name": "Budi", "customer_phone": "081211122233"},
        headers={"X-Simulated-Time": "2026-11-12T12:00:00+07:00"},
    )
    assert r_ok.status_code == 200
    assert "WIB" in r_ok.json()["pickup_deadline"]

    # C5: Custom store pinpoint must survive init_db()
    from app.models.listing import Store

    ftui_store = session.get(Store, "FTUI-001")
    ftui_store.latitude = -6.3111
    ftui_store.longitude = 106.8222
    ftui_store.location_name = "Pinpoint Custom Persisten"
    session.add(ftui_store)
    session.commit()

    monkeypatch.setattr(db_mod, "engine", session.get_bind())
    db_mod.init_db()

    session.expire_all()
    ftui_after = session.get(Store, "FTUI-001")
    assert ftui_after.latitude == pytest.approx(-6.3111)
    assert ftui_after.longitude == pytest.approx(106.8222)


def test_auth_401_expired_token_and_rbac_403_isolation(client: TestClient, session: Session):
    """Covers Group D1: invalid Bearer token yields 401 while anonymous works, plus 403 cross-tenant isolation."""
    # 1. Invalid/expired Bearer token rejected with HTTP 401 on optional-auth routes
    r_bad_tok = client.post(
        "/api/v1/menu/FTUI-001",
        json={
            "food_name": "Nasi Goreng Forged",
            "original_price": 20000,
            "typical_cooking_time": "16:00",
            "default_hours_cooked": 1.0,
        },
        headers={"Authorization": "Bearer expired.or.forged.token"},
    )
    assert r_bad_tok.status_code == 401

    r_anon = client.post(
        "/api/v1/listings/draft",
        json={"text": "Sisa 3 roti croissant", "store_id": "FTUI-001"},
    )
    assert r_anon.status_code == 200

    # 2. Cross-tenant merchant RBAC (MARGONDA-042 trying POST/PUT/DELETE /menu/FTUI-001 or bundle -> 403)
    ftui_token = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "dapurbarokah@nullwasted.id", "password": "nullwasted123"},
    ).json()["token"]
    created_menu = client.post(
        "/api/v1/menu/FTUI-001",
        json={
            "food_name": "Ayam Penyet Resmi",
            "original_price": 22000,
            "typical_cooking_time": "15:00",
            "default_hours_cooked": 1.0,
        },
        headers={"Authorization": f"Bearer {ftui_token}"},
    ).json()

    margonda_token = client.post(
        "/api/v1/auth/merchant-login",
        json={"email": "rotiunyil@nullwasted.id", "password": "nullwasted123"},
    ).json()["token"]

    r_menu_post_403 = client.post(
        "/api/v1/menu/FTUI-001",
        json={
            "food_name": "Nasi Goreng Hijack",
            "original_price": 20000,
            "typical_cooking_time": "16:00",
            "default_hours_cooked": 1.0,
        },
        headers={"Authorization": f"Bearer {margonda_token}"},
    )
    assert r_menu_post_403.status_code == 403

    r_menu_put_403 = client.put(
        f"/api/v1/menu/FTUI-001/{created_menu['id']}",
        json={"original_price": 15000},
        headers={"Authorization": f"Bearer {margonda_token}"},
    )
    assert r_menu_put_403.status_code == 403

    r_menu_del_403 = client.delete(
        f"/api/v1/menu/FTUI-001/{created_menu['id']}",
        headers={"Authorization": f"Bearer {margonda_token}"},
    )
    assert r_menu_del_403.status_code == 403

    r_bundle_403 = client.post(
        "/api/v1/listings/smart-bundle",
        json={"store_id": "FTUI-001"},
        headers={"Authorization": f"Bearer {margonda_token}"},
    )
    assert r_bundle_403.status_code == 403

    # 3. Cross-consumer / cross-merchant order cancel RBAC -> 403
    budi_token = client.post(
        "/api/v1/auth/consumer-login",
        json={"email": "budi@nullwasted.id", "password": "nullwasted123"},
    ).json()["token"]
    other_cons_token = client.post(
        "/api/v1/auth/consumer-register",
        json={
            "name": "Pelaku Lain",
            "email": "pelaku.lain@nullwasted.id",
            "password": "password123",
            "phone": "081200009999",
        },
    ).json()["token"]

    pub = client.post(
        "/api/v1/listings/publish",
        json={
            "store_id": "FTUI-001",
            "food_name": "Croissant Mentega",
            "matched_canonical_dish": "Croissant Mentega",
            "original_price": 24000,
            "discounted_price": 12000,
            "discount_percent": 50,
            "hours_since_cooked": 1.0,
            "category": "LOW_PERISHABILITY",
            "food_type": "BAKERY",
            "bpom_max_hours": 24.0,
            "minutes_until_closing": 120,
            "safety_status": "SAFE",
            "safety_reason": "Aman",
            "hazard_description": "Sesuai batas suhu ruang",
            "regulation_ref": "PerBPOM No. 16/2019",
            "quantity": 3,
            "closing_time": "20:30",
        },
        headers={"Authorization": f"Bearer {ftui_token}"},
    ).json()

    ticket = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": pub["id"], "quantity": 1, "customer_name": "Budi Santoso", "customer_phone": "081234567890"},
        headers={"Authorization": f"Bearer {budi_token}"},
    ).json()

    r_cancel_other_cons = client.post(
        f"/api/v1/orders/{ticket['id']}/cancel",
        headers={"Authorization": f"Bearer {other_cons_token}"},
    )
    assert r_cancel_other_cons.status_code == 403

    r_cancel_other_merch = client.post(
        f"/api/v1/orders/{ticket['id']}/cancel",
        headers={"Authorization": f"Bearer {margonda_token}"},
    )
    assert r_cancel_other_merch.status_code == 403
