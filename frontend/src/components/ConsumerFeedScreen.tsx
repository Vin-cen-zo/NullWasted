import React, { useState } from "react";
import { ItemListing } from "../types/listing";
import { ShieldCheck, MapPin, Clock, Utensils, Search } from "lucide-react";

interface ConsumerFeedScreenProps {
  listings: ItemListing[];
  onSelectItem: (item: ItemListing) => void;
  customerName: string;
}

export const ConsumerFeedScreen: React.FC<ConsumerFeedScreenProps> = ({
  listings,
  onSelectItem,
  customerName,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<"ALL" | "HEAVY" | "BAKERY">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredListings = listings.filter((item) => {
    // Filter category
    if (selectedFilter === "BAKERY" && item.category !== "LOW_PERISHABILITY") return false;
    if (selectedFilter === "HEAVY" && item.category === "LOW_PERISHABILITY") return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.food_name.toLowerCase().includes(q);
      const matchStore = item.store_name.toLowerCase().includes(q);
      if (!matchName && !matchStore) return false;
    }

    return true;
  });

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
      {/* Header Greeting */}
      <div>
        <h2 className="text-sm font-bold text-[#1F1D1A]">Selamat Datang, {customerName} 👋</h2>
        <p className="text-xs text-[#6B655B] flex items-center gap-1 mt-0.5">
          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
          <span>Surplus Makanan di Sekitar Kampus UI Depok</span>
        </p>
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

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setSelectedFilter("ALL")}
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all ${
            selectedFilter === "ALL"
              ? "bg-[#10B981] text-white shadow-sm"
              : "bg-white text-[#6B655B] border border-[#D8D2C5] hover:bg-gray-50"
          }`}
        >
          Semua ({listings.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter("HEAVY")}
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all ${
            selectedFilter === "HEAVY"
              ? "bg-[#10B981] text-white shadow-sm"
              : "bg-white text-[#6B655B] border border-[#D8D2C5] hover:bg-gray-50"
          }`}
        >
          Makanan Berat
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter("BAKERY")}
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all ${
            selectedFilter === "BAKERY"
              ? "bg-[#10B981] text-white shadow-sm"
              : "bg-white text-[#6B655B] border border-[#D8D2C5] hover:bg-gray-50"
          }`}
        >
          Roti & Pastry
        </button>
      </div>

      {/* Food Discovery Cards List */}
      {filteredListings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-dashed border-[#D8D2C5]">
          <Utensils className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-xs font-bold text-[#1F1D1A]">Tidak Ada Makanan Ditemukan</p>
          <p className="text-[11px] text-[#6B655B] mt-1">
            Belum ada listing aktif untuk filter atau pencarian saat ini.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          {filteredListings.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="bg-white p-3.5 rounded-2xl border border-[#E2DDD3] shadow-sm hover:border-emerald-400 hover:shadow-md cursor-pointer transition-all flex flex-col space-y-2.5 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      {item.discount_percent}% OFF
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      Lolos BPOM
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#1F1D1A] leading-snug">{item.food_name}</h3>
                  <p className="text-xs font-semibold text-emerald-800 mt-0.5">{item.store_name}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] text-gray-400 line-through block">
                    Rp {item.original_price.toLocaleString("id-ID")}
                  </span>
                  <span className="text-sm font-extrabold text-emerald-600">
                    Rp {item.discounted_price.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              {/* Location & Closing Window Badges */}
              <div className="flex items-center justify-between text-[11px] text-[#6B655B] bg-[#F8F6F0] px-2.5 py-1.5 rounded-xl">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  {item.location_badge}
                </span>
                <span className="flex items-center gap-1 font-medium text-amber-700">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Sisa {item.minutes_until_closing} mnt
                </span>
              </div>

              {/* Stock and Action CTA */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-gray-500">
                  Tersisa: <strong className="text-[#1F1D1A]">{item.quantity} porsi</strong>
                </span>
                <span className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
                  Lihat Detail & Pesan &rarr;
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

