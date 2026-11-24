"""Batch 3 audit fixes tests:
- Dynamic Pricing combining time decay (50-65%) + stock volume bonus (0/+3/+5%), clamped 50-70%
- Interactive Smart Mystery Bag accepting specific listing_ids
- Single-Store Cart Checkout (/api/v1/orders/reserve-cart) + Guardrail #4:
  - Rejects mixed stores (400)
  - All-or-nothing atomic rollback when 1 item lacks stock (409)
  - Ticket expires_at = min(expires_at) across all cart items
  - Cancel rolls back stock to ALL listing_ids in items_json
"""

from datetime import datetime, timedelta, timezone
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.database import get_session
from app.core.security import create_access_token
from app.core.seed import seed_initial_data
from app.main import app
from app.models.listing import ItemListing
from app.services.pricing import calculate_dynamic_pricing


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
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _merchant_headers(store_id: str = "FTUI-001") -> dict[str, str]:
    token = create_access_token({
        "sub": store_id,
        "role": "merchant",
        "email": f"{store_id.lower()}@nullwasted.id",
        "store_id": store_id,
        "store_name": "Dapur Barokah FTUI",
    })
    return {"Authorization": f"Bearer {token}"}


def _consumer_headers(sub: str = "usr-cart-1") -> dict[str, str]:
    token = create_access_token({
        "sub": sub,
        "role": "consumer",
        "email": "cartuser@nullwasted.id",
        "name": "Pembeli Cart",
        "phone": "081234567890",
    })
    return {"Authorization": f"Bearer {token}"}


def _make_listing(
    session: Session,
    *,
    store_id: str = "FTUI-001",
    food_name: str = "Ayam Bakar",
    food_type: str = "MEAL",
    quantity: int = 3,
    price: int = 20000,
    expires_in_mins: int = 120,
) -> ItemListing:
    item = ItemListing(
        store_id=store_id,
        store_name="Dapur Barokah FTUI" if store_id == "FTUI-001" else "Roti Unyil Margonda",
        location_badge="Kantin FTUI",
        closing_time="23:59",
        food_name=food_name,
        matched_canonical_dish=food_name,
        category="LOW_PERISHABILITY" if food_type == "BAKERY" else "MEDIUM_PERISHABILITY",
        food_type=food_type,
        quantity=quantity,
        initial_quantity=quantity,
        original_price=price,
        discounted_price=price // 2,
        discount_percent=50,
        hours_since_cooked=1.0,
        bpom_max_hours=8.0,
        minutes_until_closing=expires_in_mins,
        safety_status="SAFE",
        safety_reason="Aman",
        hazard_description="Aman",
        regulation_ref="PerBPOM No. 16/2019",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=expires_in_mins),
        is_active=True,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def test_dynamic_pricing_time_plus_stock_volume():
    # Far from closing (200 min): base 50% + volume bonus
    p_low = calculate_dynamic_pricing(20000, minutes_until_closing=200, quantity=2)
    p_mid = calculate_dynamic_pricing(20000, minutes_until_closing=200, quantity=6)
    p_high = calculate_dynamic_pricing(20000, minutes_until_closing=200, quantity=12)

    assert p_low["discount_percent"] == 50
    assert p_low["volume_bonus_percent"] == 0
    assert p_mid["discount_percent"] == 53
    assert p_mid["volume_bonus_percent"] == 3
    assert p_high["discount_percent"] == 55
    assert p_high["volume_bonus_percent"] == 5
    assert "volume 12 porsi" in p_high["pricing_reason"]

    # Near closing (20 min): base 65% + volume bonus clamped at 70%
    p_crit = calculate_dynamic_pricing(20000, minutes_until_closing=20, quantity=15)
    assert p_crit["discount_percent"] == 70


def test_smart_bundle_accepts_selected_listing_ids(client: TestClient, session: Session):
    b1 = _make_listing(session, food_name="Croissant A", food_type="BAKERY", quantity=1)
    b2 = _make_listing(session, food_name="Donat B", food_type="BAKERY", quantity=2)
    m1 = _make_listing(session, food_name="Ayam C", food_type="MEAL", quantity=1)

    res = client.post(
        "/api/v1/listings/smart-bundle",
        headers=_merchant_headers("FTUI-001"),
        json={
            "store_id": "FTUI-001",
            "listing_ids": [b1.id, b2.id],
            "custom_bundle_name": "Paket Bakery Sore",
            "discount_percent": 65,
        },
    )
    assert res.status_code == 200
    bundle = res.json()
    assert bundle["food_name"] == "Paket Bakery Sore"
    assert bundle["is_bundle"] is True

    session.expire_all()
    assert session.get(ItemListing, b1.id).is_active is False
    assert session.get(ItemListing, b2.id).is_active is False
    # Unselected item m1 must remain untouched and active!
    assert session.get(ItemListing, m1.id).is_active is True
    assert session.get(ItemListing, m1.id).quantity == 1


def test_single_store_cart_atomic_checkout_and_multi_item_cancel_rollback(client: TestClient, session: Session):
    a = _make_listing(session, store_id="FTUI-001", food_name="Nasi Ayam", quantity=3, price=20000, expires_in_mins=45)
    b = _make_listing(session, store_id="FTUI-001", food_name="Tahu Bacem", quantity=2, price=10000, expires_in_mins=120)
    other_store = _make_listing(session, store_id="MARGONDA-042", food_name="Roti Unyil", quantity=3, price=12000)

    # 1. Mixed stores rejected with 400
    r_mixed = client.post(
        "/api/v1/orders/reserve-cart",
        headers=_consumer_headers(),
        json={
            "items": [
                {"listing_id": a.id, "quantity": 1},
                {"listing_id": other_store.id, "quantity": 1},
            ],
            "customer_name": "Pembeli Cart",
        },
    )
    assert r_mixed.status_code == 400

    # 2. All-or-nothing rollback when 2nd item exceeds stock (409)
    r_conflict = client.post(
        "/api/v1/orders/reserve-cart",
        headers=_consumer_headers(),
        json={
            "items": [
                {"listing_id": a.id, "quantity": 1},
                {"listing_id": b.id, "quantity": 99},
            ],
            "customer_name": "Pembeli Cart",
        },
    )
    assert r_conflict.status_code == 409
    session.expire_all()
    assert session.get(ItemListing, a.id).quantity == 3  # Rolled back!
    assert session.get(ItemListing, b.id).quantity == 2

    # 3. Valid cart checkout -> 1 unified ticket with min(expires_at) & items_json
    r_ok = client.post(
        "/api/v1/orders/reserve-cart",
        headers=_consumer_headers(),
        json={
            "items": [
                {"listing_id": a.id, "quantity": 2},
                {"listing_id": b.id, "quantity": 1},
            ],
            "customer_name": "Pembeli Cart",
            "payment_method": "CASH_ON_PICKUP",
        },
    )
    assert r_ok.status_code == 200
    ticket = r_ok.json()
    assert ticket["quantity"] == 3
    assert ticket["total_price"] == (10000 * 2) + (5000 * 1)
    parsed_items = json.loads(ticket["items_json"])
    assert len(parsed_items) == 2

    session.expire_all()
    assert session.get(ItemListing, a.id).quantity == 1
    assert session.get(ItemListing, b.id).quantity == 1

    # 4. Guardrail #4: cancel_order restores stock to BOTH a and b!
    r_cancel = client.post(
        f"/api/v1/orders/{ticket['id']}/cancel",
        headers=_consumer_headers(),
    )
    assert r_cancel.status_code == 200
    session.expire_all()
    assert session.get(ItemListing, a.id).quantity == 3
    assert session.get(ItemListing, b.id).quantity == 2
