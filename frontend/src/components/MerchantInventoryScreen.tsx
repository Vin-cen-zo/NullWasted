import React from "react";
import { ItemListing } from "../types/listing";
import { Trash2, PlusCircle, ShieldCheck, Clock, Store } from "lucide-react";

interface MerchantInventoryScreenProps {
  listings: ItemListing[];
  onDeleteListing: (id: string) => Promise<void>;
  onNavigateToCreate: () => void;
  storeName: string;
}

export const MerchantInventoryScreen: React.FC<MerchantInventoryScreenProps> = ({
  listings,
  onDeleteListing,
  onNavigateToCreate,
  storeName,
}) => {
  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1F1D1A]">Inventaris Aktif Gerai</h2>
          <p className="text-xs text-[#6B655B]">{storeName} · Live Catalog</p>
        </div>
        <button
          type="button"
          onClick={onNavigateToCreate}
          className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Tambah Menu</span>
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
            className="mt-4 text-xs font-bold text-emerald-600 underline"
          >
            Buat Listing Sekarang
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((item) => (
            <div
              key={item.id}
              className="bg-white p-3.5 rounded-2xl border border-[#E2DDD3] shadow-sm hover:border-emerald-300 transition-all flex flex-col justify-between space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      {item.discount_percent}% OFF
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      BPOM Safe
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-[#1F1D1A] leading-snug">{item.food_name}</h3>
                  <p className="text-[10px] text-[#6B655B]">{item.category}</p>
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

              <div className="flex items-center justify-between text-[10px] text-[#6B655B] bg-[#F8F6F0] px-2.5 py-1.5 rounded-xl">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-600" />
                  Sisa {item.minutes_until_closing} mnt tutup
                </span>
                <span>Dimasak {item.hours_since_cooked}j lalu</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
