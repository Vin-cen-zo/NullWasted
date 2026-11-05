import {
  AuthResponse,
  DraftResponse,
  ItemListing,
  OrderTicket,
  PublishRequest,
  StoreMenuItem,
  StoreProfile,
} from "../types/listing";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("nw_session_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ============================================================================
// AUTH & STORE SERVICES
// ============================================================================

export async function fetchStores(): Promise<StoreProfile[]> {
  const res = await fetch(`${API_BASE_URL}/auth/stores`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Gagal mengambil data gerai mitra.");
  }
  return res.json();
}

export async function loginMerchant(storeId: string, pin: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/merchant-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store_id: storeId, pin }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Store ID atau PIN Staf Dapur tidak valid.");
  }
  return res.json();
}

export async function registerMerchant(payload: {
  name: string;
  pin: string;
  location_name: string;
  closing_time: string;
  category?: string;
  latitude?: number;
  longitude?: number;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/merchant-register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal mendaftarkan gerai mitra.");
  }
  return res.json();
}

export async function registerConsumer(payload: {
  name: string;
  phone: string;
  address?: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/consumer-register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal mendaftarkan akun konsumen.");
  }
  return res.json();
}

export async function loginConsumer(phone: string, name?: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/consumer-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, ...(name ? { name } : {}) }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal masuk sebagai konsumen.");
  }
  return res.json();
}

// ============================================================================
// STORE MASTER MENU (Layer 1 RAG)
// ============================================================================

export async function fetchStoreMenu(storeId: string): Promise<StoreMenuItem[]> {
  const res = await fetch(`${API_BASE_URL}/menu/${storeId}`, {
    headers: getAuthHeaders(),
  });
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
  }
): Promise<StoreMenuItem> {
  const res = await fetch(`${API_BASE_URL}/menu/${storeId}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal menambahkan menu ke buku menu gerai.");
  }
  return res.json();
}

export async function deleteStoreMenuItem(
  storeId: string,
  menuId: string
): Promise<{ status: string; id: string }> {
  const res = await fetch(`${API_BASE_URL}/menu/${storeId}/${menuId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Gagal menghapus item dari buku menu.");
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
  const res = await fetch(`${API_BASE_URL}/listings/draft`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ text, audio_base64: audioBase64 || null, store_id: storeId }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal menganalisis draf listing.");
  }
  return res.json();
}

export async function publishListing(payload: PublishRequest): Promise<ItemListing> {
  const res = await fetch(`${API_BASE_URL}/listings/publish`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Listing ditolak atau gagal diterbitkan.");
  }
  return res.json();
}

export async function createSmartBundle(
  storeId: string = "FTUI-001",
  discountPercent: number = 65,
  customName?: string
): Promise<ItemListing> {
  const res = await fetch(`${API_BASE_URL}/listings/smart-bundle`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      store_id: storeId,
      discount_percent: discountPercent,
      custom_bundle_name: customName || null,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal membuat paket Mystery Bag otomatis.");
  }
  return res.json();
}

export async function fetchActiveListings(storeId?: string): Promise<ItemListing[]> {
  const url = storeId
    ? `${API_BASE_URL}/listings/active?store_id=${encodeURIComponent(storeId)}`
    : `${API_BASE_URL}/listings/active`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    throw new Error("Gagal mengambil katalog aktif.");
  }
  return res.json();
}

export async function deleteListing(listingId: string): Promise<{ status: string; id: string }> {
  const res = await fetch(`${API_BASE_URL}/listings/${listingId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Gagal menghapus listing.");
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
  const res = await fetch(`${API_BASE_URL}/orders/reserve`, {
    method: "POST",
    headers: getAuthHeaders(),
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
    throw new Error(errorData.detail || "Gagal melakukan reservasi porsi.");
  }
  return res.json();
}

export async function fetchActiveOrders(filters?: {
  storeId?: string;
  customerPhone?: string;
  customerName?: string;
}): Promise<OrderTicket[]> {
  let url = `${API_BASE_URL}/orders/active`;
  const params = new URLSearchParams();
  if (filters?.storeId) params.append("store_id", filters.storeId);
  if (filters?.customerPhone) params.append("customer_phone", filters.customerPhone);
  if (filters?.customerName) params.append("customer_name", filters.customerName);

  const query = params.toString();
  if (query) url += `?${query}`;

  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    throw new Error("Gagal mengambil daftar tiket pesanan.");
  }
  return res.json();
}

export async function cancelOrder(orderId: string): Promise<OrderTicket> {
  const res = await fetch(`${API_BASE_URL}/orders/${orderId}/cancel`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal membatalkan pesanan.");
  }
  return res.json();
}

export async function completeOrderPickup(
  orderCode: string,
  storeId?: string
): Promise<OrderTicket> {
  const res = await fetch(`${API_BASE_URL}/orders/complete-pickup`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ order_code: orderCode, store_id: storeId || null }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal memverifikasi dan menyelesaikan tiket pesanan.");
  }
  return res.json();
}
