import {
  AuthResponse,
  DraftResponse,
  ItemListing,
  OrderTicket,
  PublishRequest,
  StoreMenuItem,
  StoreProfile,
} from "../types/listing";
import { getSimulatedTimeIsoHeader } from "../utils/clock";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
export const NW_AUTH_EXPIRED_EVENT = "nw-auth-expired";

/**
 * Normalizes Pydantic 422 validation errors, backend string details, or unknown errors
 * into human-readable Indonesian error messages without ever rendering "[object Object]".
 */
export function formatApiError(detail: unknown, fallback: string = "Terjadi kesalahan pada sistem."): string {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const loc = Array.isArray((item as { loc?: unknown[] }).loc)
            ? (item as { loc: unknown[] }).loc.slice(-1)[0]
            : "";
          const prefix = loc && typeof loc === "string" && !loc.startsWith("body") ? `${loc}: ` : "";
          return `${prefix}${String((item as { msg: unknown }).msg)}`;
        }
        return JSON.stringify(item);
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join(" | ") : fallback;
  }
  if (typeof detail === "object") {
    if ("message" in detail && typeof (detail as { message: unknown }).message === "string") {
      return (detail as { message: string }).message;
    }
    return JSON.stringify(detail);
  }
  return String(detail);
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = localStorage.getItem("nw_session_token");
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const simulatedHeader = getSimulatedTimeIsoHeader();
  if (simulatedHeader) {
    headers.set("X-Simulated-Time", simulatedHeader);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (
    res.status === 401 &&
    !path.startsWith("/auth/merchant-login") &&
    !path.startsWith("/auth/consumer-login")
  ) {
    localStorage.removeItem("nw_user_session");
    localStorage.removeItem("nw_session_token");
    window.dispatchEvent(new CustomEvent(NW_AUTH_EXPIRED_EVENT));
  }

  return res;
}

// ============================================================================
// AUTH & STORE SERVICES
// ============================================================================

export async function fetchStores(): Promise<StoreProfile[]> {
  const res = await apiFetch("/auth/stores");
  if (!res.ok) {
    throw new Error("Gagal mengambil data gerai mitra.");
  }
  return res.json();
}

export async function loginMerchant(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch("/auth/merchant-login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Email atau password gerai tidak valid."));
  }
  return res.json();
}

export async function registerMerchant(payload: {
  name: string;
  email: string;
  password: string;
  location_name?: string;
  closing_time: string;
  category?: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<AuthResponse> {
  const res = await apiFetch("/auth/merchant-register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal mendaftarkan gerai mitra."));
  }
  return res.json();
}

export async function updateStoreLocation(
  storeId: string,
  payload: {
    latitude: number | null;
    longitude: number | null;
    location_name?: string | null;
  }
): Promise<StoreProfile> {
  const res = await apiFetch(`/auth/stores/${encodeURIComponent(storeId)}/location`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal memperbarui pin lokasi gerai."));
  }
  return res.json();
}

export async function registerConsumer(payload: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
}): Promise<AuthResponse> {
  const res = await apiFetch("/auth/consumer-register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal mendaftarkan akun konsumen."));
  }
  return res.json();
}

export async function loginConsumer(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch("/auth/consumer-login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Email atau password akun konsumen tidak valid."));
  }
  return res.json();
}

// ============================================================================
// STORE MASTER MENU (Layer 1 RAG)
// ============================================================================

export async function fetchStoreMenu(storeId: string): Promise<StoreMenuItem[]> {
  const res = await apiFetch(`/menu/${storeId}`);
  if (!res.ok) {
    throw new Error("Gagal mengambil buku menu gerai.");
  }
  return res.json();
}

export async function createStoreMenuItem(
  storeId: string,
  payload: {
    food_name: string;
    original_price: number;
    typical_cooking_time?: string;
    default_hours_cooked?: number;
    ingredients?: string;
    portion_size?: string;
    image_url?: string | null;
  }
): Promise<StoreMenuItem> {
  const res = await apiFetch(`/menu/${storeId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal menambahkan menu ke buku menu gerai."));
  }
  return res.json();
}

export async function deleteStoreMenuItem(
  storeId: string,
  menuId: string
): Promise<{ status: string; id: string }> {
  const res = await apiFetch(`/menu/${storeId}/${menuId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal menghapus item dari buku menu."));
  }
  return res.json();
}

// ============================================================================
// IMAGE UPLOAD SERVICE
// ============================================================================

export async function uploadMenuImage(
  file: File
): Promise<{ image_url: string; storage_mode: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch("/upload-image", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal mengunggah foto makanan."));
  }

  return res.json();
}

// ============================================================================
// LISTINGS & MYSTERY BAG BUNDLING
// ============================================================================

export async function createDraft(
  text: string,
  audioBase64?: string,
  storeId: string = "FTUI-001"
): Promise<DraftResponse> {
  const res = await apiFetch("/listings/draft", {
    method: "POST",
    body: JSON.stringify({ text, audio_base64: audioBase64 || null, store_id: storeId }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal menganalisis draf listing."));
  }
  return res.json();
}

export async function publishListing(payload: PublishRequest): Promise<ItemListing> {
  const res = await apiFetch("/listings/publish", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Listing ditolak atau gagal diterbitkan."));
  }
  return res.json();
}

export async function createSmartBundle(
  storeId: string = "FTUI-001",
  discountPercent: number = 65,
  customName?: string
): Promise<ItemListing> {
  const res = await apiFetch("/listings/smart-bundle", {
    method: "POST",
    body: JSON.stringify({
      store_id: storeId,
      discount_percent: discountPercent,
      custom_bundle_name: customName || null,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal membuat paket Mystery Bag otomatis."));
  }
  return res.json();
}

export async function fetchActiveListings(storeId?: string): Promise<ItemListing[]> {
  const path = storeId
    ? `/listings/active?store_id=${encodeURIComponent(storeId)}`
    : "/listings/active";
  const res = await apiFetch(path);
  if (!res.ok) {
    throw new Error("Gagal mengambil katalog aktif.");
  }
  return res.json();
}

export async function deleteListing(listingId: string): Promise<{ status: string; id: string }> {
  const res = await apiFetch(`/listings/${listingId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal menghapus listing."));
  }
  return res.json();
}

// ============================================================================
// ORDERS & LIFECYCLE
// ============================================================================

export async function reserveOrder(
  listingId: string,
  quantity: number = 1,
  customerName: string = "Budi Santoso",
  customerPhone: string = "0812-8899-0011",
  paymentMethod: string = "CASH_ON_PICKUP"
): Promise<OrderTicket> {
  const res = await apiFetch("/orders/reserve", {
    method: "POST",
    body: JSON.stringify({
      listing_id: listingId,
      quantity,
      customer_name: customerName,
      customer_phone: customerPhone,
      payment_method: paymentMethod,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal melakukan reservasi porsi."));
  }
  return res.json();
}

export async function fetchActiveOrders(filters?: {
  storeId?: string;
  customerPhone?: string;
  customerName?: string;
}): Promise<OrderTicket[]> {
  let path = "/orders/active";
  const params = new URLSearchParams();
  if (filters?.storeId) params.append("store_id", filters.storeId);
  if (filters?.customerPhone) params.append("customer_phone", filters.customerPhone);
  if (filters?.customerName) params.append("customer_name", filters.customerName);

  const query = params.toString();
  if (query) path += `?${query}`;

  const res = await apiFetch(path);
  if (!res.ok) {
    throw new Error("Gagal mengambil daftar tiket pesanan.");
  }
  return res.json();
}

export async function cancelOrder(orderId: string): Promise<OrderTicket> {
  const res = await apiFetch(`/orders/${orderId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal membatalkan pesanan."));
  }
  return res.json();
}

export async function completeOrderPickup(
  orderCode: string,
  storeId?: string
): Promise<OrderTicket> {
  const res = await apiFetch("/orders/complete-pickup", {
    method: "POST",
    body: JSON.stringify({ order_code: orderCode, store_id: storeId || null }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, "Gagal memverifikasi dan menyelesaikan tiket pesanan."));
  }
  return res.json();
}
