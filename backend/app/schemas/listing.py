import re
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator


class DraftRequest(BaseModel):
    text: str = Field(..., min_length=3, description="Input bahasa alami dari staf penjual")
    audio_base64: Optional[str] = Field(default=None, description="Opsional rekaman suara base64")
    store_id: str = Field(default="FTUI-001", description="Store ID pemilik menu")
    store_closing_time: Optional[str] = Field(default="20:30", description="Jam tutup toko")


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
    extraction_source: str  # "gemini-3.5-flash-lite" | "local-fallback-parser"
    can_publish: bool
    portion_size: str = "Reguler"

    # New Context-Aware Slot Filling & Multi-Tenant metadata
    store_id: str = "FTUI-001"
    catalog_match_status: str = "ADHOC_COMPLETE"  # MATCHED_CATALOG | MATCHED_WITH_OVERRIDE | ADHOC_COMPLETE | ADHOC_NEEDS_PRICE
    matched_menu_item_id: Optional[str] = None
    needs_manual_price: bool = False
    can_save_to_catalog: bool = True
    closing_time: str = "20:30"


class PublishRequest(BaseModel):
    food_name: str
    matched_canonical_dish: str
    category: str
    quantity: int = Field(ge=1, le=200)
    original_price: int = Field(ge=1000, le=2000000)
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
    location_badge: str = "Kantin FTUI · 110m (🚶 2 mnt)"
    portion_size: str = Field(default="Reguler")

    # Multi-tenant & Bundling extensions
    store_id: str = "FTUI-001"
    closing_time: str = "20:30"
    latitude: float = -6.3621
    longitude: float = 106.8246
    is_bundle: bool = False
    bundled_items_json: Optional[str] = None


class ReserveOrderRequest(BaseModel):
    listing_id: str
    quantity: int = Field(default=1, ge=1, le=200)
    customer_name: str = Field(default="Budi Santoso", min_length=1)
    customer_phone: str = Field(default="0812-8899-0011")
    payment_method: str = Field(default="CASH_ON_PICKUP")  # "CASH_ON_PICKUP" | "SIMULATED_QRIS"


class CompletePickupRequest(BaseModel):
    order_code: str = Field(..., min_length=3, description="Kode tiket #NW-XXXX atau QR payload")
    store_id: Optional[str] = Field(default=None, description="Store ID kasir pemverifikasi (Cross-store check)")


class CancelOrderRequest(BaseModel):
    customer_phone: Optional[str] = Field(default=None, description="Opsional verifikasi nomor telepon pembeli")


class MenuItemCreateRequest(BaseModel):
    food_name: str = Field(..., min_length=2)
    original_price: int = Field(..., ge=1000, le=2000000)
    typical_cooking_time: str = Field(default="16:00")
    default_hours_cooked: float = Field(default=2.0, ge=0.0)
    ingredients: str = Field(default="")
    portion_size: str = Field(default="Reguler")

    @field_validator("typical_cooking_time")
    @classmethod
    def validate_typical_cooking_time(cls, v: str) -> str:
        if not re.match(r"^([01]\d|2[0-3]):([0-5]\d)$", v.strip()):
            raise ValueError("Format jam masak harus HH:MM (24 jam), contoh: 16:00")
        return v.strip()


class MenuItemUpdateRequest(BaseModel):
    food_name: Optional[str] = None
    original_price: Optional[int] = Field(default=None, ge=1000, le=2000000)
    typical_cooking_time: Optional[str] = None
    default_hours_cooked: Optional[float] = None
    ingredients: Optional[str] = None
    portion_size: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("typical_cooking_time")
    @classmethod
    def validate_update_cooking_time(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^([01]\d|2[0-3]):([0-5]\d)$", v.strip()):
            raise ValueError("Format jam masak harus HH:MM (24 jam), contoh: 16:00")
        return v.strip() if v is not None else None


class MenuItemResponse(BaseModel):
    id: str
    store_id: str
    food_name: str
    original_price: int
    typical_cooking_time: str
    default_hours_cooked: float
    ingredients: str
    canonical_bpom_dish: str
    category: str
    bpom_max_hours: float
    portion_size: str = "Reguler"
    is_active: bool
    created_at: str


class SmartBundleRequest(BaseModel):
    store_id: str = Field(default="FTUI-001")
    custom_bundle_name: Optional[str] = None
    discount_percent: int = Field(default=65, ge=50, le=70)


class MerchantLoginRequest(BaseModel):
    store_id: str = Field(..., min_length=2)
    pin: str = Field(..., min_length=4)


class MerchantRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2)
    pin: str = Field(..., min_length=4)
    location_name: str = Field(..., min_length=2)
    closing_time: str = Field(default="20:30")
    category: Optional[str] = Field(default="Kuliner & Makanan")
    latitude: float = Field(default=-6.3621)
    longitude: float = Field(default=106.8246)


class ConsumerLoginRequest(BaseModel):
    phone: str = Field(..., min_length=8)
    name: Optional[str] = Field(default=None)


class ConsumerRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2)
    phone: str = Field(..., min_length=8)
    address: Optional[str] = Field(default="Kawasan UI Depok")


class AuthResponse(BaseModel):
    token: str
    role: str  # "merchant" | "consumer"
    user_id: Optional[str] = None
    store_id: Optional[str] = None
    store_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    closing_time: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class StoreProfileResponse(BaseModel):
    id: str
    store_id: str
    name: str
    location_name: str
    latitude: float
    longitude: float
    closing_time: str
    maps_url: str
    is_active: bool
