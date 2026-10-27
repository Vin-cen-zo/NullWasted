import { DraftResponse, ItemListing, OrderTicket, PublishRequest } from "../types/listing";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export async function createDraft(text: string, audioBase64?: string): Promise<DraftResponse> {
  const res = await fetch(`${API_BASE_URL}/listings/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, audio_base64: audioBase64 || null }),
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Listing ditolak atau gagal diterbitkan.");
  }
  return res.json();
}

export async function fetchActiveListings(): Promise<ItemListing[]> {
  const res = await fetch(`${API_BASE_URL}/listings/active`);
  if (!res.ok) {
    throw new Error("Gagal mengambil katalog aktif.");
  }
  return res.json();
}

export async function reserveOrder(listingId: string, quantity: number = 1): Promise<OrderTicket> {
  const res = await fetch(`${API_BASE_URL}/orders/reserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listing_id: listingId, quantity }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Gagal melakukan reservasi porsi.");
  }
  return res.json();
}

export async function deleteListing(listingId: string): Promise<{ status: string; id: string }> {
  const res = await fetch(`${API_BASE_URL}/listings/${listingId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("Gagal menghapus listing.");
  }
  return res.json();
}
