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
  Crosshair,
} from "lucide-react";
import { ClosingCountdownBadge } from "./ClosingCountdownBadge";
import { ConsumerMapModal } from "./ConsumerMapModal";

interface ConsumerFeedScreenProps {
  listings: ItemListing[];
  onSelectItem: (item: ItemListing) => void;
  customerName: string;
}

// User anchor: FTUI Kampus UI Depok
export const DEFAULT_FTUI_COORDS: [number, number] = [-6.3626, 106.8240];

export function resolveItemCoords(item: ItemListing): [number, number] {
  if (item.store_id === "FTUI-001") {
    return [-6.3621, 106.8246]; // ~110m dari FTUI (Zona < 500m)
  }
  if (item.store_id === "KUTEK-007") {
    return [-6.3575, 106.8195]; // ~780m dari FTUI (Zona 500m - 1.5km)
  }
  if (item.store_id === "MARGONDA-042") {
    return [-6.3685, 106.8375]; // ~1.85km dari FTUI (Zona > 1.5km)
  }
  return [item.latitude || -6.3621, item.longitude || 106.8246];
}

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number = DEFAULT_FTUI_COORDS[0],
  lng2: number = DEFAULT_FTUI_COORDS[1]
): number {
  const R = 6371e3;
  const φ1 = (lat2 * Math.PI) / 180;
  const φ2 = (lat1 * Math.PI) / 180;
  const Δφ = ((lat1 - lat2) * Math.PI) / 180;
  const Δλ = ((lng1 - lng2) * Math.PI) / 180;

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

  // Dynamic Geolocation with FTUI fallback
  const [userCoords, setUserCoords] = useState<[number, number]>(DEFAULT_FTUI_COORDS);
  const [gpsStatus, setGpsStatus] = useState<"FTUI_ANCHOR" | "LIVE_GPS">("FTUI_ANCHOR");
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  const requestLiveGps = () => {
    if (!navigator.geolocation) {
      alert("Browser Anda tidak mendukung Geolocation API.");
      return;
    }

    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGpsLoading(false);
        const deviceLat = pos.coords.latitude;
        const deviceLng = pos.coords.longitude;
        const distFromFtui = calculateDistanceMeters(deviceLat, deviceLng, DEFAULT_FTUI_COORDS[0], DEFAULT_FTUI_COORDS[1]);

        if (distFromFtui <= 3000) {
          setUserCoords([deviceLat, deviceLng]);
          setGpsStatus("LIVE_GPS");
        } else {
          // Beyond UI Depok perimeter: maintain FTUI anchor so demo filters remain responsive
          setUserCoords(DEFAULT_FTUI_COORDS);
          setGpsStatus("FTUI_ANCHOR");
        }
      },
      () => {
        setIsGpsLoading(false);
        setUserCoords(DEFAULT_FTUI_COORDS);
        setGpsStatus("FTUI_ANCHOR");
      },
      { timeout: 6000 }
    );
  };

  const filteredListings = listings.filter((item) => {
    // 1. Category Filter
    if (selectedCategory === "BUNDLE") {
      if (!item.is_bundle) return false;
    } else if (selectedCategory === "BAKERY") {
      if (item.category !== "LOW_PERISHABILITY") return false;
    } else if (selectedCategory === "HEAVY") {
      if (item.category === "LOW_PERISHABILITY" || item.is_bundle) return false;
    }

    // 2. Distance Radius Filter (Dynamic Haversine from userCoords)
    const [itemLat, itemLng] = resolveItemCoords(item);
    const distanceM = calculateDistanceMeters(itemLat, itemLng, userCoords[0], userCoords[1]);

    if (selectedRadius === "500" && distanceM > 500) return false;
    if (selectedRadius === "1500" && distanceM > 1500) return false;

    // 3. Tokenized Multi-Word Search Query
    if (searchQuery.trim()) {
      const searchWords = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const targetCorpus = `${item.food_name} ${item.store_name} ${item.matched_canonical_dish || ""} ${item.category} ${item.location_badge || ""}`.toLowerCase();
      const isMatch = searchWords.every((word) => targetCorpus.includes(word));
      if (!isMatch) return false;
    }

    return true;
  });

  return (
    <div className="flex-1 flex flex-col space-y-4">
      {/* Header Greeting, GPS Anchor Toggle & Open Map CTA */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1F1D1A]">Selamat Datang, {customerName} 👋</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <button
              type="button"
              onClick={requestLiveGps}
              disabled={isGpsLoading}
              className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full border transition cursor-pointer ${
                gpsStatus === "LIVE_GPS"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200"
              }`}
              title="Ketuk untuk perbarui lokasi GPS perangkat Anda"
            >
              <Crosshair className={`w-3 h-3 ${isGpsLoading ? "animate-spin text-emerald-600" : "text-emerald-700"}`} />
              <span>{gpsStatus === "LIVE_GPS" ? "GPS Akurat Aktif" : "Anchor Kantin FTUI"}</span>
            </button>
            <span className="text-[10px] text-stone-400">· Depok Area</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMapOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>🗺️ Peta Gerai</span>
        </button>
      </div>

      {/* Responsive Search Input & Radius Distance Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Search Input Bar */}
        <div className="relative md:col-span-7">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari makanan surplus, menu, atau gerai..."
            className="w-full text-xs pl-9 pr-3.5 py-2.5 rounded-xl border border-[#D8D2C5] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 text-[#1F1D1A]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-3 text-[10px] text-gray-400 hover:text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded cursor-pointer"
            >
              Hapus
            </button>
          )}
        </div>

        {/* Radius Distance Filter Row */}
        <div className="flex items-center justify-between gap-2 text-[11px] bg-stone-100 p-1.5 rounded-xl text-stone-600 md:col-span-5">
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-semibold text-stone-700">Radius:</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedRadius("ALL")}
              className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                selectedRadius === "ALL" ? "bg-white font-bold text-emerald-800 shadow-sm" : "hover:text-stone-900"
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setSelectedRadius("500")}
              className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                selectedRadius === "500" ? "bg-white font-bold text-emerald-800 shadow-sm" : "hover:text-stone-900"
              }`}
            >
              &lt; 500m (🚶)
            </button>
            <button
              type="button"
              onClick={() => setSelectedRadius("1500")}
              className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                selectedRadius === "1500" ? "bg-white font-bold text-emerald-800 shadow-sm" : "hover:text-stone-900"
              }`}
            >
              &lt; 1.5km (🛵)
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Pills (Including Mystery Bag) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
        <button
          type="button"
          onClick={() => setSelectedCategory("ALL")}
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
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
          className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition-all flex items-center gap-1 cursor-pointer ${
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
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
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
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
            selectedCategory === "BAKERY"
              ? "bg-[#10B981] text-white shadow-sm"
              : "bg-white text-[#6B655B] border border-[#D8D2C5] hover:bg-gray-50"
          }`}
        >
          Roti & Pastry
        </button>
      </div>

      {/* Food Discovery Cards Grid */}
      {filteredListings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-dashed border-[#D8D2C5]">
          <Utensils className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-xs font-bold text-[#1F1D1A]">Tidak Ada Makanan Ditemukan</p>
          <p className="text-[11px] text-[#6B655B] mt-1">
            Cobalah mengubah filter kategori atau radius pencarian Anda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {filteredListings.map((item) => {
            const [itemLat, itemLng] = resolveItemCoords(item);
            const distM = calculateDistanceMeters(itemLat, itemLng, userCoords[0], userCoords[1]);
            const distLabel = distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}km`;

            return (
              <div
                key={item.id}
                onClick={() => onSelectItem(item)}
                className={`bg-white p-4 rounded-2xl border shadow-sm hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between space-y-3 ${
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

                      {item.portion_size && item.portion_size !== "Reguler" && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          {item.portion_size}
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

                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-100 text-[#6B655B] mt-auto">
                  <div className="flex items-center gap-1 min-w-0 flex-1 mr-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">{item.location_badge || `${distLabel} dari lokasi Anda`}</span>
                  </div>
                  <div className="text-right font-medium flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                      {distLabel}
                    </span>
                    <span className="shrink-0">Tersisa: <strong className="text-stone-800">{item.quantity} porsi</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Map Modal */}
      <ConsumerMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        listings={listings}
        onSelectItem={onSelectItem}
        userCoords={userCoords}
      />
    </div>
  );
};
