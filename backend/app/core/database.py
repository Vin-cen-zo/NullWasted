from typing import Generator
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select
from app.core.config import DATABASE_URL
from app.core.seed import seed_initial_data

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
        seed_initial_data(session)


def get_session() -> Generator[Session, None, None]:
    """Dependency generator yielding database session."""
    with Session(engine) as session:
        yield session
