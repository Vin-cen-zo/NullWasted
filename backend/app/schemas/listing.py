from typing import Optional
from pydantic import BaseModel, Field


class DraftRequest(BaseModel):
    text: str = Field(..., min_length=3, description="Input bahasa alami dari staf penjual")
    audio_base64: Optional[str] = Field(default=None, description="Opsional rekaman suara base64")
    store_closing_time: Optional[str] = Field(default="21:00", description="Jam tutup toko")


class DraftResponse(BaseModel):
    food_name: str
    matched_canonical_dish: str
    category: str
    quantity: int
    original_price: int
    recommended_discount_percent: int
    discounted_price: int
    hours_since_cooked: float
    bpom_max_hours: float
    minutes_until_closing: int
    safety_status: str  # "SAFE" | "REJECTED"
    safety_reason: str
    hazard_description: str
    regulation_ref: str
    similarity_score: float
    extraction_source: str  # "gemini-2.0-flash" | "local-fallback-parser"
    can_publish: bool


class PublishRequest(BaseModel):
    food_name: str
    matched_canonical_dish: str
    category: str
    quantity: int = Field(ge=1)
    original_price: int = Field(gt=0)
    discount_percent: int = Field(ge=50, le=70)
    discounted_price: Optional[int] = None
    hours_since_cooked: float = Field(ge=0.0)
    bpom_max_hours: float = Field(gt=0.0)
    minutes_until_closing: int = Field(gt=0)
    safety_status: str
    safety_reason: str
    hazard_description: str
    regulation_ref: str = "PerBPOM No. 16/2019"
    similarity_score: float = 0.95
    store_name: str = "Dapur Barokah"
    location_badge: str = "Kantin FTUI · 250m (🚶 3 mnt)"


class ReserveOrderRequest(BaseModel):
    listing_id: str
    quantity: int = Field(default=1, ge=1)
