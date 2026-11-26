import React, { useEffect, useMemo, useState } from "react";
import { ItemListing, cleanLocationBadge, humanizeBpomText, resolveImageUrl } from "../types/listing";
import {
  ShieldCheck,
  Search,
  Package,
  Map as MapIcon,
  Navigation,
  Crosshair,
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
  isGuest?: boolean;
  onOpenLogin?: () => void;
  favoriteStoreIds?: string[];
  onToggleFavoriteStore?: (storeId: string) => void;
  onOpenStoreProfile?: (storeId: string) => void;
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
  isGuest = false,
  onOpenLogin,
  favoriteStoreIds = [],
  onToggleFavoriteStore,
  onOpenStoreProfile,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | "FAVORITES" | "BAKERY" | "HEAVY" | "BEVERAGE" | "BUNDLE">("ALL");
  const [selectedRadius, setSelectedRadius] = useState<"ALL" | "500" | "1500">("ALL");
  const [sortBy, setSortBy] = useState<"NEAREST" | "CHEAPEST" | "BIGGEST_DISCOUNT" | "CLOSING_SOON">("NEAREST");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMapOpen, setIsMapOpen] = useState(false);

  // Live Device GPS (auto-requested after consumer enters feed)
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"PENDING" | "LIVE_GPS" | "UNAVAILABLE">("PENDING");
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [nowTick, setNowTick] = useState<number>(() => getEffectiveNow().getTime());

  // Tick every 15s (paused while map modal is open to prevent unnecessary Leaflet re-renders)
  useEffect(() => {
    const syncNow = () => setNowTick(getEffectiveNow().getTime());
    window.addEventListener(NW_CLOCK_CHANGE_EVENT, syncNow);
    if (isMapOpen) {
      return () => {
        window.removeEventListener(NW_CLOCK_CHANGE_EVENT, syncNow);
      };
    }
    const timer = setInterval(syncNow, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NW_CLOCK_CHANGE_EVENT, syncNow);
    };
  }, [isMapOpen]);

  const toggleBookmark = (storeId: string | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!storeId) return;
    if (onToggleFavoriteStore) {
      onToggleFavoriteStore(storeId);
    }
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

    // 1. Food Type & Favorite Store Filter
    if (selectedCategory === "FAVORITES") {
      if (!item.store_id || !favoriteStoreIds.includes(item.store_id)) return false;
    } else if (selectedCategory === "BUNDLE") {
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
    if (sortBy === "CHEAPEST") {
      return a.discounted_price - b.discounted_price;
    }
    if (sortBy === "BIGGEST_DISCOUNT") {
      return b.discount_percent - a.discount_percent;
    }
    if (sortBy === "CLOSING_SOON") {
      const secA = computeEffectiveSecondsUntilClosing(a.closing_time || "20:30", a.expires_at);
      const secB = computeEffectiveSecondsUntilClosing(b.closing_time || "20:30", b.expires_at);
      return secA - secB;
    }

    const aFav = a.store_id && favoriteStoreIds.includes(a.store_id) ? 1 : 0;
    const bFav = b.store_id && favoriteStoreIds.includes(b.store_id) ? 1 : 0;
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
          aria-label={`Buka Peta Gerai (${activeNonExpiredListings.length} menu aktif)`}
          title="Buka Peta Gerai"
          className="relative flex items-center gap-2 h-11 px-4 rounded-lg bg-[#181C2E] hover:bg-[#252a44] text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
        >
          <MapIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Peta Gerai</span>
          <span className="min-w-[20px] h-5 px-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-extrabold flex items-center justify-center">
            {activeNonExpiredListings.length}
          </span>
        </button>
      </div>

      {/* Clean Greeting / Guest Welcome Banner */}
      {isGuest ? (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm sm:text-base font-bold text-[#181C2E]">
              Selamatkan Makanan Surplus Hemat 50%–70%
            </p>
            <p className="text-xs text-[#646982]">
              Jelajahi menu surplus tervalidasi BPOM di sekitar Anda. Masuk saat siap memesan.
            </p>
          </div>
          {onOpenLogin && (
            <button
              type="button"
              onClick={onOpenLogin}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 cursor-pointer transition-colors"
            >
              Masuk / Daftar
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className="text-[16px] text-[#1A1817]">
            Halo <span className="font-normal">{customerName},</span>{" "}
            <span className="font-bold text-[#181C2E]">Siap Selamatkan Surplus?</span>
          </p>
        </div>
      )}

      {/* Search Bar & Radius Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <div className="relative md:col-span-7">
          <label htmlFor="consumer-search-input" className="sr-only">
            Cari makanan surplus
          </label>
          <Search className="w-[18px] h-[18px] text-[#676767] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="consumer-search-input"
            name="searchQuery"
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
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-xl font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "ALL"
                ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "ALL" ? "bg-white" : "bg-[#F0F5FA]"}`}>
              <LayoutGrid className="w-4 h-4 text-[#181C2E]" />
            </span>
            <span>Semua ({activeNonExpiredListings.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("FAVORITES")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-xl font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "FAVORITES"
                ? "bg-rose-600 text-white shadow-[0_10px_25px_rgba(225,29,72,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "FAVORITES" ? "bg-white/20" : "bg-rose-50"}`}>
              <Heart className={`w-4 h-4 ${selectedCategory === "FAVORITES" ? "text-white fill-white" : "text-rose-500"}`} />
            </span>
            <span>Gerai Favorit ({favoriteStoreIds.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("BAKERY")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-xl font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "BAKERY"
                ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "BAKERY" ? "bg-white" : "bg-[#F0F5FA]"}`}>
              <Croissant className="w-4 h-4 text-emerald-600" />
            </span>
            <span>Roti & Kue</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("HEAVY")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-xl font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "HEAVY"
                ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "HEAVY" ? "bg-white" : "bg-[#F0F5FA]"}`}>
              <Utensils className="w-4 h-4 text-emerald-600" />
            </span>
            <span>Makanan Berat</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("BEVERAGE")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-xl font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
              selectedCategory === "BEVERAGE"
                ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.25)]"
                : "bg-white text-[#32343E] shadow-[0_8px_24px_rgba(150,150,154,0.14)] hover:bg-slate-50"
            }`}
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedCategory === "BEVERAGE" ? "bg-white" : "bg-[#F0F5FA]"}`}>
              <Coffee className="w-4 h-4 text-emerald-600" />
            </span>
            <span>Minuman</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("BUNDLE")}
            className={`shrink-0 h-[52px] pl-2 pr-5 rounded-xl font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
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

      {/* Section Heading & Sort Control */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[18px] font-medium text-[#32343E]">Surplus Terdekat</h2>
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>{filteredListings.length} Tersedia</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="consumer-sort-select" className="text-xs font-semibold text-[#646982]">
            Urutkan:
          </label>
          <select
            id="consumer-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs font-bold text-[#181C2E] bg-[#F0F5FA] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="NEAREST">Terdekat (GPS)</option>
            <option value="CHEAPEST">Termurah</option>
            <option value="BIGGEST_DISCOUNT">Diskon Terbesar</option>
            <option value="CLOSING_SOON">Paling Cepat Tutup</option>
          </select>
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
            const isBookmarked = Boolean(item.store_id && favoriteStoreIds.includes(item.store_id));

            return (
              <article
                key={item.id}
                onClick={() => onSelectItem(item)}
                className={`bg-white rounded-xl overflow-hidden shadow-[0_4px_16px_rgba(15,23,42,0.06)] hover:shadow-[0_10px_28px_rgba(15,23,42,0.12)] transition-all duration-200 flex flex-col cursor-pointer border ${
                  item.is_bundle ? "border-purple-300" : "border-slate-300/80 hover:border-emerald-400"
                }`}
              >
                {/* Food Image Banner */}
                {hasImage ? (
                  <div className="relative w-full h-44 overflow-hidden bg-[#F0F5FA] group shrink-0">
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
                        <span>{item.quantity} Porsi</span>
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
                      {item.quantity <= 2
                        ? item.is_bundle
                          ? `Sisa ${item.quantity} Paket`
                          : `Sisa ${item.quantity} Porsi`
                        : `${item.quantity} Porsi`}
                    </span>
                    <span className="bg-[#181C2E] text-white font-bold text-[11px] px-2.5 py-1 rounded-lg">
                      {item.discount_percent}% OFF
                    </span>
                  </div>
                )}

                {/* Card Content (ShopeeFood-inspired Unified Headline) */}
                <div className="p-4 flex flex-col space-y-3.5 flex-1 justify-between">
                  <div className="space-y-1.5">
                    {/* Dish Name + Clickable Store Profile Link */}
                    <h4 className="font-normal text-[18px] text-[#222222] leading-snug line-clamp-1">
                      {item.food_name}
                    </h4>
                    {item.store_id && onOpenStoreProfile ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenStoreProfile(item.store_id!);
                        }}
                        className="text-xs font-semibold text-emerald-700 hover:underline truncate block text-left cursor-pointer"
                        title={`Lihat profil ${item.store_name}`}
                      >
                        {item.store_name} &rarr;
                      </button>
                    ) : (
                      <p className="text-xs font-semibold text-[#646982] truncate">{item.store_name}</p>
                    )}

                    {/* Clean 1-Line Subtitle */}
                    <p className="text-[13px] leading-relaxed text-[#646982] line-clamp-1">
                      {humanizeBpomText(item.safety_reason) || item.hazard_description || "Makanan surplus higienis berstandar BPOM."}
                    </p>
                  </div>

                  {/* Distance & Closing Time Row */}
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#646982]">
                      <span className="min-w-0 flex-1 truncate font-medium text-[#32343E]" title={distLabel}>
                        {distLabel}
                      </span>
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
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/80">
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
                        onClick={(e) => toggleBookmark(item.store_id, e)}
                        aria-label="Favoritkan gerai"
                        aria-pressed={isBookmarked}
                        title={isBookmarked ? "Hapus gerai dari favorit" : "Simpan gerai ke favorit"}
                        className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
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
                        className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-emerald-500/20 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
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
