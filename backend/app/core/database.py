from typing import Generator
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select
from app.core.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False,
)


def init_db() -> None:
    """Initialize database tables and seed demo items if empty. Safely migrate SQLite columns."""
    from app.models.listing import (
        ItemListing,
        OrderTicket,
        Store,
        StoreMenuItem,
        User,
    )  # Local import to register models

    SQLModel.metadata.create_all(engine)

    # Safe SQLite column migration check for item_listings and order_tickets
    if "sqlite" in DATABASE_URL:
        with engine.connect() as conn:
            try:
                # 1. item_listings migrations
                item_cols = [c[1] for c in conn.execute(text("PRAGMA table_info(item_listings)")).fetchall()]
                if item_cols:
                    if "store_id" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN store_id TEXT DEFAULT 'FTUI-001'"))
                    if "latitude" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN latitude REAL DEFAULT -6.3626"))
                    if "longitude" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN longitude REAL DEFAULT 106.8240"))
                    if "closing_time" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN closing_time TEXT DEFAULT '20:30'"))
                    if "is_bundle" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN is_bundle INTEGER DEFAULT 0"))
                    if "bundled_items_json" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN bundled_items_json TEXT DEFAULT NULL"))

                # 2. order_tickets migrations
                order_cols = [c[1] for c in conn.execute(text("PRAGMA table_info(order_tickets)")).fetchall()]
                if order_cols:
                    if "store_id" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN store_id TEXT DEFAULT 'FTUI-001'"))
                    if "customer_name" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN customer_name TEXT DEFAULT 'Konsumen NullWasted'"))
                    if "customer_phone" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN customer_phone TEXT DEFAULT '0812-8899-0011'"))
                    if "payment_method" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN payment_method TEXT DEFAULT 'CASH_ON_PICKUP'"))
                    if "payment_status" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN payment_status TEXT DEFAULT 'UNPAID'"))
                    if "completed_at" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN completed_at TEXT DEFAULT NULL"))
                    if "cancelled_at" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN cancelled_at TEXT DEFAULT NULL"))

                conn.commit()
            except Exception:
                pass

    with Session(engine) as session:
        existing = session.exec(select(ItemListing)).first()
        if not existing:
            demo_item = ItemListing(
                id="lst-demo001",
                store_id="FTUI-001",
                store_name="Dapur Barokah",
                location_badge="Kantin FTUI · 250m (🚶 3 mnt)",
                maps_url="https://maps.google.com/?q=Fakultas+Teknik+Universitas+Indonesia",
                latitude=-6.3621,
                longitude=106.8246,
                closing_time="20:30",
                food_name="Roti Sobek Cokelat Keju Artisan",
                matched_canonical_dish="Roti Sobek Manis",
                category="LOW_PERISHABILITY",
                quantity=3,
                initial_quantity=3,
                original_price=24000,
                discounted_price=12000,
                discount_percent=50,
                hours_since_cooked=1.5,
                bpom_max_hours=24.0,
                minutes_until_closing=120,
                safety_status="SAFE",
                safety_reason="Waktu simpan (1.5 jam) aman dan jauh di bawah batas maksimal BPOM untuk produk bakery (24.0 jam).",
                hazard_description="Produk bakery berkadar air rendah memiliki stabilitas mikrobiologis tinggi pada suhu ruang.",
                regulation_ref="PerBPOM No. 16/2019 Kategori Pangan 07.0",
                similarity_score=0.96,
                is_active=True,
            )
            session.add(demo_item)
            session.commit()


def get_session() -> Generator[Session, None, None]:
    """Dependency generator yielding database session."""
    with Session(engine) as session:
        yield session
