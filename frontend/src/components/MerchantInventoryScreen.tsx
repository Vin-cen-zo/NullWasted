import React, { useState } from "react";
import { ItemListing, getFriendlyCategory } from "../types/listing";
import { Trash2, PlusCircle, ShieldCheck, Store, Sparkles, Package } from "lucide-react";
import { ClosingCountdownBadge } from "./ClosingCountdownBadge";

interface MerchantInventoryScreenProps {
  listings: ItemListing[];
  onDeleteListing: (id: string) => Promise<void>;
  onNavigateToCreate: () => void;
  onCreateSmartBundle?: () => Promise<void>;
  storeName: string;
}

export const MerchantInventoryScreen: React.FC<MerchantInventoryScreenProps> = ({
  listings,
  onDeleteListing,
  onNavigateToCreate,
  onCreateSmartBundle,
  storeName,
}) => {
  const [isBundling, setIsBundling] = useState(false);

  // Count items eligible for mystery bag bundling (qty 1 or 2, not already a bundle, safe)
  const eligibleItems = listings.filter(
    (item) => !item.is_bundle && item.is_active && item.quantity >= 1 && item.quantity <= 2
  );

  const handleBundleClick = async () => {
    if (!onCreateSmartBundle || isBundling) return;
    try {
      setIsBundling(true);
      await onCreateSmartBundle();
    } catch (err: unknown) {
      console.error("Gagal membuat mystery bag:", err);
    } finally {
      setIsBundling(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-4">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1F1D1A]">Inventaris Aktif Gerai</h2>
          <p className="text-xs text-[#6B655B]">{storeName} · Live Catalog</p>
        </div>
        <button
          type="button"
          onClick={onNavigateToCreate}
          className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Tambah Menu</span>
        </button>
      </div>

      {/* Smart Mystery Bag Bundling Action Banner */}
      <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-emerald-50 p-3.5 rounded-2xl border border-purple-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold text-purple-950">Smart Mystery Bag Bundling</h3>
          </div>
          <p className="text-[11px] text-purple-800">
            {eligibleItems.length >= 2
              ? `${eligibleItems.length} menu berporsi kecil siap digabung dengan diskon 65%!`
              : "Perlu minimal 2 menu porsi kecil (1-2 porsi) untuk paket kejutan."}
          </p>
        </div>

        <button
          type="button"
          disabled={eligibleItems.length < 2 || isBundling || !onCreateSmartBundle}
          onClick={handleBundleClick}
          className={`flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition shadow-sm ${
            eligibleItems.length < 2 || !onCreateSmartBundle
              ? "bg-stone-200 text-stone-400 cursor-not-allowed border border-stone-300"
              : isBundling
              ? "bg-purple-300 text-white cursor-wait"
              : "bg-purple-600 hover:bg-purple-700 text-white active:scale-95 shadow-purple-500/20 cursor-pointer"
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>{isBundling ? "Menggabungkan..." : "Buat Mystery Bag"}</span>
        </button>
      </div>

      {/* Listing Cards */}
      {listings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-dashed border-[#D8D2C5]">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <Store className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-[#1F1D1A]">Belum Ada Makanan Aktif</p>
          <p className="text-[11px] text-[#6B655B] mt-1 max-w-[220px]">
            Gunakan tab Buat Listing untuk mempublikasikan menu surplus malam ini.
          </p>
          <button
            type="button"
            onClick={onNavigateToCreate}
            className="mt-4 text-xs font-bold text-emerald-600 underline cursor-pointer"
          >
            Buat Listing Sekarang
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {listings.map((item) => {
            let bundledList: Array<{ food_name: string; quantity: number }> = [];
            if (item.is_bundle && item.bundled_items_json) {
              try {
                bundledList = JSON.parse(item.bundled_items_json);
              } catch {
                bundledList = [];
              }
            }

            return (
              <div
                key={item.id}
                className={`bg-white p-4 rounded-2xl border shadow-sm transition-all h-full flex flex-col justify-between space-y-3 ${
                  item.is_bundle
                    ? "border-purple-300 bg-gradient-to-b from-purple-50/40 to-white"
                    : "border-[#E2DDD3] hover:border-emerald-300"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {item.is_bundle && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-extrabold tracking-wide flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          MYSTERY BAG
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        {item.discount_percent}% OFF
                      </span>
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
                    <p className="text-[10px] text-[#6B655B]">
                      {getFriendlyCategory(item.category, item.is_bundle).label}
                    </p>

                    {/* Rincian item mystery bag jika ada */}
                    {item.is_bundle && bundledList.length > 0 && (
                      <div className="mt-2 p-2 bg-purple-50/70 border border-purple-200 rounded-xl text-[10px] text-purple-900 space-y-0.5">
                        <span className="font-bold block text-purple-950">Isi Paket Kejutan:</span>
                        <ul className="list-disc list-inside">
                          {bundledList.map((b, idx) => (
                            <li key={idx}>
                              {b.quantity}x {b.food_name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteListing(item.id)}
                    title="Tarik menu dari pasar"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100">
                  <div>
                    <span className="text-[10px] text-gray-400 line-through mr-1.5">
                      Rp {item.original_price.toLocaleString("id-ID")}
                    </span>
                    <span className="font-bold text-emerald-600">
                      Rp {item.discounted_price.toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-[#1F1D1A]">
                      Tersisa: {item.quantity} / {item.initial_quantity} porsi
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
