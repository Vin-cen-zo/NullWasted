from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
from sqlmodel import Field, SQLModel


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store(SQLModel, table=True):
    __tablename__ = "stores"

    id: str = Field(default_factory=lambda: f"str-{uuid4().hex[:8]}", primary_key=True)
    store_id: str = Field(unique=True, index=True)  # "FTUI-001" | "MARGONDA-042" | "KUTEK-007"
    name: str = Field(default="Gerai Mitra NullWasted")
    pin_hash: str
    location_name: str = Field(default="Kantin FTUI · 250m (🚶 3 mnt)")
    latitude: float = Field(default=-6.3621)
    longitude: float = Field(default=106.8246)
    closing_time: str = Field(default="20:30")
    maps_url: str = Field(default="https://maps.google.com/?q=Fakultas+Teknik+Universitas+Indonesia")
    is_active: bool = Field(default=True)
    created_at: str = Field(default_factory=utc_now_iso)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=lambda: f"usr-{uuid4().hex[:8]}", primary_key=True)
    name: str
    phone: str = Field(index=True)
    role: str = Field(default="CONSUMER")  # "CONSUMER" | "MERCHANT"
    store_id: Optional[str] = Field(default=None)
    created_at: str = Field(default_factory=utc_now_iso)


class StoreMenuItem(SQLModel, table=True):
    __tablename__ = "store_menu_items"

    id: str = Field(default_factory=lambda: f"mnu-{uuid4().hex[:8]}", primary_key=True)
    store_id: str = Field(index=True)  # Relasi ke Store.store_id
    food_name: str = Field(index=True)
    original_price: int = Field(gt=0)
    typical_cooking_time: str = Field(default="16:00")
    default_hours_cooked: float = Field(default=2.0)
    ingredients: str = Field(default="")
    canonical_bpom_dish: str = Field(default="")
    category: str = Field(default="MEDIUM_PERISHABILITY")
    bpom_max_hours: float = Field(default=8.0)
    portion_size: str = Field(default="Reguler")
    image_url: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: str = Field(default_factory=utc_now_iso)


class ItemListing(SQLModel, table=True):
    __tablename__ = "item_listings"

    id: str = Field(default_factory=lambda: f"lst-{uuid4().hex[:8]}", primary_key=True)
    store_id: str = Field(default="FTUI-001", index=True)
    store_name: str = Field(default="Dapur Barokah")
    location_badge: str = Field(default="Kantin FTUI · 250m (🚶 3 mnt)")
    maps_url: str = Field(default="https://maps.google.com/?q=Fakultas+Teknik+Universitas+Indonesia")
    latitude: float = Field(default=-6.3626)
    longitude: float = Field(default=106.8240)
    closing_time: str = Field(default="20:30")
    is_bundle: bool = Field(default=False)
    bundled_items_json: Optional[str] = Field(default=None)

    food_name: str = Field(index=True)
    matched_canonical_dish: str
    category: str  # HIGH_PERISHABILITY | MEDIUM_PERISHABILITY | LOW_PERISHABILITY
    quantity: int = Field(ge=0)
    initial_quantity: int = Field(ge=1)
    original_price: int = Field(gt=0)
    discounted_price: int = Field(gt=0)
    discount_percent: int = Field(ge=50, le=70)
    hours_since_cooked: float = Field(ge=0.0)
    bpom_max_hours: float = Field(gt=0.0)
    minutes_until_closing: int = Field(gt=0)
    safety_status: str  # SAFE | REJECTED
    safety_reason: str
    hazard_description: str
    regulation_ref: str
    similarity_score: float = Field(default=0.95)
    portion_size: str = Field(default="Reguler")
    image_url: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True, index=True)
    created_at: str = Field(default_factory=utc_now_iso)


class OrderTicket(SQLModel, table=True):
    __tablename__ = "order_tickets"

    id: str = Field(default_factory=lambda: f"ord-{uuid4().hex[:8]}", primary_key=True)
    order_code: str = Field(index=True)  # Format: #NW-XXXX
    store_id: str = Field(default="FTUI-001", index=True)
    customer_name: str = Field(default="Konsumen NullWasted")
    customer_phone: str = Field(default="0812-8899-0011", index=True)
    listing_id: str = Field(index=True)
    food_name: str
    store_name: str
    location_badge: str
    image_url: Optional[str] = Field(default=None)
    quantity: int = Field(ge=1)
    unit_price: int = Field(gt=0)
    total_price: int = Field(gt=0)
    pickup_deadline: str
    qr_payload: str
    payment_method: str = Field(default="CASH_ON_PICKUP")  # CASH_ON_PICKUP | SIMULATED_QRIS
    payment_status: str = Field(default="UNPAID")          # UNPAID | PAID | REFUNDED
    status: str = Field(default="RESERVED")                # RESERVED | COMPLETED | CANCELLED
    created_at: str = Field(default_factory=utc_now_iso)
    completed_at: Optional[str] = Field(default=None)
    cancelled_at: Optional[str] = Field(default=None)
