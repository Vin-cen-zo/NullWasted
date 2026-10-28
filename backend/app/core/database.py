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
    """Initialize database tables and seed demo item if empty. Safely migrate SQLite columns."""
    from app.models.listing import ItemListing  # Local import to avoid circular dependency
    
    SQLModel.metadata.create_all(engine)

    # Safe SQLite column migration check for order_tickets
    if "sqlite" in DATABASE_URL:
        with engine.connect() as conn:
            try:
                table_info = conn.execute(text("PRAGMA table_info(order_tickets)")).fetchall()
                col_names = [col[1] for col in table_info]
                if "customer_name" not in col_names and len(col_names) > 0:
                    conn.execute(text("ALTER TABLE order_tickets ADD COLUMN customer_name TEXT DEFAULT 'Konsumen NullWasted'"))
                if "completed_at" not in col_names and len(col_names) > 0:
                    conn.execute(text("ALTER TABLE order_tickets ADD COLUMN completed_at TEXT DEFAULT NULL"))
                conn.commit()
            except Exception:
                pass
    
    with Session(engine) as session:
        existing = session.exec(select(ItemListing)).first()
        if not existing:
            demo_item = ItemListing(
                id="lst-demo001",
                store_name="Dapur Barokah",
                location_badge="Kantin FTUI · 250m (🚶 3 mnt)",
                maps_url="https://maps.google.com/?q=Fakultas+Teknik+Universitas+Indonesia",
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
