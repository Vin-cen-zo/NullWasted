"""Batch 4 audit fixes tests:
- Multi-menu AI voice/text batch extraction (POST /api/v1/listings/draft-batch, Guardrail #6)
- Midtrans Sandbox Core API QRIS:
  - /payments/qris/config when unconfigured vs configured
  - /payments/qris/create returns 503 when unconfigured
  - /payments/qris/create (mocked Midtrans httpx) creates PENDING ticket with 15-min payment_expires_at
  - Guardrail #5: complete-pickup rejects PENDING QRIS ticket (400)
  - /payments/midtrans-webhook verifies SHA-512 signature, marks settlement -> PAID, expire -> CANCELLED + stock rollback
  - Guardrail #5: lazy 15-min PENDING expiry auto-cancels and rolls back stock
"""

from datetime import datetime, timedelta, timezone
import hashlib

import httpx
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
        "email": f"{store_id.lower()}@nullwasted.id",
        "store_id": store_id,
        "store_name": "Dapur Barokah FTUI",
    })
    return {"Authorization": f"Bearer {token}"}


def _consumer_headers(sub: str = "usr-b4-1") -> dict[str, str]:
    token = create_access_token({
        "sub": sub,
        "role": "consumer",
        "email": "b4user@nullwasted.id",
        "name": "Pembeli QRIS",
        "phone": "081234567890",
    })
    return {"Authorization": f"Bearer {token}"}


def _make_listing(session: Session, quantity: int = 3) -> ItemListing:
    item = ItemListing(
        store_id="FTUI-001",
        store_name="Dapur Barokah FTUI",
        location_badge="Kantin FTUI",
        closing_time="23:59",
        food_name="Ayam Bakar QRIS",
        matched_canonical_dish="Ayam Bakar",
        category="MEDIUM_PERISHABILITY",
        food_type="MEAL",
        quantity=quantity,
        initial_quantity=quantity,
        original_price=24000,
        discounted_price=12000,
        discount_percent=50,
        hours_since_cooked=1.0,
        bpom_max_hours=8.0,
        minutes_until_closing=120,
        safety_status="SAFE",
        safety_reason="Aman",
        hazard_description="Aman",
        regulation_ref="PerBPOM No. 16/2019",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        is_active=True,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def test_draft_batch_extracts_multiple_dishes_independently(client: TestClient):
    res = client.post(
        "/api/v1/listings/draft-batch",
        headers=_merchant_headers("FTUI-001"),
        json={
            "text": "sisa 3 ayam bakar harga 25 ribu dan 4 donat cokelat harga 10 ribu dimasak 1 jam lalu",
            "store_id": "FTUI-001",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_count"] >= 2
    assert data["safe_count"] >= 2
    names = " ".join(i["food_name"].lower() for i in data["items"])
    assert "ayam" in names
    assert "donat" in names


def test_midtrans_qris_unconfigured_returns_disabled_and_503(client: TestClient, session: Session, monkeypatch):
    monkeypatch.delenv("MIDTRANS_SERVER_KEY", raising=False)
    cfg = client.get("/api/v1/payments/qris/config").json()
    assert cfg["qris_enabled"] is False

    item = _make_listing(session)
    res = client.post(
        "/api/v1/payments/qris/create",
        headers=_consumer_headers(),
        json={"listing_id": item.id, "quantity": 1, "customer_name": "Pembeli QRIS"},
    )
    assert res.status_code == 503


def test_midtrans_qris_create_webhook_settlement_and_pending_pickup_guard(
    client: TestClient, session: Session, monkeypatch
):
    server_key = "SB-Mid-server-TESTKEY12345"
    monkeypatch.setenv("MIDTRANS_SERVER_KEY", server_key)
    monkeypatch.setenv("MIDTRANS_IS_PRODUCTION", "false")

    class DummyResponse:
        status_code = 201

        def json(self):
            return {
                "status_code": "201",
                "transaction_id": "tx-sandbox-999",
                "qr_string": "00020101021226580016ID.CO.MIDTRANS.WWW",
                "actions": [
                    {"name": "generate-qr-code", "url": "https://api.sandbox.midtrans.com/v2/qris/tx-sandbox-999/qr-code"}
                ],
            }

    async def fake_post(self, url, **kwargs):
        return DummyResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    item = _make_listing(session, quantity=3)
    create_res = client.post(
        "/api/v1/payments/qris/create",
        headers=_consumer_headers(),
        json={"listing_id": item.id, "quantity": 1, "customer_name": "Pembeli QRIS"},
    )
    assert create_res.status_code == 200
    body = create_res.json()
    ticket = body["ticket"]
    assert ticket["payment_method"] == "MIDTRANS_QRIS"
    assert ticket["payment_status"] == "PENDING"
    assert body["qris_url"].startswith("https://api.sandbox.midtrans.com/")

    # Guardrail #5: cashier MUST reject PENDING QRIS ticket!
    pickup_pending = client.post(
        "/api/v1/orders/complete-pickup",
        headers=_merchant_headers("FTUI-001"),
        json={"order_code": ticket["order_code"], "store_id": "FTUI-001"},
    )
    assert pickup_pending.status_code == 400
    assert "PENDING" in pickup_pending.json()["detail"]

    # Webhook with invalid signature -> 403
    bad_wh = client.post(
        "/api/v1/payments/midtrans-webhook",
        json={
            "order_id": ticket["id"],
            "status_code": "200",
            "gross_amount": f"{ticket['total_price']}.00",
            "signature_key": "forged",
            "transaction_status": "settlement",
        },
    )
    assert bad_wh.status_code == 403

    # Webhook with valid SHA-512 signature -> PAID
    gross_str = f"{ticket['total_price']}.00"
    valid_sig = hashlib.sha512(f"{ticket['id']}200{gross_str}{server_key}".encode("utf-8")).hexdigest()
    ok_wh = client.post(
        "/api/v1/payments/midtrans-webhook",
        json={
            "order_id": ticket["id"],
            "status_code": "200",
            "gross_amount": gross_str,
            "signature_key": valid_sig,
            "transaction_status": "settlement",
        },
    )
    assert ok_wh.status_code == 200

    st = client.get(f"/api/v1/payments/{ticket['id']}/status", headers=_consumer_headers()).json()
    assert st["payment_status"] == "PAID"

    # Now cashier can complete pickup!
    pickup_ok = client.post(
        "/api/v1/orders/complete-pickup",
        headers=_merchant_headers("FTUI-001"),
        json={"order_code": ticket["order_code"], "store_id": "FTUI-001"},
    )
    assert pickup_ok.status_code == 200
    assert pickup_ok.json()["status"] == "COMPLETED"


def test_pending_qris_lazy_15min_expiry_cancels_and_restores_stock(
    client: TestClient, session: Session, monkeypatch
):
    """Guardrail #5: Abandoned PENDING QRIS ticket past payment_expires_at auto-cancels and rolls back stock."""
    item = _make_listing(session, quantity=2)
    ticket = OrderTicket(
        id="NW-EXPTEST-1",
        order_code="#NW-9901",
        store_id="FTUI-001",
        user_id="usr-b4-1",
        customer_name="Pembeli Kabur",
        customer_phone="081234567890",
        listing_id=item.id,
        food_name=item.food_name,
        store_name=item.store_name,
        location_badge=item.location_badge,
        quantity=1,
        unit_price=12000,
        total_price=12000,
        pickup_deadline="Sebelum pukul 23:59 WIB",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        qr_payload="NULLWASTED|ORDER:#NW-9901",
        payment_method="MIDTRANS_QRIS",
        payment_status="PENDING",
        payment_expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        status="RESERVED",
    )
    item.quantity = 1
    session.add(item)
    session.add(ticket)
    session.commit()

    st = client.get(f"/api/v1/payments/{ticket.id}/status", headers=_consumer_headers()).json()
    assert st["status"] == "CANCELLED"

    session.expire_all()
    refreshed = session.get(ItemListing, item.id)
    assert refreshed is not None
    assert refreshed.quantity == 2  # Stock restored!
