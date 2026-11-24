export interface StoreMenuItem {
  id: string;
  store_id: string;
  food_name: string;
  original_price: number;
  typical_cooking_time: string;
  default_hours_cooked: number;
  ingredients: string;
  canonical_bpom_dish: string;
  category: string;
  food_type?: string;
  bpom_max_hours: number;
  portion_size?: string;
  image_url?: string | null;
  is_active: boolean;
  expires_at?: string | null;
  created_at: string;
}

export interface StoreProfile {
  id: string;
  store_id: string;
  name: string;
  category?: string;
  description?: string;
  location_name: string;
  latitude?: number | null;
  longitude?: number | null;
  closing_time: string;
  maps_url: string;
  is_active: boolean;
}

export interface ConsumerProfile {
  id: string;
  name: string;
  email?: string | null;
  phone: string;
  role: string;
  created_at: string;
}

export interface PublicStoreDetail {
  store: StoreProfile;
  active_listings: ItemListing[];
  active_listing_count: number;
}

export interface DraftResponse {
  food_name: string;
  matched_canonical_dish: string;
  category: string;
  food_type?: string;
  quantity: number;
  original_price: number;
  recommended_discount_percent: number;
  discounted_price: number;
  hours_since_cooked: number;
  bpom_max_hours: number;
  minutes_until_closing: number;
  safety_status: "SAFE" | "REJECTED";
  safety_reason: string;
  hazard_description: string;
  regulation_ref: string;
  similarity_score: number;
  extraction_source: string;
  can_publish: boolean;
  portion_size?: string;

  // New Context-Aware Slot Filling & Multi-Tenant metadata
  store_id?: string;
  catalog_match_status?: "MATCHED_CATALOG" | "MATCHED_WITH_OVERRIDE" | "ADHOC_COMPLETE" | "ADHOC_NEEDS_PRICE";
  matched_menu_item_id?: string | null;
  needs_manual_price?: boolean;
  can_save_to_catalog?: boolean;
  closing_time?: string;
  image_url?: string | null;
}

export interface PublishRequest {
  food_name: string;
  matched_canonical_dish: string;
  category: string;
  food_type?: string;
  quantity: number;
  original_price: number;
  discount_percent: number;
  discounted_price?: number;
  hours_since_cooked: number;
  bpom_max_hours: number;
  minutes_until_closing: number;
  safety_status: string;
  safety_reason: string;
  hazard_description: string;
  regulation_ref?: string;
  similarity_score?: number;
  store_name?: string;
  location_badge?: string;
  portion_size?: string;

  // Multi-tenant & bundling
  store_id?: string;
  closing_time?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_bundle?: boolean;
  bundled_items_json?: string | null;
  image_url?: string | null;
  cooked_at_hhmm?: string;
}

export interface ItemListing {
  id: string;
  store_id?: string;
  store_name: string;
  location_badge: string;
  maps_url: string;
  latitude?: number | null;
  longitude?: number | null;
  closing_time?: string;
  is_bundle?: boolean;
  bundled_items_json?: string | null;
  portion_size?: string;

  food_name: string;
  matched_canonical_dish: string;
  category: string;
  food_type?: string;
  quantity: number;
  initial_quantity: number;
  original_price: number;
  discounted_price: number;
  discount_percent: number;
  hours_since_cooked: number;
  bpom_max_hours: number;
  minutes_until_closing: number;
  safety_status: string;
  safety_reason: string;
  hazard_description: string;
  regulation_ref: string;
  similarity_score: number;
  image_url?: string | null;
  is_active: boolean;
  expires_at?: string | null;
  created_at: string;
}

export interface OrderTicket {
  id: string;
  order_code: string;
  store_id?: string;
  user_id?: string | null;
  customer_name: string;
  customer_phone?: string;
  listing_id: string;
  food_name: string;
  store_name: string;
  location_badge: string;
  image_url?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  pickup_deadline: string;
  expires_at?: string | null;
  qr_payload: string;
  payment_method?: string;  // CASH_ON_PICKUP | MIDTRANS_QRIS | SIMULATED_QRIS
  payment_status?: string;  // UNPAID | PENDING | PAID | REFUNDED
  status: string;           // RESERVED | COMPLETED | CANCELLED | EXPIRED
  created_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

export interface UserSession {
  token?: string;
  role: "merchant" | "consumer";
  email?: string;
  userId?: string;
  storeId?: string;
  storeName?: string;
  storeCategory?: string;
  storeDescription?: string;
  customerName?: string;
  customerPhone?: string;
  closingTime?: string;
  locationName?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AuthResponse {
  token: string;
  role: "merchant" | "consumer";
  email?: string;
  user_id?: string;
  store_id?: string;
  store_name?: string;
  store_category?: string;
  store_description?: string;
  customer_name?: string;
  customer_phone?: string;
  closing_time?: string;
  location_name?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export function getFriendlyCategory(category?: string, isBundle?: boolean): { label: string } {
  if (isBundle || category === "BUNDLE") {
    return { label: "Mystery Bag" };
  }
  switch (category) {
    case "HIGH_PERISHABILITY":
      return { label: "Olahan Santan & Bahan Segar" };
    case "MEDIUM_PERISHABILITY":
      return { label: "Makanan Siap Saji" };
    case "LOW_PERISHABILITY":
      return { label: "Roti & Pastry" };
    default:
      return { label: "Menu Siap Santap" };
  }
}

export function humanizeBpomText(text?: string): string {
  if (!text) return "";
  return text
    .replace(/kategori MEDIUM_PERISHABILITY/gi, "kategori Makanan Matang Siap Saji")
    .replace(/kategori HIGH_PERISHABILITY/gi, "kategori Olahan Santan & Cepat Basi")
    .replace(/kategori LOW_PERISHABILITY/gi, "kategori Roti & Olahan Kering")
    .replace(/MEDIUM_PERISHABILITY/g, "Makanan Siap Saji")
    .replace(/HIGH_PERISHABILITY/g, "Olahan Santan & Bahan Segar")
    .replace(/LOW_PERISHABILITY/g, "Roti & Pastry");
}

export function cleanLocationBadge(text?: string): string {
  if (!text) return "";
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, "")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .trim();
}


/**
 * Resolves a food image URL safely across cross-origin backend static storage,
 * public asset bundles, or external Cloudinary HTTPS URLs.
 * Returns null for ad-hoc items without a dedicated image.
 */
export function resolveImageUrl(imageUrl?: string | null, isBundle?: boolean): string | null {
  const candidate = imageUrl && imageUrl.trim() ? imageUrl.trim() : isBundle ? "/assets/foods/mystery_bag.jpg" : "";
  if (!candidate) {
    return null;
  }
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    return candidate;
  }
  if (candidate.startsWith("/assets/")) {
    return candidate;
  }
  if (candidate.startsWith("/static/")) {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
    try {
      const url = new URL(apiBase);
      return `${url.origin}${candidate}`;
    } catch {
      return `http://localhost:8000${candidate}`;
    }
  }
  return candidate;
}


