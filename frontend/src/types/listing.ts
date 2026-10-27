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
}

export interface ItemListing {
  id: string;
  store_name: string;
  location_badge: string;
  maps_url: string;
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
  is_active: boolean;
  created_at: string;
}

export interface OrderTicket {
  id: string;
  order_code: string;
  listing_id: string;
  food_name: string;
  store_name: string;
  location_badge: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  pickup_deadline: string;
  qr_payload: string;
  status: string;
  created_at: string;
}

export interface PresetScenario {
  id: string;
  pillTitle: string;
  pillSubtitle: string;
  text: string;
  icon: string;
  toneColor: string;
  badge: string;
}
