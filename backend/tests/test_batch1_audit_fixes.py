"""Batch 1 audit fixes tests:
- Consumer role enforcement on /orders/reserve (403 for merchant)
- Order ownership via user_id (no cross-consumer leakage even with identical name & no phone)
- Lazy RESERVED -> EXPIRED transition (Guardrail #1: no stock restore, no auto-refund)
- Store.category persistence & Public Store Profile endpoint
- Merchant Profile update + Guardrail #2 (closing_time never extends BPOM expires_at)
- Consumer Profile GET/PATCH & Change Password (consumer + merchant)
- DB-backed Store Favorites (GET/POST/DELETE /auth/favorites)
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.database import get_session
from app.core.security import create_access_token
from app.core.seed import seed_initial_data
from app.main import app
from app.models.listing import ItemListing, OrderTicket


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
        "email": "dapurbarokah@nullwasted.id",
        "store_id": store_id,
        "store_name": "Dapur Barokah FTUI",
    })
    return {"Authorization": f"Bearer {token}"}


def test_reserve_rejects_merchant_role_with_403(client: TestClient, session: Session):
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    listing = ItemListing(
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        location_badge="Kantin FTUI",
        closing_time="23:59",
        food_name="Ayam Panggang Test",
        matched_canonical_dish="Ayam Bakar",
        category="MEDIUM_PERISHABILITY",
        quantity=3,
        initial_quantity=3,
        original_price=25000,
        discounted_price=12500,
        discount_percent=50,
        hours_since_cooked=1.0,
        bpom_max_hours=8.0,
        minutes_until_closing=120,
        safety_status="SAFE",
        safety_reason="Aman",
        hazard_description="Aman",
        regulation_ref="PerBPOM No. 16/2019",
        expires_at=future,
        is_active=True,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)

    res = client.post(
        "/api/v1/orders/reserve",
        headers=_merchant_headers("FTUI-001"),
        json={"listing_id": listing.id, "quantity": 1, "customer_name": "Merchant Self Buy"},
    )
    assert res.status_code == 403


def test_order_ownership_by_user_id_prevents_duplicate_name_leak(client: TestClient, session: Session):
    """Two consumers with identical name 'Budi' and no phone must never see each other's orders."""
    c1 = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "Budi Kembar", "email": "budi1@nullwasted.id", "password": "password123"},
    ).json()
    c2 = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "Budi Kembar", "email": "budi2@nullwasted.id", "password": "password123"},
    ).json()

    future = datetime.now(timezone.utc) + timedelta(hours=2)
    listing = ItemListing(
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        location_badge="Kantin FTUI",
        closing_time="23:59",
        food_name="Roti Keju Test",
        matched_canonical_dish="Roti Keju",
        category="LOW_PERISHABILITY",
        quantity=5,
        initial_quantity=5,
        original_price=20000,
        discounted_price=10000,
        discount_percent=50,
        hours_since_cooked=1.0,
        bpom_max_hours=24.0,
        minutes_until_closing=120,
        safety_status="SAFE",
        safety_reason="Aman",
        hazard_description="Aman",
        regulation_ref="PerBPOM No. 16/2019",
        expires_at=future,
        is_active=True,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)

    r_res = client.post(
        "/api/v1/orders/reserve",
        headers={"Authorization": f"Bearer {c1['token']}"},
        json={"listing_id": listing.id, "quantity": 1, "customer_name": "Budi Kembar", "customer_phone": ""},
    )
    assert r_res.status_code == 200
    ticket = r_res.json()
    assert ticket["user_id"] == c1["user_id"]

    c1_orders = client.get("/api/v1/orders/active", headers={"Authorization": f"Bearer {c1['token']}"}).json()
    c2_orders = client.get("/api/v1/orders/active", headers={"Authorization": f"Bearer {c2['token']}"}).json()
    assert len(c1_orders) == 1
    assert len(c2_orders) == 0


def test_lazy_expired_ticket_guardrail_no_stock_restore_no_auto_refund(client: TestClient, session: Session):
    """Guardrail #1: EXPIRED tickets must not restore stock, must not auto-refund PAID, and cannot be picked up or cancelled."""
    c1 = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "Rina Expired", "email": "rina.exp@nullwasted.id", "password": "password123"},
    ).json()

    future = datetime.now(timezone.utc) + timedelta(minutes=30)
    listing = ItemListing(
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        location_badge="Kantin FTUI",
        closing_time="23:59",
        food_name="Susu Pudding Test",
        matched_canonical_dish="Puding Susu",
        category="HIGH_PERISHABILITY",
        quantity=2,
        initial_quantity=2,
        original_price=20000,
        discounted_price=10000,
        discount_percent=50,
        hours_since_cooked=1.0,
        bpom_max_hours=4.0,
        minutes_until_closing=30,
        safety_status="SAFE",
        safety_reason="Aman",
        hazard_description="Aman",
        regulation_ref="PerBPOM No. 16/2019",
        expires_at=future,
        is_active=True,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)

    r_res = client.post(
        "/api/v1/orders/reserve",
        headers={"Authorization": f"Bearer {c1['token']}"},
        json={"listing_id": listing.id, "quantity": 1, "customer_name": "Rina Expired", "payment_method": "SIMULATED_QRIS"},
    )
    assert r_res.status_code == 200
    ticket_id = r_res.json()["id"]
    order_code = r_res.json()["order_code"]

    # Force ticket.expires_at into the past
    db_ticket = session.get(OrderTicket, ticket_id)
    assert db_ticket is not None
    db_ticket.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    session.add(db_ticket)
    session.commit()

    orders = client.get("/api/v1/orders/active", headers={"Authorization": f"Bearer {c1['token']}"}).json()
    assert len(orders) == 1
    assert orders[0]["status"] == "EXPIRED"
    assert orders[0]["payment_status"] == "PAID"  # Guardrail #1: not auto-refunded

    # Stock must remain decremented (1, not 2)
    session.expire_all()
    refreshed_listing = session.get(ItemListing, listing.id)
    assert refreshed_listing is not None
    assert refreshed_listing.quantity == 1

    # Cannot cancel or complete pickup an EXPIRED ticket
    cancel_res = client.post(
        f"/api/v1/orders/{ticket_id}/cancel",
        headers={"Authorization": f"Bearer {c1['token']}"},
    )
    assert cancel_res.status_code == 400

    pickup_res = client.post(
        "/api/v1/orders/complete-pickup",
        headers=_merchant_headers("FTUI-001"),
        json={"order_code": order_code, "store_id": "FTUI-001"},
    )
    assert pickup_res.status_code == 400


def test_store_category_profile_and_bpom_closing_time_guardrail(client: TestClient, session: Session):
    """Guardrail #2: Pushing store closing_time later must NEVER extend an active listing's BPOM expires_at."""
    reg = client.post(
        "/api/v1/auth/merchant-register",
        json={
            "name": "Bakery Nusantara Test",
            "email": "bakery.test@nullwasted.id",
            "password": "password123",
            "category": "Bakery & Pastry",
            "closing_time": "20:00",
        },
    )
    assert reg.status_code == 200
    reg_data = reg.json()
    assert reg_data["store_category"] == "Bakery & Pastry"
    store_id = reg_data["store_id"]
    m_headers = {"Authorization": f"Bearer {reg_data['token']}"}

    # Insert an active listing with strict BPOM expires_at = now + 2 hours
    bpom_exp = datetime.now(timezone.utc) + timedelta(hours=2)
    listing = ItemListing(
        store_id=store_id,
        store_name="Bakery Nusantara Test",
        location_badge="Depok",
        closing_time="20:00",
        food_name="Kue Sus Krim",
        matched_canonical_dish="Kue Sus",
        category="HIGH_PERISHABILITY",
        quantity=3,
        initial_quantity=3,
        original_price=15000,
        discounted_price=7500,
        discount_percent=50,
        hours_since_cooked=2.0,
        bpom_max_hours=4.0,
        minutes_until_closing=120,
        safety_status="SAFE",
        safety_reason="Aman",
        hazard_description="Aman",
        regulation_ref="PerBPOM No. 16/2019",
        expires_at=bpom_exp,
        is_active=True,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)

    # Update profile with later closing_time 23:59
    upd = client.patch(
        f"/api/v1/auth/stores/{store_id}/profile",
        headers=m_headers,
        json={
            "name": "Bakery Nusantara Updated",
            "category": "Pastry Artisan",
            "closing_time": "23:59",
            "description": "Roti segar setiap sore.",
        },
    )
    assert upd.status_code == 200
    assert upd.json()["category"] == "Pastry Artisan"
    assert upd.json()["description"] == "Roti segar setiap sore."

    session.expire_all()
    refreshed = session.get(ItemListing, listing.id)
    assert refreshed is not None
    assert refreshed.store_name == "Bakery Nusantara Updated"
    # Guardrail #2: expires_at must NOT be extended past bpom_exp
    ref_exp = refreshed.expires_at if refreshed.expires_at.tzinfo else refreshed.expires_at.replace(tzinfo=timezone.utc)
    assert ref_exp <= bpom_exp + timedelta(seconds=2)

    # Public store endpoint returns updated profile and active listings
    pub = client.get(f"/api/v1/auth/stores/{store_id}")
    assert pub.status_code == 200
    pub_data = pub.json()
    assert pub_data["store"]["category"] == "Pastry Artisan"
    assert pub_data["active_listing_count"] == 1


def test_consumer_profile_change_password_and_store_favorites(client: TestClient):
    reg = client.post(
        "/api/v1/auth/consumer-register",
        json={"name": "Andi Awal", "email": "andi.prof@nullwasted.id", "password": "oldpassword123"},
    ).json()
    headers = {"Authorization": f"Bearer {reg['token']}"}

    # GET & PATCH /auth/me
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["name"] == "Andi Awal"

    upd = client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"name": "Andi Baru", "phone": "081234567890"},
    )
    assert upd.status_code == 200
    assert upd.json()["name"] == "Andi Baru"
    assert upd.json()["phone"] == "081234567890"

    # Change password: wrong old password -> 400
    bad_pw = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "wrongpassword", "new_password": "newpassword123"},
    )
    assert bad_pw.status_code == 400

    # Change password: valid -> 200 and new login succeeds
    ok_pw = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "oldpassword123", "new_password": "newpassword123"},
    )
    assert ok_pw.status_code == 200

    login_new = client.post(
        "/api/v1/auth/consumer-login",
        json={"email": "andi.prof@nullwasted.id", "password": "newpassword123"},
    )
    assert login_new.status_code == 200

    # Store favorites CRUD
    fav_add = client.post("/api/v1/auth/favorites/FTUI-001", headers=headers)
    assert fav_add.status_code == 200
    assert "FTUI-001" in fav_add.json()["store_ids"]

    fav_list = client.get("/api/v1/auth/favorites", headers=headers)
    assert fav_list.status_code == 200
    assert fav_list.json()["store_ids"] == ["FTUI-001"]

    fav_del = client.delete("/api/v1/auth/favorites/FTUI-001", headers=headers)
    assert fav_del.status_code == 200
    assert fav_del.json()["store_ids"] == []
