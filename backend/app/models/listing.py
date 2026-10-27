from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
from sqlmodel import Field, SQLModel


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ItemListing(SQLModel, table=True):
    __tablename__ = "item_listings"

    id: str = Field(default_factory=lambda: f"lst-{uuid4().hex[:8]}", primary_key=True)
    store_name: str = Field(default="Dapur Barokah")
    location_badge: str = Field(default="Kantin FTUI · 250m (🚶 3 mnt)")
    maps_url: str = Field(default="https://maps.google.com/?q=Fakultas+Teknik+Universitas+Indonesia")
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
    is_active: bool = Field(default=True, index=True)
    created_at: str = Field(default_factory=utc_now_iso)


class OrderTicket(SQLModel, table=True):
    __tablename__ = "order_tickets"

    id: str = Field(default_factory=lambda: f"ord-{uuid4().hex[:8]}", primary_key=True)
    order_code: str = Field(index=True)  # Format: #NW-XXXX
    listing_id: str = Field(index=True)
    food_name: str
    store_name: str
    location_badge: str
    quantity: int = Field(ge=1)
    unit_price: int = Field(gt=0)
    total_price: int = Field(gt=0)
    pickup_deadline: str
    qr_payload: str
    status: str = Field(default="RESERVED")
    created_at: str = Field(default_factory=utc_now_iso)
