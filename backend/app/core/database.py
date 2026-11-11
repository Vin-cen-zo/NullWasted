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

    # Safe SQLite column migration check for item_listings, store_menu_items, and order_tickets
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
                    if "portion_size" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN portion_size TEXT DEFAULT 'Reguler'"))
                    if "image_url" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN image_url TEXT DEFAULT NULL"))
                    if "expires_at" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN expires_at DATETIME DEFAULT NULL"))

                # 2. store_menu_items migrations
                menu_cols = [c[1] for c in conn.execute(text("PRAGMA table_info(store_menu_items)")).fetchall()]
                if menu_cols:
                    if "portion_size" not in menu_cols:
                        conn.execute(text("ALTER TABLE store_menu_items ADD COLUMN portion_size TEXT DEFAULT 'Reguler'"))
                    if "image_url" not in menu_cols:
                        conn.execute(text("ALTER TABLE store_menu_items ADD COLUMN image_url TEXT DEFAULT NULL"))

                # 3. order_tickets migrations
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
                    if "image_url" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN image_url TEXT DEFAULT NULL"))

                # 4. Synchronize 3-zone store & listing coordinates for responsive radius filtering
                conn.execute(text("UPDATE stores SET latitude = -6.3621, longitude = 106.8246, location_name = 'Kantin FTUI · 110m (🚶 2 mnt)' WHERE store_id = 'FTUI-001'"))
                conn.execute(text("UPDATE stores SET latitude = -6.3575, longitude = 106.8195, location_name = 'Kukusan Teknik (Kutek) · 780m (🚶 9 mnt)' WHERE store_id = 'KUTEK-007'"))
                conn.execute(text("UPDATE stores SET latitude = -6.3685, longitude = 106.8375, location_name = 'Jl. Margonda Raya · 1.8km (🛵 5 mnt)' WHERE store_id = 'MARGONDA-042'"))
                conn.execute(text("UPDATE item_listings SET latitude = -6.3621, longitude = 106.8246, location_badge = 'Kantin FTUI · 110m (🚶 2 mnt)' WHERE store_id = 'FTUI-001'"))
                conn.execute(text("UPDATE item_listings SET latitude = -6.3575, longitude = 106.8195, location_badge = 'Kukusan Teknik (Kutek) · 780m (🚶 9 mnt)' WHERE store_id = 'KUTEK-007'"))
                conn.execute(text("UPDATE item_listings SET latitude = -6.3685, longitude = 106.8375, location_badge = 'Jl. Margonda Raya · 1.8km (🛵 5 mnt)' WHERE store_id = 'MARGONDA-042'"))

                # 5. Backfill demo image_url if null
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/rendang.jpg' WHERE food_name LIKE '%Rendang%' AND image_url IS NULL"))
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/ayam_bakar.jpg' WHERE food_name LIKE '%Ayam%' AND image_url IS NULL"))
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/tahu_tempe.jpg' WHERE food_name LIKE '%Tahu%' AND image_url IS NULL"))
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/croissant.jpg' WHERE food_name LIKE '%Croissant%' AND image_url IS NULL"))
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/roti_unyil.jpg' WHERE (food_name LIKE '%Sobek%' OR food_name LIKE '%Danish%') AND image_url IS NULL"))
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/donat_klasik.jpg' WHERE food_name LIKE '%Donat%' AND image_url IS NULL"))
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/indomie.jpg' WHERE food_name LIKE '%Mie%' AND image_url IS NULL"))
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/pisang_bakar.jpg' WHERE food_name LIKE '%Pisang%' AND image_url IS NULL"))
                conn.execute(text("UPDATE store_menu_items SET image_url = '/assets/foods/kopi_susu.jpg' WHERE food_name LIKE '%Kopi%' AND image_url IS NULL"))

                conn.execute(text("UPDATE item_listings SET image_url = '/assets/foods/ayam_bakar.jpg' WHERE food_name LIKE '%Ayam%' AND image_url IS NULL"))
                conn.execute(text("UPDATE item_listings SET image_url = '/assets/foods/tahu_tempe.jpg' WHERE food_name LIKE '%Tahu%' AND image_url IS NULL"))
                conn.execute(text("UPDATE item_listings SET image_url = '/assets/foods/croissant.jpg' WHERE food_name LIKE '%Croissant%' AND image_url IS NULL"))
                conn.execute(text("UPDATE item_listings SET image_url = '/assets/foods/donat_klasik.jpg' WHERE food_name LIKE '%Donat%' AND image_url IS NULL"))
                conn.execute(text("UPDATE item_listings SET image_url = '/assets/foods/pisang_bakar.jpg' WHERE food_name LIKE '%Pisang%' AND image_url IS NULL"))
                conn.execute(text("UPDATE item_listings SET image_url = '/assets/foods/mystery_bag.jpg' WHERE is_bundle = 1 AND image_url IS NULL"))

                conn.commit()
            except Exception:
                pass

    with Session(engine) as session:
        seed_initial_data(session)


def get_session() -> Generator[Session, None, None]:
    """Dependency generator yielding database session."""
    with Session(engine) as session:
        yield session
