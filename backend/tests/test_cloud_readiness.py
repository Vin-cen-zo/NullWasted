import re
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import case, or_, update
from sqlalchemy.dialects import postgresql
from sqlmodel import Session

from app.core.config import CORS_ORIGIN_REGEX, normalize_database_url
from app.core.database import engine, init_db
from app.core.security import create_access_token
from app.main import app
from app.models.listing import ItemListing

_default_token = create_access_token({
    "sub": "cloud-tester",
    "role": "consumer",
    "email": "cloud@nullwasted.id",
    "name": "Cloud Tester",
    "phone": "0812-0000-1111",
})
client = TestClient(app, headers={"Authorization": f"Bearer {_default_token}"})


def test_normalize_database_url_postgres_variants():
    assert normalize_database_url(
        "postgres://user:pass@ep-demo-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    ).startswith("postgresql+psycopg://user:pass@ep-demo-pooler")

    assert normalize_database_url(
        "postgresql://user:pass@ep-demo-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    ).startswith("postgresql+psycopg://user:pass@ep-demo-pooler")

    already_psycopg = "postgresql+psycopg://user:pass@host/db"
    assert normalize_database_url(already_psycopg) == already_psycopg

    assert normalize_database_url("").startswith("sqlite:///")
    assert normalize_database_url("sqlite:///./nullwasted_local.db").startswith("sqlite:///")


def test_cors_origin_regex_allows_cloudflare_pages_and_blocks_untrusted():
    pattern = re.compile(CORS_ORIGIN_REGEX)
    allowed_origins = [
        "https://nullwasted.pages.dev",
        "https://a1b2c3d4.nullwasted.pages.dev",
        "https://nullwasted.digilabui.cloud",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://nullwasted.vercel.app",
    ]
    blocked_origins = [
        "https://evil.com",
        "https://nullwasted.pages.dev.evil.com",
        "https://notpagesdev.com",
    ]
    for origin in allowed_origins:
        assert pattern.match(origin) is not None, f"Expected allowed origin: {origin}"
    for origin in blocked_origins:
        assert pattern.match(origin) is None, f"Expected blocked origin: {origin}"


def test_health_endpoint_supports_get_and_head():
    get_res = client.get("/health")
    assert get_res.status_code == 200
    body = get_res.json()
    assert body["status"] == "ok"
    assert "environment" in body

    head_res = client.head("/health")
    assert head_res.status_code == 200


def test_reserve_order_update_compiles_for_postgresql_boolean():
    """Verifies the atomic stock decrement compiles with PostgreSQL BOOLEAN (no integer 0/1)."""
    now_utc = datetime.now(timezone.utc)
    stmt = (
        update(ItemListing)
        .where(
            ItemListing.id == "lst-pgtest",
            ItemListing.quantity >= 1,
            ItemListing.is_active == True,
            or_(
                ItemListing.expires_at.is_(None),
                ItemListing.expires_at > now_utc,
            ),
        )
        .values(
            quantity=ItemListing.quantity - 1,
            is_active=case(
                (ItemListing.quantity - 1 <= 0, False),
                else_=True,
            ),
        )
    )
    compiled = str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "is_active = true" in compiled.lower()
    assert "then false else true" in compiled.lower()
    assert "is_active = 1" not in compiled.lower()


def test_reserve_order_atomic_decrement_and_auto_deactivate():
    init_db()
    listing_id = "lst-cloud-atomic-test"
    with Session(engine) as session:
        existing = session.get(ItemListing, listing_id)
        if existing:
            session.delete(existing)
            session.commit()

        item = ItemListing(
            id=listing_id,
            store_id="FTUI-001",
            store_name="Dapur Barokah FTUI",
            location_badge="Kantin FTUI",
            closing_time="23:59",
            food_name="Test Cloud Atomic Item",
            matched_canonical_dish="Ayam Bakar",
            category="MEDIUM_PERISHABILITY",
            quantity=2,
            initial_quantity=2,
            original_price=20000,
            discounted_price=10000,
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

    # Reserve 1 -> remaining 1, still active
    r1 = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": listing_id, "quantity": 1, "customer_name": "Cloud Tester"},
    )
    assert r1.status_code == 200
    with Session(engine) as session:
        refreshed = session.get(ItemListing, listing_id)
        assert refreshed is not None
        assert refreshed.quantity == 1
        assert refreshed.is_active is True

    # Reserve 1 -> remaining 0, auto-deactivated
    r2 = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": listing_id, "quantity": 1, "customer_name": "Cloud Tester 2"},
    )
    assert r2.status_code == 200
    with Session(engine) as session:
        refreshed = session.get(ItemListing, listing_id)
        assert refreshed is not None
        assert refreshed.quantity == 0
        assert refreshed.is_active is False

    # Reserve again -> 409 Conflict
    r3 = client.post(
        "/api/v1/orders/reserve",
        json={"listing_id": listing_id, "quantity": 1, "customer_name": "Cloud Tester 3"},
    )
    assert r3.status_code == 409
