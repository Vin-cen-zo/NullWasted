"""Security, strict auth, atomic cancellation, and schema boundary tests."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.database import get_session
from app.core.security import create_access_token
from app.core.seed import seed_initial_data
from app.main import app
from app.models.listing import ItemListing


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


@pytest.fixture(name="anon_client")
def anon_client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    try:
        with TestClient(app) as client:
            yield client
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


def _consumer_headers(name: str = "Siti", phone: str = "0813-1111-2222") -> dict[str, str]:
    token = create_access_token({
        "sub": "usr-sec-1",
        "role": "consumer",
        "email": "siti@nullwasted.id",
        "name": name,
        "phone": phone,
    })
    return {"Authorization": f"Bearer {token}"}


def test_unauthenticated_requests_rejected_with_401(anon_client: TestClient):
    """All mutating endpoints and PII-bearing order endpoints must reject missing Bearer tokens."""
    assert anon_client.get("/api/v1/orders/active").status_code == 401
    assert anon_client.put(
        "/api/v1/auth/stores/FTUI-001/location",
        json={"latitude": -6.36, "longitude": 106.82},
    ).status_code == 401
    assert anon_client.post(
        "/api/v1/menu/FTUI-001",
        json={"food_name": "Nasi Goreng", "original_price": 20000, "ingredients": "nasi, telur"},
    ).status_code == 401
    assert anon_client.post(
        "/api/v1/listings/draft",
        json={"text": "Sisa 3 croissant cokelat baru matang 1 jam lalu", "store_id": "FTUI-001"},
    ).status_code == 401
    assert anon_client.post(
        "/api/v1/listings/smart-bundle",
        json={"store_id": "FTUI-001"},
    ).status_code == 401
    assert anon_client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": "lst-fake", "quantity": 1},
    ).status_code == 401
    assert anon_client.post("/api/v1/orders/ord-fake/cancel").status_code == 401
    assert anon_client.post(
        "/api/v1/orders/complete-pickup",
        json={"order_code": "#NW-1234", "store_id": "FTUI-001"},
    ).status_code == 401
    assert anon_client.delete("/api/v1/listings/lst-fake").status_code == 401
    assert anon_client.post(
        "/api/v1/upload-image",
        files={"file": ("test.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16, "image/png")},
    ).status_code == 401


def test_upload_image_rejects_consumer_role_with_403(anon_client: TestClient):
    res = anon_client.post(
        "/api/v1/upload-image",
        headers=_consumer_headers(),
        files={"file": ("test.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16, "image/png")},
    )
    assert res.status_code == 403


def test_orders_active_strictly_scoped_per_tenant(anon_client: TestClient, session: Session):
    """Consumers only see their own orders and merchants only see their own store's orders."""
    future = datetime.now(timezone.utc) + timedelta(hours=3)
    listing = ItemListing(
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        location_badge="Kantin FTUI",
        closing_time="23:59",
        food_name="Roti Tawar Surplus",
        matched_canonical_dish="Roti Tawar",
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

    r1 = anon_client.post(
        "/api/v1/orders/reserve",
        headers=_consumer_headers("Siti", "0813-1111-2222"),
        json={
            "listing_id": listing.id,
            "quantity": 1,
            "customer_name": "Siti",
            "customer_phone": "0813-1111-2222",
        },
    )
    assert r1.status_code == 200

    # Different consumer cannot see Siti's ticket
    other_consumer_orders = anon_client.get(
        "/api/v1/orders/active?customer_phone=0813-1111-2222",
        headers=_consumer_headers("Budi", "0812-9999-8888"),
    )
    assert other_consumer_orders.status_code == 200
    assert len(other_consumer_orders.json()) == 0

    # Different merchant cannot query FTUI-001 orders
    other_merchant = anon_client.get(
        "/api/v1/orders/active?store_id=FTUI-001",
        headers=_merchant_headers("MARGONDA-042"),
    )
    assert other_merchant.status_code == 403


def test_atomic_cancel_prevents_double_stock_rollback(anon_client: TestClient, session: Session):
    future = datetime.now(timezone.utc) + timedelta(hours=3)
    listing = ItemListing(
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        location_badge="Kantin FTUI",
        closing_time="23:59",
        food_name="Donat Gula",
        matched_canonical_dish="Donat",
        category="LOW_PERISHABILITY",
        quantity=3,
        initial_quantity=3,
        original_price=15000,
        discounted_price=7500,
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

    headers = _consumer_headers("Siti", "0813-1111-2222")
    reserve_res = anon_client.post(
        "/api/v1/orders/reserve",
        headers=headers,
        json={
            "listing_id": listing.id,
            "quantity": 2,
            "customer_name": "Siti",
            "customer_phone": "0813-1111-2222",
        },
    )
    assert reserve_res.status_code == 200
    order_id = reserve_res.json()["id"]

    cancel1 = anon_client.post(f"/api/v1/orders/{order_id}/cancel", headers=headers)
    assert cancel1.status_code == 200

    cancel2 = anon_client.post(f"/api/v1/orders/{order_id}/cancel", headers=headers)
    assert cancel2.status_code == 400

    session.expire_all()
    refreshed = session.get(ItemListing, listing.id)
    assert refreshed is not None
    assert refreshed.quantity == 3


def test_schema_validation_rejects_invalid_coords_and_closing_time(anon_client: TestClient):
    headers = _merchant_headers("FTUI-001")
    bad_coords = anon_client.put(
        "/api/v1/auth/stores/FTUI-001/location",
        headers=headers,
        json={"latitude": 123.45, "longitude": 106.82},
    )
    assert bad_coords.status_code == 422

    bad_closing = anon_client.post(
        "/api/v1/listings/publish",
        headers=headers,
        json={
            "food_name": "Croissant Cokelat",
            "matched_canonical_dish": "Croissant",
            "category": "LOW_PERISHABILITY",
            "quantity": 2,
            "original_price": 20000,
            "discount_percent": 55,
            "hours_since_cooked": 1.0,
            "bpom_max_hours": 24.0,
            "minutes_until_closing": 120,
            "safety_status": "SAFE",
            "safety_reason": "Aman",
            "hazard_description": "Aman",
            "store_id": "FTUI-001",
            "closing_time": "25:99",
        },
    )
    assert bad_closing.status_code == 422
