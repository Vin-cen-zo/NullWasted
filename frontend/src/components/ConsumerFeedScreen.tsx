import React, { useEffect, useMemo, useState } from "react";
import { ItemListing, humanizeBpomText, resolveImageUrl } from "../types/listing";
import {
  ShieldCheck,
  Search,
  Package,
  Map as MapIcon,
  Navigation,
  Crosshair,
  Store,
  CheckCircle2,
  Star,
  Heart,
  Clock,
  Zap,
  LayoutGrid,
  Croissant,
  Utensils,
  Coffee,
} from "lucide-react";
import { ClosingCountdownBadge, computeSecondsUntilClosing } from "./ClosingCountdownBadge";
import { ConsumerMapModal } from "./ConsumerMapModal";

interface ConsumerFeedScreenProps {
  listings: ItemListing[];
  onSelectItem: (item: ItemListing) => void;
  customerName: string;
}

export function resolveItemCoords(item: ItemListing): [number, number] | null {
  if (typeof item.latitude === "number" && typeof item.longitude === "number") {
    return [item.latitude, item.longitude];
  }
  return null;
}

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
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
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | "BAKERY" | "HEAVY" | "BEVERAGE" | "BUNDLE">("ALL");
  const [selectedRadius, setSelectedRadius] = useState<"ALL" | "500" | "1500">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("nullwasted_favorite_listings");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Live Device GPS (auto-requested after consumer enters feed)
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"PENDING" | "LIVE_GPS" | "UNAVAILABLE">("PENDING");
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Tick every 2s so items reaching 0s closing countdown are automatically removed from Jelajah catalog
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const toggleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmarkedIds((prev) => {
      const updated = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("nullwasted_favorite_listings", JSON.stringify(updated));
      } catch {
        // ignore storage failure
      }
      return updated;
    });
  };

  const requestLiveGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus("UNAVAILABLE");
      setGpsNotice("Browser Anda tidak mendukung Geolocation API.");
      return;
    }

    setIsGpsLoading(true);
    setGpsNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGpsLoading(false);
        setUserCoords([pos.coords.latitude, pos.coords.longitude]);
        setGpsStatus("LIVE_GPS");
        setGpsNotice(null);
      },
      () => {
        setIsGpsLoading(false);
        setGpsStatus("UNAVAILABLE");
        setGpsNotice("Aktifkan izin GPS browser untuk estimasi jarak ke setiap gerai.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Automatically request GPS permission upon entering Consumer Feed
  useEffect(() => {
    requestLiveGps();
  }, []);

  // Remove items immediately once closing countdown hits 0 (memoized by active IDs to avoid re-rendering map every tick)
  const activeIdsKey = listings
    .filter((item) => {
      void nowTick;
      return computeSecondsUntilClosing(item.closing_time || "20:30", item.expires_at) > 0;
    })
    .map((item) => item.id)
    .join(",");

  const activeNonExpiredListings = useMemo(() => {
    const allowed = new Set(activeIdsKey ? activeIdsKey.split(",") : []);
    return listings.filter((item) => allowed.has(item.id));
  }, [listings, activeIdsKey]);

  const filteredListings = activeNonExpiredListings.filter((item) => {
    const foodType = (item.food_type || "MEAL").toUpperCase();

    // 1. Food Type Filter (semantic/AI food_type decoupled from BPOM risk category)
    if (selectedCategory === "BUNDLE") {
      if (!item.is_bundle) return false;
    } else if (selectedCategory === "BAKERY") {
      if (item.is_bundle || foodType !== "BAKERY") return false;
    } else if (selectedCategory === "HEAVY") {
      if (item.is_bundle || foodType !== "MEAL") return false;
    } else if (selectedCategory === "BEVERAGE") {
      if (item.is_bundle || foodType !== "BEVERAGE") return false;
    }

    // 2. Distance Radius Filter (Dynamic Haversine when both GPS & store pinpoint exist)
    const itemCoords = resolveItemCoords(item);
    if (selectedRadius !== "ALL") {
      if (!userCoords || !itemCoords) return false;
      const distanceM = calculateDistanceMeters(itemCoords[0], itemCoords[1], userCoords[0], userCoords[1]);
      if (selectedRadius === "500" && distanceM > 500) return false;
      if (selectedRadius === "1500" && distanceM > 1500) return false;
    }

    // 3. Tokenized Multi-Word Search Query
    if (searchQuery.trim()) {
      const searchWords = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const targetCorpus = `${item.food_name} ${item.store_name} ${item.matched_canonical_dish || ""} ${item.category} ${item.location_badge || ""}`.toLowerCase();
      const isMatch = searchWords.every((word) => targetCorpus.includes(word));
      if (!isMatch) return false;
    }

    return true;
  });

  const sortedListings = [...filteredListings].sort((a, b) => {
    const aFav = bookmarkedIds.includes(a.id) ? 1 : 0;
    const bFav = bookmarkedIds.includes(b.id) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;

    if (!userCoords) return 0;
    const aCoords = resolveItemCoords(a);
    const bCoords = resolveItemCoords(b);
    if (!aCoords && !bCoords) return 0;
    if (!aCoords) return 1;
    if (!bCoords) return -1;
    const distA = calculateDistanceMeters(aCoords[0], aCoords[1], userCoords[0], userCoords[1]);
    const distB = calculateDistanceMeters(bCoords[0], bCoords[1], userCoords[0], userCoords[1]);
    return distA - distB;
  });

  return (
    <div className="flex-1 flex flex-col space-y-4">
      {/* Header Greeting, Live GPS Status & Open Map CTA */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#1F1D1A]">Selamat Datang, {customerName}</h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <button
              type="button"
              onClick={requestLiveGps}
              disabled={isGpsLoading}
              className={`text-[10px] font-semibold flex items-center gap-1 px-2.5 py-0.5 rounded-full transition cursor-pointer border ${
                gpsStatus === "LIVE_GPS"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
              }`}
              title="Perbarui koordinat GPS perangkat Anda"
            >
              <Crosshair className={`w-3 h-3 ${isGpsLoading ? "animate-spin" : ""}`} />
              <span>
                {isGpsLoading
                  ? "Mencari GPS..."
                  : gpsStatus === "LIVE_GPS"
                    ? "GPS Aktif (Perbarui Lokasi)"
                    : "Gunakan Lokasi Saya"}
              </span>
            </button>
            {gpsNotice && (
              <span className="text-[10px] font-medium text-amber-700">{gpsNotice}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMapOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>Cek Merchant</span>
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
              &lt; 500m (Jalan Kaki)
            </button>
            <button
              type="button"
              onClick={() => setSelectedRadius("1500")}
              className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                selectedRadius === "1500" ? "bg-white font-bold text-emerald-800 shadow-sm" : "hover:text-stone-900"
              }`}
            >
              &lt; 1.5km (Motor)
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Category Filter Carousel (Like Prototype Tugas 4) */}
      <nav aria-label="Category Filters" className="overflow-x-auto no-scrollbar -mx-1 px-1 flex items-center gap-2 pb-1 text-xs">
        {/* All */}
        <button
          type="button"
          onClick={() => setSelectedCategory("ALL")}
          className={`shrink-0 px-4 py-2 rounded-full font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
            selectedCategory === "ALL"
              ? "bg-emerald-500 text-white shadow-sm"
              : "bg-white text-stone-700 border border-stone-200 hover:border-stone-300"
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>All ({listings.length})</span>
        </button>

        {/* Bakery */}
        <button
          type="button"
          onClick={() => setSelectedCategory("BAKERY")}
          className={`shrink-0 px-3.5 py-2 rounded-full font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
            selectedCategory === "BAKERY"
              ? "bg-emerald-500 text-white font-bold shadow-sm"
              : "bg-white text-stone-700 border border-stone-200 hover:border-stone-300"
          }`}
        >
          <Croissant className="w-3.5 h-3.5 text-amber-600" />
          <span>Bakery</span>
        </button>

        {/* Meals */}
        <button
          type="button"
          onClick={() => setSelectedCategory("HEAVY")}
          className={`shrink-0 px-3.5 py-2 rounded-full font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
            selectedCategory === "HEAVY"
              ? "bg-emerald-500 text-white font-bold shadow-sm"
              : "bg-white text-stone-700 border border-stone-200 hover:border-stone-300"
          }`}
        >
          <Utensils className="w-3.5 h-3.5 text-orange-600" />
          <span>Meals</span>
        </button>

        {/* Beverages */}
        <button
          type="button"
          onClick={() => setSelectedCategory("BEVERAGE")}
          className={`shrink-0 px-3.5 py-2 rounded-full font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
            selectedCategory === "BEVERAGE"
              ? "bg-emerald-500 text-white font-bold shadow-sm"
              : "bg-white text-stone-700 border border-stone-200 hover:border-stone-300"
          }`}
        >
          <Coffee className="w-3.5 h-3.5 text-teal-600" />
          <span>Beverages</span>
        </button>

        {/* Surprise Bag / Mystery Bag */}
        <button
          type="button"
          onClick={() => setSelectedCategory("BUNDLE")}
          className={`shrink-0 px-3.5 py-2 rounded-full font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
            selectedCategory === "BUNDLE"
              ? "bg-purple-600 text-white shadow-sm"
              : "bg-white text-purple-700 border border-purple-200 hover:bg-purple-50"
          }`}
        >
          <Package className="w-3.5 h-3.5 text-purple-600" />
          <span>Mystery Bag</span>
        </button>
      </nav>

      {/* Section Heading with Live Count */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
          <h2 className="font-bold text-sm text-stone-900 tracking-tight">Surplus Rescue Near You</h2>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span>{filteredListings.length} Active Listings</span>
        </div>
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
          {sortedListings.map((item) => {
            const itemCoords = resolveItemCoords(item);
            const distM =
              userCoords && itemCoords
                ? calculateDistanceMeters(itemCoords[0], itemCoords[1], userCoords[0], userCoords[1])
                : null;
            const distLabel =
              distM !== null
                ? distM < 1000
                  ? `${distM}m dari Anda`
                  : `${(distM / 1000).toFixed(1)}km dari Anda`
                : item.location_badge || "Lokasi via peta";
            const resolvedImg = resolveImageUrl(item.image_url, item.is_bundle);
            const hasImage = Boolean(resolvedImg && !failedImageIds.has(item.id));
            const isBookmarked = bookmarkedIds.includes(item.id);

            return (
              <article
                key={item.id}
                onClick={() => onSelectItem(item)}
                className={`bg-white border rounded-2xl overflow-hidden shadow-sm hover:border-emerald-400 hover:shadow-md transition-all duration-200 flex flex-col cursor-pointer ${
                  item.is_bundle
                    ? "border-purple-300 ring-1 ring-purple-200"
                    : "border-stone-200"
                }`}
              >
                {/* 1. Store Header Row */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-stone-100 bg-white">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        item.is_bundle
                          ? "bg-purple-50 border border-purple-200 text-purple-700"
                          : "bg-amber-50 border border-amber-200 text-amber-700"
                      }`}
                    >
                      <Store className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-xs text-stone-900 truncate">{item.store_name}</h3>
                        <span title="BPOM Safety Verified" className="inline-flex items-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 fill-emerald-50" />
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 flex items-center gap-1 truncate">
                        <span>{distLabel}</span>
                        <span>•</span>
                        <span className="text-amber-700 font-semibold flex items-center">
                          4.8 <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500 ml-0.5" />
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => toggleBookmark(item.id, e)}
                    aria-label="Bookmark store"
                    aria-pressed={isBookmarked}
                    title={isBookmarked ? "Hapus dari favorit" : "Simpan ke favorit"}
                    className="p-1 rounded-lg active:scale-95 transition-colors shrink-0 cursor-pointer"
                  >
                    <Heart
                      className={`w-4 h-4 transition-colors ${
                        isBookmarked
                          ? "fill-rose-500 text-rose-500"
                          : "text-stone-300 hover:text-rose-500"
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Adaptive Image Presentation: Full Banner or Sleek Compact Header */}
                {hasImage ? (
                  <div className="relative w-full h-44 overflow-hidden bg-stone-100 group">
                    <img
                      alt={item.food_name}
                      src={resolvedImg!}
                      onError={() => {
                        setFailedImageIds((prev) => new Set(prev).add(item.id));
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Stock Pill (Top Left) */}
                    {item.quantity <= 2 ? (
                      <div className="absolute top-3 left-3 bg-amber-500 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 text-[11px] font-bold shadow-md">
                        <span>!</span>
                        <span>{item.is_bundle ? `Hanya ${item.quantity} Paket Sisa!` : `Tersisa ${item.quantity} Porsi!`}</span>
                      </div>
                    ) : (
                      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md border border-stone-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold text-stone-800 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>{item.quantity} porsi tersisa</span>
                      </div>
                    )}

                    {/* Discount Badge (Top Right) */}
                    <div className="absolute top-3 right-3 bg-emerald-500 text-white font-bold text-[11px] px-2 py-0.5 rounded-md shadow">
                      {item.discount_percent}% OFF
                    </div>
                  </div>
                ) : (
                  /* Sleek Compact Card Stock & Discount Row (When No Image Banner) */
                  <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2 border-b border-stone-50 bg-[#FCFBF9]">
                    {item.quantity <= 2 ? (
                      <div className="bg-amber-500 text-white px-2.5 py-0.5 rounded-lg flex items-center gap-1 text-[11px] font-bold shadow-2xs">
                        <span>!</span>
                        <span>{item.is_bundle ? `Hanya ${item.quantity} Paket Sisa!` : `Tersisa ${item.quantity} Porsi!`}</span>
                      </div>
                    ) : (
                      <div className="bg-white border border-stone-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold text-stone-700 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>{item.quantity} porsi tersisa</span>
                      </div>
                    )}
                    <span className="bg-emerald-600 text-white font-bold text-[11px] px-2 py-0.5 rounded-md shadow-2xs shrink-0">
                      {item.discount_percent}% OFF
                    </span>
                  </div>
                )}

                {/* 3. Card Content */}
                <div className="p-4 flex flex-col space-y-2.5 flex-1 justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-stone-900 leading-snug line-clamp-1">{item.food_name}</h4>
                    <p className="text-xs text-stone-500 line-clamp-1 mt-0.5 leading-relaxed">
                      {item.hazard_description || item.safety_reason || "Makanan surplus higienis berstandar BPOM."}
                    </p>
                  </div>

                  {/* Urgency Countdown Pill & BPOM Guarantee */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5 bg-amber-50/80 border border-amber-200 px-2.5 py-1.5 rounded-xl text-amber-900 text-[11px] font-medium">
                      <div className="flex items-center gap-1.5 truncate">
                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">Ambil s/d pk {item.closing_time || "20:30"} WIB</span>
                      </div>
                      <ClosingCountdownBadge
                        closingTime={item.closing_time || "20:30"}
                        expiresAt={item.expires_at}
                        fallbackMinutes={item.minutes_until_closing}
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate font-medium">BPOM Safe: {humanizeBpomText(item.safety_reason)}</span>
                    </div>
                  </div>

                  {/* Price & CTA Action */}
                  <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                    <div>
                      <div className="text-[11px] text-stone-400 line-through">
                        Rp {item.original_price.toLocaleString("id-ID")}
                      </div>
                      <div className="font-extrabold text-base text-emerald-700 tracking-tight">
                        Rp {item.discounted_price.toLocaleString("id-ID")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item);
                      }}
                      className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 fill-white" />
                      <span>View & Reserve</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Map Modal */}
      <ConsumerMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        listings={activeNonExpiredListings}
        onSelectItem={onSelectItem}
        userCoords={userCoords}
      />
    </div>
  );
};
