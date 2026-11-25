import re
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator


class DraftRequest(BaseModel):
    text: str = Field(..., min_length=3, max_length=1000, description="Input bahasa alami dari staf penjual")
    audio_base64: Optional[str] = Field(default=None, description="Opsional rekaman suara base64")
    store_id: str = Field(default="FTUI-001", description="Store ID pemilik menu")
    store_closing_time: Optional[str] = Field(default="20:30", description="Jam tutup toko")


class DraftResponse(BaseModel):
    food_name: str
    matched_canonical_dish: str
    category: str
    food_type: str = "MEAL"
    quantity: int
    original_price: int
    recommended_discount_percent: int
    pricing_reason: Optional[str] = None
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

    # New Context-Aware Slot Filling & Multi-Tenant metadata
    store_id: str = "FTUI-001"
    catalog_match_status: str = "ADHOC_COMPLETE"  # MATCHED_CATALOG | MATCHED_WITH_OVERRIDE | ADHOC_COMPLETE | ADHOC_NEEDS_PRICE
    matched_menu_item_id: Optional[str] = None
    needs_manual_price: bool = False
    can_save_to_catalog: bool = True
    closing_time: str = "20:30"
    image_url: Optional[str] = None


class PublishRequest(BaseModel):
    food_name: str = Field(..., min_length=1, max_length=150)
    matched_canonical_dish: str
    category: str
    food_type: str = Field(default="MEAL")
    quantity: int = Field(ge=1, le=200)
    original_price: int = Field(ge=1000, le=2000000)
    discount_percent: int = Field(ge=50, le=70)
    discounted_price: Optional[int] = None
    hours_since_cooked: float = Field(ge=0.0)
    bpom_max_hours: float = Field(gt=0.0)
    minutes_until_closing: int = Field(ge=0)
    safety_status: str
    safety_reason: str
    hazard_description: str
    regulation_ref: str = "PerBPOM No. 16/2019"
    similarity_score: float = 0.95
    store_name: str = "Dapur Barokah"
    location_badge: Optional[str] = Field(default=None, max_length=200)

    # Multi-tenant & Bundling extensions
    store_id: str = "FTUI-001"
    closing_time: str = "20:30"
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    is_bundle: bool = False
    bundled_items_json: Optional[str] = None
    image_url: Optional[str] = None
    cooked_at_hhmm: Optional[str] = None

    @field_validator("closing_time")
    @classmethod
    def validate_publish_closing_time(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", cleaned):
            raise ValueError("Format jam tutup harus HH:MM (00:00 - 23:59).")
        return cleaned

    @field_validator("cooked_at_hhmm")
    @classmethod
    def validate_cooked_at_hhmm(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            return None
        if not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", cleaned):
            raise ValueError("Format jam masak harus HH:MM (00:00 - 23:59).")
        return cleaned


class ReserveOrderRequest(BaseModel):
    listing_id: str
    quantity: int = Field(default=1, ge=1, le=200)
    customer_name: str = Field(default="Budi Santoso", min_length=1)
    customer_phone: str = Field(default="0812-8899-0011")
    payment_method: str = Field(default="CASH_ON_PICKUP")  # "CASH_ON_PICKUP" | "MIDTRANS_QRIS" | "SIMULATED_QRIS"


class CartOrderItemRequest(BaseModel):
    listing_id: str
    quantity: int = Field(default=1, ge=1, le=200)


class ReserveCartRequest(BaseModel):
    items: list[CartOrderItemRequest] = Field(..., min_length=1, max_length=30)
    customer_name: str = Field(default="Budi Santoso", min_length=1)
    customer_phone: str = Field(default="0812-8899-0011")
    payment_method: str = Field(default="CASH_ON_PICKUP")


class CompletePickupRequest(BaseModel):
    order_code: str = Field(..., min_length=3, description="Kode tiket #NW-XXXX atau QR payload")
    store_id: Optional[str] = Field(default=None, description="Store ID kasir pemverifikasi (Cross-store check)")


class CancelOrderRequest(BaseModel):
    customer_phone: Optional[str] = Field(default=None, description="Opsional verifikasi nomor telepon pembeli")


class MenuItemCreateRequest(BaseModel):
    food_name: str = Field(..., min_length=2, max_length=150)
    original_price: int = Field(..., ge=1000, le=2000000)
    typical_cooking_time: str = Field(default="16:00")
    default_hours_cooked: float = Field(default=2.0, ge=0.0)
    ingredients: str = Field(default="", max_length=500)
    image_url: Optional[str] = Field(default=None)

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
    image_url: Optional[str] = None
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
    food_type: str = "MEAL"
    bpom_max_hours: float
    image_url: Optional[str] = None
    is_active: bool
    created_at: str


class ListingStockUpdateRequest(BaseModel):
    quantity: int = Field(..., ge=0, le=200)


class SmartBundleRequest(BaseModel):
    store_id: str = Field(default="FTUI-001")
    listing_ids: Optional[list[str]] = Field(default=None, description="Opsional daftar ID listing spesifik yang dipilih mitra")
    custom_bundle_name: Optional[str] = None
    discount_percent: int = Field(default=65, ge=60, le=70)


_EMAIL_REGEX = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def _validate_email_value(v: str) -> str:
    cleaned = v.strip().lower()
    if not _EMAIL_REGEX.match(cleaned):
        raise ValueError("Format email tidak valid (contoh: nama@domain.id).")
    return cleaned


def _validate_password_value(v: str) -> str:
    if len(v) < 6 or not v.strip():
        raise ValueError("Password minimal 6 karakter.")
    return v


class MerchantLoginRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email_value(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_value(v)


class MerchantRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)
    location_name: Optional[str] = Field(default="", max_length=200)
    closing_time: str = Field(default="20:30")
    category: Optional[str] = Field(default="Kuliner & Makanan")
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email_value(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_value(v)

    @field_validator("closing_time")
    @classmethod
    def validate_closing_time(cls, v: str) -> str:
        cleaned = v.strip()
        if not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", cleaned):
            raise ValueError("Format jam tutup harus HH:MM (00:00 - 23:59).")
        return cleaned


class ConsumerLoginRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email_value(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_value(v)


class ConsumerRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)
    phone: Optional[str] = Field(default=None)
    address: Optional[str] = Field(default=None)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email_value(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_value(v)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return None
        digits_norm = re.sub(r"[\s\-]+", "", stripped)
        if not re.match(r"^(?:\+62|62|0)8[1-9][0-9]{7,11}$", digits_norm):
            raise ValueError("Format nomor WhatsApp Indonesia tidak valid (contoh: 081234567890 atau +6281234567890).")
        return stripped


class AuthResponse(BaseModel):
    token: str
    role: str  # "merchant" | "consumer"
    email: Optional[str] = None
    user_id: Optional[str] = None
    store_id: Optional[str] = None
    store_name: Optional[str] = None
    store_category: Optional[str] = None
    store_description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    closing_time: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class StoreLocationUpdateRequest(BaseModel):
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    location_name: Optional[str] = Field(default=None, max_length=200)


class StoreProfileResponse(BaseModel):
    id: str
    store_id: str
    name: str
    category: str = "Kuliner & Makanan"
    description: str = ""
    location_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    closing_time: str
    maps_url: str = ""
    is_active: bool


class ConsumerProfileResponse(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: str = ""
    role: str = "consumer"
    created_at: str


class ConsumerProfileUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)

    @field_validator("phone")
    @classmethod
    def validate_profile_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return ""
        digits_norm = re.sub(r"[\s\-]+", "", stripped)
        if not re.match(r"^(?:\+62|62|0)8[1-9][0-9]{7,11}$", digits_norm):
            raise ValueError("Format nomor WhatsApp Indonesia tidak valid (contoh: 081234567890).")
        return stripped


class StoreProfileUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    category: Optional[str] = Field(default=None, min_length=2, max_length=80)
    closing_time: Optional[str] = Field(default=None)
    location_name: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)

    @field_validator("closing_time")
    @classmethod
    def validate_profile_closing_time(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", cleaned):
            raise ValueError("Format jam tutup harus HH:MM (00:00 - 23:59).")
        return cleaned


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_password_value(v)


class PublicStoreDetailResponse(BaseModel):
    store: StoreProfileResponse
    active_listings: list[Any]
    active_listing_count: int


class FavoriteStoresResponse(BaseModel):
    store_ids: list[str]


class BatchDraftResponse(BaseModel):
    items: list[DraftResponse]
    total_count: int
    safe_count: int


class QrisCreateRequest(BaseModel):
    listing_id: Optional[str] = None
    quantity: int = Field(default=1, ge=1, le=200)
    items: Optional[list[CartOrderItemRequest]] = None
    customer_name: str = Field(default="Konsumen NullWasted", min_length=1)
    customer_phone: str = Field(default="0812-8899-0011")


class QrisCreateResponse(BaseModel):
    ticket: Any
    qris_url: Optional[str] = None
    qris_string: Optional[str] = None
    midtrans_transaction_id: Optional[str] = None
    payment_expires_at: Optional[str] = None
    simulator_url: Optional[str] = None


class PaymentStatusResponse(BaseModel):
    order_id: str
    order_code: str
    status: str
    payment_status: str
    payment_method: str
    payment_expires_at: Optional[str] = None


class BulkMenuImportPreviewItem(BaseModel):
    food_name: str
    original_price: int
    ingredients: str
    typical_cooking_time: str = "16:00"
    canonical_bpom_dish: str
    category: str
    food_type: str = "MEAL"
    bpom_max_hours: float
    safety_status: str = "SAFE"
    safety_reason: str = ""
    can_save: bool = True


class BulkMenuImportPreviewResponse(BaseModel):
    items: list[BulkMenuImportPreviewItem]
    total_count: int
    valid_count: int
    extraction_source: str


class BulkMenuCreateItem(BaseModel):
    food_name: str = Field(..., min_length=2, max_length=150)
    original_price: int = Field(..., ge=1000, le=2000000)
    ingredients: str = Field(..., min_length=3, max_length=500)
    typical_cooking_time: str = Field(default="16:00")
    default_hours_cooked: float = Field(default=1.0, ge=0.0, le=48.0)
    image_url: Optional[str] = None

    @field_validator("typical_cooking_time")
    @classmethod
    def validate_bulk_cooking_time(cls, v: str) -> str:
        cleaned = (v or "16:00").strip()
        if not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", cleaned):
            return "16:00"
        return cleaned


class BulkMenuCreateRequest(BaseModel):
    items: list[BulkMenuCreateItem] = Field(..., min_length=1, max_length=50)
