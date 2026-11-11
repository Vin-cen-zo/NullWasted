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
  bpom_max_hours: number;
  portion_size?: string;
  image_url?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface StoreProfile {
  id: string;
  store_id: string;
  name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  closing_time: string;
  maps_url: string;
  is_active: boolean;
}

export interface DraftResponse {
  food_name: string;
  matched_canonical_dish: string;
  category: string;
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
  latitude?: number;
  longitude?: number;
  is_bundle?: boolean;
  bundled_items_json?: string | null;
  image_url?: string | null;
}

export interface ItemListing {
  id: string;
  store_id?: string;
  store_name: string;
  location_badge: string;
  maps_url: string;
  latitude?: number;
  longitude?: number;
  closing_time?: string;
  is_bundle?: boolean;
  bundled_items_json?: string | null;
  portion_size?: string;

  food_name: string;
  matched_canonical_dish: string;
  category: string;
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
  created_at: string;
}

export interface OrderTicket {
  id: string;
  order_code: string;
  store_id?: string;
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
  qr_payload: string;
  payment_method?: string;  // CASH_ON_PICKUP | SIMULATED_QRIS
  payment_status?: string;  // UNPAID | PAID | REFUNDED
  status: string;           // RESERVED | COMPLETED | CANCELLED
  created_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

export interface UserSession {
  token?: string;
  role: "merchant" | "consumer";
  userId?: string;
  storeId?: string;
  storeName?: string;
  customerName?: string;
  customerPhone?: string;
  closingTime?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
}

export interface AuthResponse {
  token: string;
  role: "merchant" | "consumer";
  user_id?: string;
  store_id?: string;
  store_name?: string;
  customer_name?: string;
  customer_phone?: string;
  closing_time?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
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


/**
 * Resolves a food image URL safely across cross-origin backend static storage,
 * public asset bundles, or external Cloudinary HTTPS URLs.
 * Returns null for ad-hoc items without a dedicated image.
 */
export function resolveImageUrl(imageUrl?: string | null, isBundle?: boolean): string | null {
  if (isBundle) {
    return imageUrl || "/assets/foods/mystery_bag.jpg";
  }
  if (!imageUrl || !imageUrl.trim()) {
    return null;
  }
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/assets/")) {
    return trimmed;
  }
  if (trimmed.startsWith("/static/")) {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
    try {
      const url = new URL(apiBase);
      return `${url.origin}${trimmed}`;
    } catch {
      return `http://localhost:8000${trimmed}`;
    }
  }
  return trimmed;
}

/**
 * Backward compatibility helper for legacy screens. Returns resolved image or default fallback.
 * Hardcoded substring keyword guessing for regular dishes is removed.
 */
export function getFoodImage(item: { food_name?: string; is_bundle?: boolean; image_url?: string | null }): string {
  if (item.is_bundle) {
    return "/assets/foods/mystery_bag.jpg";
  }
  const resolved = resolveImageUrl(item.image_url, item.is_bundle);
  return resolved || "/assets/foods/default_food.jpg";
}


