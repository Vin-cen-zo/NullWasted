import logging
from typing import Generator
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select
from app.core.config import DATABASE_URL
from app.core.seed import seed_initial_data

logger = logging.getLogger("database")

_is_sqlite = DATABASE_URL.startswith("sqlite")

_engine_kwargs: dict = {
    "echo": False,
}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs.update(
        {
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "pool_size": 5,
            "max_overflow": 10,
        }
    )

engine = create_engine(DATABASE_URL, **_engine_kwargs)


def init_db() -> None:
    """Initialize database tables and seed demo items if empty. Safely migrate SQLite columns."""
    from app.models.listing import (
        ItemListing,
        OrderTicket,
        Store,
        StoreMenuItem,
        User,
        UserFavoriteStore,
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
                    if "food_type" not in item_cols:
                        conn.execute(text("ALTER TABLE item_listings ADD COLUMN food_type TEXT DEFAULT 'MEAL'"))

                # 2. store_menu_items migrations
                menu_cols = [c[1] for c in conn.execute(text("PRAGMA table_info(store_menu_items)")).fetchall()]
                if menu_cols:
                    if "portion_size" not in menu_cols:
                        conn.execute(text("ALTER TABLE store_menu_items ADD COLUMN portion_size TEXT DEFAULT 'Reguler'"))
                    if "image_url" not in menu_cols:
                        conn.execute(text("ALTER TABLE store_menu_items ADD COLUMN image_url TEXT DEFAULT NULL"))
                    if "food_type" not in menu_cols:
                        conn.execute(text("ALTER TABLE store_menu_items ADD COLUMN food_type TEXT DEFAULT 'MEAL'"))

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
                    if "user_id" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN user_id TEXT DEFAULT NULL"))
                    if "expires_at" not in order_cols:
                        conn.execute(text("ALTER TABLE order_tickets ADD COLUMN expires_at DATETIME DEFAULT NULL"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_order_tickets_user_id ON order_tickets (user_id)"))

                # 3b. stores & users auth migrations (Email + PBKDF2 Password) + nullable lat/lng
                store_info = conn.execute(text("PRAGMA table_info(stores)")).fetchall()
                store_cols = [c[1] for c in store_info]
                if store_cols:
                    if "email" not in store_cols:
                        conn.execute(text("ALTER TABLE stores ADD COLUMN email TEXT DEFAULT NULL"))
                    if "password_hash" not in store_cols:
                        conn.execute(text("ALTER TABLE stores ADD COLUMN password_hash TEXT DEFAULT NULL"))
                    if "category" not in store_cols:
                        conn.execute(text("ALTER TABLE stores ADD COLUMN category TEXT DEFAULT 'Kuliner & Makanan'"))
                    if "description" not in store_cols:
                        conn.execute(text("ALTER TABLE stores ADD COLUMN description TEXT DEFAULT ''"))

                    # Rebuild legacy SQLite stores table if latitude/longitude still have NOT NULL constraints
                    lat_col = next((c for c in store_info if c[1] == "latitude"), None)
                    lng_col = next((c for c in store_info if c[1] == "longitude"), None)
                    if (lat_col and lat_col[3] == 1) or (lng_col and lng_col[3] == 1):
                        conn.execute(text("DROP TABLE IF EXISTS stores_migrated"))
                        conn.execute(text("""
                            CREATE TABLE stores_migrated (
                                id VARCHAR NOT NULL PRIMARY KEY,
                                store_id VARCHAR NOT NULL,
                                name VARCHAR NOT NULL,
                                email VARCHAR DEFAULT NULL,
                                password_hash VARCHAR DEFAULT NULL,
                                pin_hash VARCHAR NOT NULL DEFAULT '',
                                location_name VARCHAR NOT NULL DEFAULT 'Lokasi belum diatur',
                                latitude FLOAT DEFAULT NULL,
                                longitude FLOAT DEFAULT NULL,
                                closing_time VARCHAR NOT NULL DEFAULT '20:30',
                                category VARCHAR NOT NULL DEFAULT 'Kuliner & Makanan',
                                description VARCHAR NOT NULL DEFAULT '',
                                maps_url VARCHAR NOT NULL DEFAULT '',
                                is_active BOOLEAN NOT NULL DEFAULT 1,
                                created_at VARCHAR NOT NULL
                            )
                        """))
                        conn.execute(text("""
                            INSERT INTO stores_migrated (
                                id, store_id, name, email, password_hash, pin_hash,
                                location_name, latitude, longitude, closing_time, category, description, maps_url,
                                is_active, created_at
                            )
                            SELECT
                                id, store_id, name, email, password_hash, pin_hash,
                                location_name, latitude, longitude, closing_time,
                                COALESCE(category, 'Kuliner & Makanan'),
                                COALESCE(description, ''),
                                maps_url,
                                is_active, created_at
                            FROM stores
                        """))
                        conn.execute(text("DROP TABLE stores"))
                        conn.execute(text("ALTER TABLE stores_migrated RENAME TO stores"))
                        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_stores_store_id ON stores (store_id)"))

                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_stores_email ON stores (email) WHERE email IS NOT NULL"))

                user_cols = [c[1] for c in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
                if user_cols:
                    if "email" not in user_cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN email TEXT DEFAULT NULL"))
                    if "password_hash" not in user_cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT NULL"))
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email) WHERE email IS NOT NULL"))

                # 4. Backfill 3-zone coordinates ONLY when coordinates are missing (never overwrite custom UI pins)
                conn.execute(text("UPDATE stores SET latitude = -6.3621, longitude = 106.8246, location_name = 'Kantin FTUI · 110m (🚶 2 mnt)' WHERE store_id = 'FTUI-001' AND (latitude IS NULL OR longitude IS NULL) AND location_name != 'Lokasi peta belum dipasang'"))
                conn.execute(text("UPDATE stores SET latitude = -6.3575, longitude = 106.8195, location_name = 'Kukusan Teknik (Kutek) · 780m (🚶 9 mnt)' WHERE store_id = 'KUTEK-007' AND (latitude IS NULL OR longitude IS NULL) AND location_name != 'Lokasi peta belum dipasang'"))
                conn.execute(text("UPDATE stores SET latitude = -6.3685, longitude = 106.8375, location_name = 'Jl. Margonda Raya · 1.8km (🛵 5 mnt)' WHERE store_id = 'MARGONDA-042' AND (latitude IS NULL OR longitude IS NULL) AND location_name != 'Lokasi peta belum dipasang'"))
                conn.execute(text("UPDATE item_listings SET latitude = -6.3621, longitude = 106.8246, location_badge = 'Kantin FTUI · 110m (🚶 2 mnt)' WHERE store_id = 'FTUI-001' AND (latitude IS NULL OR longitude IS NULL)"))
                conn.execute(text("UPDATE item_listings SET latitude = -6.3575, longitude = 106.8195, location_badge = 'Kukusan Teknik (Kutek) · 780m (🚶 9 mnt)' WHERE store_id = 'KUTEK-007' AND (latitude IS NULL OR longitude IS NULL)"))
                conn.execute(text("UPDATE item_listings SET latitude = -6.3685, longitude = 106.8375, location_badge = 'Jl. Margonda Raya · 1.8km (🛵 5 mnt)' WHERE store_id = 'MARGONDA-042' AND (latitude IS NULL OR longitude IS NULL)"))

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

                # 6. Backfill food_type on legacy rows
                conn.execute(text("UPDATE store_menu_items SET food_type = 'BAKERY' WHERE (food_name LIKE '%Croissant%' OR food_name LIKE '%Roti%' OR food_name LIKE '%Donat%' OR food_name LIKE '%Danish%') AND (food_type IS NULL OR food_type = 'MEAL')"))
                conn.execute(text("UPDATE store_menu_items SET food_type = 'BEVERAGE' WHERE (food_name LIKE '%Kopi%' OR food_name LIKE '%Cendol%' OR food_name LIKE '%Matcha%' OR food_name LIKE '%Boba%' OR food_name LIKE '%Teh%') AND (food_type IS NULL OR food_type = 'MEAL')"))
                conn.execute(text("UPDATE item_listings SET food_type = 'BAKERY' WHERE (food_name LIKE '%Croissant%' OR food_name LIKE '%Roti%' OR food_name LIKE '%Donat%' OR food_name LIKE '%Danish%') AND (food_type IS NULL OR food_type = 'MEAL')"))
                conn.execute(text("UPDATE item_listings SET food_type = 'BEVERAGE' WHERE (food_name LIKE '%Kopi%' OR food_name LIKE '%Cendol%' OR food_name LIKE '%Matcha%' OR food_name LIKE '%Boba%' OR food_name LIKE '%Teh%') AND (food_type IS NULL OR food_type = 'MEAL')"))

                conn.commit()
            except Exception as exc:
                logger.warning("SQLite auto-migration skipped or failed: %s", exc)
    else:
        # Non-destructive PostgreSQL column migrations for Neon / production DB
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE stores ADD COLUMN IF NOT EXISTS category VARCHAR DEFAULT 'Kuliner & Makanan'"))
                conn.execute(text("ALTER TABLE stores ADD COLUMN IF NOT EXISTS description VARCHAR DEFAULT ''"))
                conn.execute(text("ALTER TABLE order_tickets ADD COLUMN IF NOT EXISTS user_id VARCHAR DEFAULT NULL"))
                conn.execute(text("ALTER TABLE order_tickets ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT NULL"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_order_tickets_user_id ON order_tickets (user_id)"))
                conn.commit()
            except Exception as exc:
                logger.warning("PostgreSQL auto-migration skipped or failed: %s", exc)

    with Session(engine) as session:
        seed_initial_data(session)


def get_session() -> Generator[Session, None, None]:
    """Dependency generator yielding database session."""
    with Session(engine) as session:
        yield session
