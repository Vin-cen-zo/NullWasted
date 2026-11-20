import React, { useEffect, useMemo, useState } from "react";
import { ItemListing, cleanLocationBadge, humanizeBpomText, resolveImageUrl } from "../types/listing";
import {
  ShieldCheck,
  Search,
  Package,
  Map as MapIcon,
  Navigation,
  Crosshair,
  Star,
  Heart,
  Clock,
  ShoppingBag,
  LayoutGrid,
  Croissant,
  Utensils,
  Coffee,
} from "lucide-react";
import { ClosingCountdownBadge } from "./ClosingCountdownBadge";
import {
  NW_CLOCK_CHANGE_EVENT,
  computeEffectiveSecondsUntilClosing,
  getEffectiveNow,
} from "../utils/clock";
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
  const [nowTick, setNowTick] = useState<number>(() => getEffectiveNow().getTime());

  // Tick every 2s and sync immediately with simulated clock changes
  useEffect(() => {
    const syncNow = () => setNowTick(getEffectiveNow().getTime());
    const timer = setInterval(syncNow, 2000);
    window.addEventListener(NW_CLOCK_CHANGE_EVENT, syncNow);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NW_CLOCK_CHANGE_EVENT, syncNow);
    };
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
      return computeEffectiveSecondsUntilClosing(item.closing_time || "20:30", item.expires_at) > 0;
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
    <div className="flex-1 flex flex-col space-y-5">
      {/* Top Location & Map Bar (Figma Home_01 Style) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={requestLiveGps}
            disabled={isGpsLoading}
            className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-all cursor-pointer ${
              gpsStatus === "LIVE_GPS"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                : "bg-[#ECF0F4] text-[#181C2E] hover:bg-slate-200"
            }`}
            title="Perbarui koordinat GPS perangkat Anda"
            aria-label="Perbarui GPS"
          >
            <Crosshair className={`w-4 h-4 ${isGpsLoading ? "animate-spin" : ""}`} />
          </button>
          <div className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wider text-emerald-600">
              {gpsStatus === "LIVE_GPS" ? "Lokasi GPS Aktif" : "Lokasi Pickup"}
            </span>
            <button
              type="button"
              onClick={requestLiveGps}
              className="text-sm font-medium text-[#646982] hover:text-[#181C2E] truncate flex items-center gap-1 cursor-pointer"
            >
              <span className="truncate">
                {isGpsLoading
                  ? "Mencari koordinat GPS..."
                  : gpsStatus === "LIVE_GPS"
                    ? "Koordinat Terdekat (Ketuk Perbarui)"
                    : "Aktifkan GPS untuk estimasi jarak"}
              </span>
            </button>
            {gpsNotice && (
              <span className="text-xs font-medium text-amber-600 block truncate">{gpsNotice}</span>
            )}
          </div>
        </div>

        {/* Circular Map Trigger with Active Count Badge */}
        <button
          type="button"
          onClick={() => setIsMapOpen(true)}
          className="relative flex items-center gap-2 h-11 px-4 rounded-lg bg-[#181C2E] hover:bg-[#252a44] text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
        >
          <MapIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Peta Gerai</span>
          <span className="min-w-[20px] h-5 px-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-extrabold flex items-center justify-center">
            {activeNonExpiredListings.length}
          </span>
        </button>
      </div>

      {/* Clean Greeting */}
      <div>
        <p className="text-[16px] text-[#1A1817]">
          Halo <span className="font-normal">{customerName},</span>{" "}
          <span className="font-bold text-[#181C2E]">Siap Selamatkan Surplus?</span>
        </p>
      </div>

      {/* Search Bar & Radius Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <div className="relative md:col-span-7">
          <Search className="w-[18px] h-[18px] text-[#676767] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Mau selamatkan makanan apa hari ini?"
            className="w-full h-[50px] text-[14px] pl-11 pr-16 rounded-xl bg-[#F6F6F6] border border-transparent focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-[#181C2E] placeholder:text-[#676767] transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#646982] hover:text-[#181C2E] bg-white px-2.5 py-1 rounded-lg shadow-xs cursor-pointer"
            >
              Hapus
            </button>
          )}
        </div>

        {/* Radius Distance Filter */}
        <div className="flex items-center justify-between gap-2 text-xs bg-[#F0F5FA] p-1.5 rounded-xl text-[#646982] md:col-span-5 h-[50px]">
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-bold text-[#181C2E]">Radius</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedRadius("ALL")}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                selectedRadius === "ALL" ? "bg-white font-bold text-[#181C2E] shadow-xs" : "hover:text-[#181C2E]"
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setSelectedRadius("500")}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                selectedRadius === "500" ? "bg-white font-bold text-[#181C2E] shadow-xs" : "hover:text-[#181C2E]"
              }`}
            >
              &lt; 500m
            </button>
            <button
              type="button"
              onClick={() => setSelectedRadius("1500")}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                selectedRadius === "1500" ? "bg-white font-bold text-[#181C2E] shadow-xs" : "hover:text-[#181C2E]"
              }`}
            >
              &lt; 1.5km
            </button>
          </div>
        </div>
      </div>

      {/* Category Carousel (Figma Home_01 Pill Style) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-normal text-[#32343E]">Semua Kategori</h2>
          <span className="text-[13px] text-[#646982] font-medium">
            {filteredListings.length} tersedia
          </span>
        </div>

        <nav aria-label="Category Filters" className="overflow-x-auto no-scrollbar -mx-1 px-1 flex items-center gap-3 py-1.5 text-[13px]">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-lg font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "ALL"
                ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "ALL" ? "bg-white" : "bg-[#F0ECE9]"}`}>
              <LayoutGrid className="w-4 h-4 text-[#181C2E]" />
            </span>
            <span>Semua ({activeNonExpiredListings.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("BAKERY")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-lg font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "BAKERY"
                ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "BAKERY" ? "bg-white" : "bg-[#F0ECE9]"}`}>
              <Croissant className="w-4 h-4 text-emerald-600" />
            </span>
            <span>Bakery</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("HEAVY")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-lg font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "HEAVY"
                ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "HEAVY" ? "bg-white" : "bg-[#F0ECE9]"}`}>
              <Utensils className="w-4 h-4 text-emerald-600" />
            </span>
            <span>Meals</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("BEVERAGE")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-lg font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "BEVERAGE"
                ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "BEVERAGE" ? "bg-white" : "bg-[#F0ECE9]"}`}>
              <Coffee className="w-4 h-4 text-emerald-600" />
            </span>
            <span>Beverages</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("BUNDLE")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-lg font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "BUNDLE"
                ? "bg-purple-600 text-white shadow-[0_10px_25px_rgba(147,51,234,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "BUNDLE" ? "bg-white/15" : "bg-purple-50"}`}>
              <Package className={`w-4 h-4 ${selectedCategory === "BUNDLE" ? "text-white" : "text-purple-600"}`} />
            </span>
            <span>Mystery Bag</span>
          </button>
        </nav>
      </div>

      {/* Section Heading */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[18px] font-normal text-[#32343E]">Penyelamatan Surplus Terdekat</h2>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span>{filteredListings.length} Menu Aktif</span>
        </div>
      </div>

      {/* Food Discovery Cards Grid */}
      {filteredListings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center bg-white space-y-2.5">
          <img
            src="/assets/empty_store.jpg"
            alt="Tidak ada makanan ditemukan"
            className="w-36 h-36 object-contain"
          />
          <div className="space-y-1">
            <p className="text-base font-bold text-[#222222]">Tidak Ada Makanan Ditemukan</p>
            <p className="text-sm text-[#646982] max-w-sm">
              Cobalah mengubah filter kategori atau radius pencarian Anda.
            </p>
          </div>
          {(selectedCategory !== "ALL" || selectedRadius !== "ALL" || searchQuery.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("ALL");
                setSelectedRadius("ALL");
                setSearchQuery("");
              }}
              className="text-sm font-bold text-emerald-600 hover:underline pt-1 cursor-pointer"
            >
              Reset semua filter
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {sortedListings.map((item) => {
            const itemCoords = resolveItemCoords(item);
            const distM =
              userCoords && itemCoords
                ? calculateDistanceMeters(itemCoords[0], itemCoords[1], userCoords[0], userCoords[1])
                : null;
            const distLabel =
              distM !== null
                ? distM < 1000
                  ? `${distM}m`
                  : `${(distM / 1000).toFixed(1)}km`
                : cleanLocationBadge(item.location_badge) || "Lokasi via peta";
            const resolvedImg = resolveImageUrl(item.image_url, item.is_bundle);
            const hasImage = Boolean(resolvedImg && !failedImageIds.has(item.id));
            const isBookmarked = bookmarkedIds.includes(item.id);

            return (
              <article
                key={item.id}
                onClick={() => onSelectItem(item)}
                className={`bg-white rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(150,150,154,0.12)] hover:shadow-[0_16px_36px_rgba(150,150,154,0.2)] transition-all duration-200 flex flex-col cursor-pointer border ${
                  item.is_bundle ? "border-purple-200" : "border-slate-100"
                }`}
              >
                {/* Food Image Banner */}
                {hasImage ? (
                  <div className="relative w-full h-44 overflow-hidden bg-[#F0ECE9] group shrink-0">
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
                      <div className="absolute top-3 left-3 bg-amber-500 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-sm">
                        {item.is_bundle ? `Sisa ${item.quantity} Paket` : `Sisa ${item.quantity} Porsi`}
                      </div>
                    ) : (
                      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold text-[#181C2E] shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>{item.quantity} porsi</span>
                      </div>
                    )}

                    {/* Discount Badge (Top Right) */}
                    <div className="absolute top-3 right-3 bg-[#181C2E] text-white font-bold text-[11px] px-2.5 py-1 rounded-lg shadow-sm">
                      {item.discount_percent}% OFF
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pt-4 pb-1 flex items-center justify-between gap-2 bg-white">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        item.quantity <= 2
                          ? "bg-amber-50 text-amber-700"
                          : "bg-[#F0F5FA] text-[#181C2E]"
                      }`}
                    >
                      {item.quantity} porsi tersisa
                    </span>
                    <span className="bg-[#181C2E] text-white font-bold text-[11px] px-2.5 py-1 rounded-lg">
                      {item.discount_percent}% OFF
                    </span>
                  </div>
                )}

                {/* Card Content (ShopeeFood-inspired Unified Headline) */}
                <div className="p-4 flex flex-col space-y-3.5 flex-1 justify-between">
                  <div className="space-y-2.5">
                    {/* Dish + Store Name in One Unified Headline (ShopeeFood Style) */}
                    <h4 className="font-normal text-[18px] text-[#222222] leading-snug line-clamp-2">
                      {item.food_name} - {item.store_name}
                    </h4>

                    {/* Clean 1-Line Subtitle */}
                    <p className="text-[14px] leading-relaxed text-[#646982] line-clamp-1">
                      {humanizeBpomText(item.safety_reason) || item.hazard_description || "Makanan surplus higienis berstandar BPOM."}
                    </p>
                  </div>

                  {/* Rating, Distance & Closing Time Row */}
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center gap-2 text-xs text-[#646982] flex-wrap">
                      <span className="flex items-center gap-1 font-semibold text-[#181C2E]">
                        <Star className="w-3.5 h-3.5 fill-[#DFB300] text-[#DFB300]" />
                        4.8
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="truncate max-w-[160px]">{distLabel}</span>
                      <span className="text-slate-300">|</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        Tutup {item.closing_time || "20:30"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        BPOM Safe
                      </span>
                      <ClosingCountdownBadge
                        closingTime={item.closing_time || "20:30"}
                        expiresAt={item.expires_at}
                        fallbackMinutes={item.minutes_until_closing}
                      />
                    </div>
                  </div>

                  {/* Price & Circular Figma Action Row */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                    <div>
                      <span className="text-xs text-[#A0A5BA] line-through block leading-none">
                        Rp {item.original_price.toLocaleString("id-ID")}
                      </span>
                      <span className="font-bold text-[18px] text-[#222222] tracking-tight tabular-nums">
                        Rp {item.discounted_price.toLocaleString("id-ID")}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => toggleBookmark(item.id, e)}
                        aria-label="Bookmark store"
                        aria-pressed={isBookmarked}
                        title={isBookmarked ? "Hapus dari favorit" : "Simpan ke favorit"}
                        className="w-10 h-10 rounded-lg border border-[#E3DCD5] flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                      >
                        <Heart
                          className={`w-4 h-4 transition-colors ${
                            isBookmarked ? "fill-rose-500 text-rose-500" : "text-[#646982]"
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item);
                        }}
                        className="h-10 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs shadow-emerald-500/20 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Pesan</span>
                      </button>
                    </div>
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
