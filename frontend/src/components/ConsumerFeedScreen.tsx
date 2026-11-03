import React, { useState } from "react";
import { ItemListing } from "../types/listing";
import {
  ShieldCheck,
  MapPin,
  Utensils,
  Search,
  Package,
  Map as MapIcon,
  Navigation,
} from "lucide-react";
import { ClosingCountdownBadge } from "./ClosingCountdownBadge";
import { ConsumerMapModal } from "./ConsumerMapModal";

interface ConsumerFeedScreenProps {
  listings: ItemListing[];
  onSelectItem: (item: ItemListing) => void;
  customerName: string;
}

// User anchor: FTUI Kampus UI Depok
const USER_LAT = -6.3626;
const USER_LNG = 106.8240;

function calculateDistanceMeters(lat: number, lng: number): number {
  const R = 6371e3;
  const φ1 = (USER_LAT * Math.PI) / 180;
  const φ2 = (lat * Math.PI) / 180;
  const Δφ = ((lat - USER_LAT) * Math.PI) / 180;
  const Δλ = ((lng - USER_LNG) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const ConsumerFeedScreen: React.FC<ConsumerFeedScreenProps> = ({
  listings,
  onSelectItem,
  customerName,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | "HEAVY" | "BAKERY" | "BUNDLE">("ALL");
  const [selectedRadius, setSelectedRadius] = useState<"ALL" | "500" | "1500">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMapOpen, setIsMapOpen] = useState(false);

  const filteredListings = listings.filter((item) => {
    // 1. Category Filter
    if (selectedCategory === "BUNDLE") {
      if (!item.is_bundle) return false;
    } else if (selectedCategory === "BAKERY") {
      if (item.category !== "LOW_PERISHABILITY") return false;
    } else if (selectedCategory === "HEAVY") {
      if (item.category === "LOW_PERISHABILITY" || item.is_bundle) return false;
    }

    // 2. Distance Radius Filter (Haversine from FTUI Depok)
    const itemLat = item.latitude || -6.3621;
    const itemLng = item.longitude || 106.8246;
    const distanceM = calculateDistanceMeters(itemLat, itemLng);

    if (selectedRadius === "500" && distanceM > 500) return false;
    if (selectedRadius === "1500" && distanceM > 1500) return false;

    // 3. Text Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.food_name.toLowerCase().includes(q);
      const matchStore = item.store_name.toLowerCase().includes(q);
      if (!matchName && !matchStore) return false;
    }

    return true;
  });

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-3">
      {/* Header Greeting & Open Map CTA */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1F1D1A]">Selamat Datang, {customerName} 👋</h2>
          <p className="text-xs text-[#6B655B] flex items-center gap-1 mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
            <span>Kantin FTUI · UI Depok Area</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsMapOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm active:scale-95"
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>🗺️ Peta Gerai</span>
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari makanan surplus atau nama gerai..."
          className="w-full text-xs pl-9 pr-3.5 py-2.5 rounded-xl border border-[#D8D2C5] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 text-[#1F1D1A]"
        />
      </div>

      {/* Category Filter Pills (Including Mystery Bag) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
        <button
          type="button"
          onClick={() => setSelectedCategory("ALL")}
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all ${
            selectedCategory === "ALL"
              ? "bg-[#10B981] text-white shadow-sm"
              : "bg-white text-[#6B655B] border border-[#D8D2C5] hover:bg-gray-50"
          }`}
        >
          Semua ({listings.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory("BUNDLE")}
          className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition-all flex items-center gap-1 ${
            selectedCategory === "BUNDLE"
              ? "bg-purple-600 text-white shadow-sm"
              : "bg-white text-purple-700 border border-purple-200 hover:bg-purple-50"
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>🎒 Mystery Bag</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory("HEAVY")}
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all ${
            selectedCategory === "HEAVY"
              ? "bg-[#10B981] text-white shadow-sm"
              : "bg-white text-[#6B655B] border border-[#D8D2C5] hover:bg-gray-50"
          }`}
        >
          Makanan Berat
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory("BAKERY")}
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all ${
            selectedCategory === "BAKERY"
              ? "bg-[#10B981] text-white shadow-sm"
              : "bg-white text-[#6B655B] border border-[#D8D2C5] hover:bg-gray-50"
          }`}
        >
          Roti & Pastry
        </button>
      </div>

      {/* Radius Distance Filter Row */}
      <div className="flex items-center gap-2 text-[11px] bg-stone-100 p-1.5 rounded-xl text-stone-600">
        <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
        <span className="font-semibold text-stone-700">Radius Jarak:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSelectedRadius("ALL")}
            className={`px-2 py-0.5 rounded-lg font-medium transition ${
              selectedRadius === "ALL" ? "bg-white font-bold text-emerald-800 shadow-xs" : "hover:text-stone-900"
            }`}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => setSelectedRadius("500")}
            className={`px-2 py-0.5 rounded-lg font-medium transition ${
              selectedRadius === "500" ? "bg-white font-bold text-emerald-800 shadow-xs" : "hover:text-stone-900"
            }`}
          >
            &lt; 500m (🚶 Jalan)
          </button>
          <button
            type="button"
            onClick={() => setSelectedRadius("1500")}
            className={`px-2 py-0.5 rounded-lg font-medium transition ${
              selectedRadius === "1500" ? "bg-white font-bold text-emerald-800 shadow-xs" : "hover:text-stone-900"
            }`}
          >
            &lt; 1.5km (🛵 Motor)
          </button>
        </div>
      </div>

      {/* Food Discovery Cards List */}
      {filteredListings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-dashed border-[#D8D2C5]">
          <Utensils className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-xs font-bold text-[#1F1D1A]">Tidak Ada Makanan Ditemukan</p>
          <p className="text-[11px] text-[#6B655B] mt-1">
            Cobalah mengubah filter kategori atau radius pencarian Anda.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredListings.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item)}
              className={`bg-white p-3.5 rounded-2xl border shadow-sm hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                item.is_bundle
                  ? "border-purple-300 bg-gradient-to-b from-purple-50/30 to-white"
                  : "border-[#E2DDD3]"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {item.is_bundle ? (
                      <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-extrabold flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        MYSTERY BAG
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        {item.discount_percent}% OFF
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      BPOM Safe
                    </span>

                    <ClosingCountdownBadge
                      closingTime={item.closing_time || "20:30"}
                      fallbackMinutes={item.minutes_until_closing}
                    />
                  </div>

                  <h3 className="text-xs font-bold text-[#1F1D1A] leading-snug">{item.food_name}</h3>
                  <p className="text-[10px] text-[#6B655B]">{item.store_name}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-gray-400 line-through block">
                    Rp {item.original_price.toLocaleString("id-ID")}
                  </span>
                  <span className="text-sm font-extrabold text-emerald-600 font-mono">
                    Rp {item.discounted_price.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-100 text-[#6B655B]">
                <div className="flex items-center gap-1 truncate max-w-[200px]">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{item.location_badge}</span>
                </div>
                <div className="text-right font-medium">
                  <span>Tersisa: <strong className="text-stone-800">{item.quantity} porsi</strong></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Map Modal */}
      <ConsumerMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        listings={listings}
        onSelectItem={onSelectItem}
        userCoords={[USER_LAT, USER_LNG]}
      />
    </div>
  );
};
