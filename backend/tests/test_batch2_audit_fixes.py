"""Batch 2 audit fixes tests:
- PATCH /api/v1/listings/{id}/stock atomic update, price-lock preservation, auto-deactivate at 0, and Guardrail #3 (reject expired)
- PUT /api/v1/menu/{store_id}/{menu_id} menu editing
- Removal of dead field portion_size from API schemas
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


def test_patch_listing_stock_atomic_price_locked_and_rejects_expired(client: TestClient, session: Session):
    future = datetime.now(timezone.utc) + timedelta(hours=3)
    listing = ItemListing(
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        location_badge="Kantin FTUI",
        closing_time="23:59",
        food_name="Ayam Bakar Madu",
        matched_canonical_dish="Ayam Bakar",
        category="MEDIUM_PERISHABILITY",
        quantity=3,
        initial_quantity=3,
        original_price=30000,
        discounted_price=12000,
        discount_percent=60,
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

    # Other merchant -> 403
    r_forbidden = client.patch(
        f"/api/v1/listings/{listing.id}/stock",
        headers=_merchant_headers("MARGONDA-042"),
        json={"quantity": 7},
    )
    assert r_forbidden.status_code == 403

    # Owner updates stock 3 -> 7; price & discount must remain locked
    r_ok = client.patch(
        f"/api/v1/listings/{listing.id}/stock",
        headers=_merchant_headers("FTUI-001"),
        json={"quantity": 7},
    )
    assert r_ok.status_code == 200
    data = r_ok.json()
    assert data["quantity"] == 7
    assert data["initial_quantity"] == 7
    assert data["discounted_price"] == 12000
    assert data["discount_percent"] == 60
    assert data["is_active"] is True

    # Set to 0 -> deactivates
    r_zero = client.patch(
        f"/api/v1/listings/{listing.id}/stock",
        headers=_merchant_headers("FTUI-001"),
        json={"quantity": 0},
    )
    assert r_zero.status_code == 200
    assert r_zero.json()["quantity"] == 0
    assert r_zero.json()["is_active"] is False

    # Guardrail #3: expired listing cannot have stock updated
    expired = ItemListing(
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        location_badge="Kantin FTUI",
        closing_time="20:00",
        food_name="Roti Lama",
        matched_canonical_dish="Roti",
        category="LOW_PERISHABILITY",
        quantity=2,
        initial_quantity=2,
        original_price=15000,
        discounted_price=7500,
        discount_percent=50,
        hours_since_cooked=2.0,
        bpom_max_hours=24.0,
        minutes_until_closing=0,
        safety_status="SAFE",
        safety_reason="Aman",
        hazard_description="Aman",
        regulation_ref="PerBPOM No. 16/2019",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        is_active=True,
    )
    session.add(expired)
    session.commit()
    session.refresh(expired)

    r_exp = client.patch(
        f"/api/v1/listings/{expired.id}/stock",
        headers=_merchant_headers("FTUI-001"),
        json={"quantity": 5},
    )
    assert r_exp.status_code == 400


def test_menu_edit_and_portion_size_removed_from_schemas(client: TestClient):
    headers = _merchant_headers("FTUI-001")
    created = client.post(
        "/api/v1/menu/FTUI-001",
        headers=headers,
        json={
            "food_name": "Croissant Almond",
            "original_price": 22000,
            "typical_cooking_time": "15:00",
            "default_hours_cooked": 1.0,
            "ingredients": "Tepung terigu, mentega, kacang almond",
        },
    )
    assert created.status_code == 200
    menu_data = created.json()
    assert "portion_size" not in menu_data

    updated = client.put(
        f"/api/v1/menu/FTUI-001/{menu_data['id']}",
        headers=headers,
        json={"food_name": "Croissant Almond Premium", "original_price": 26000},
    )
    assert updated.status_code == 200
    assert updated.json()["food_name"] == "Croissant Almond Premium"
    assert updated.json()["original_price"] == 26000
    assert "portion_size" not in updated.json()
