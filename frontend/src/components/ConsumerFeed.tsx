import React from "react";
import { MapPin, Clock, ShoppingBag, ExternalLink, ShieldCheck, AlertCircle } from "lucide-react";
import { ItemListing } from "../types/listing";

interface ConsumerFeedProps {
  listings: ItemListing[];
  onReserve: (listingId: string) => void;
  isReservingId: string | null;
}

export const ConsumerFeed: React.FC<ConsumerFeedProps> = ({
  listings,
  onReserve,
  isReservingId,
}) => {
  return (
    <div className="space-y-4">
      {/* Feed Header Banner */}
      <div className="bg-[#FFFFFF] p-5 rounded-2xl border border-[#E5E0D8] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-[#10B981]/10 text-[#059669]">
              <ShoppingBag className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-[#1F1D1A]">
              Katalog Surplus Food Sekitar Kampus UI
            </h2>
          </div>
          <p className="text-xs text-[#6B7280]">
            Penyelamatan makanan surplus berkualitas tinggi dengan diskon 50%–70% menjelang toko tutup
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>100% Lolos Guardrail BPOM</span>
          </span>
        </div>
      </div>

      {/* Grid of Listings */}
      {listings.length === 0 ? (
        <div className="bg-[#FFFFFF] p-12 rounded-2xl border border-[#E5E0D8] text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-[#6B7280] mx-auto opacity-50" />
          <h3 className="font-bold text-sm text-[#1F1D1A]">Semua Menu Surplus Sudah Terjual Habis!</h3>
          <p className="text-xs text-[#6B7280] max-w-md mx-auto">
            Tidak ada makanan surplus aktif saat ini. Beralihlah ke <strong>Mode Penjual</strong> untuk membuat listing baru.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((item) => {
            const isProcessing = isReservingId === item.id;

            return (
              <div
                key={item.id}
                className="bg-[#FFFFFF] rounded-2xl border border-[#E5E0D8] p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3 group"
              >
                {/* Top card info */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                      Diskon -{item.discount_percent}% (Locked)
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Tersisa {item.quantity} porsi
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-[#1F1D1A] group-hover:text-[#10B981] transition-colors line-clamp-1">
                      {item.food_name}
                    </h3>
                    <p className="text-[11px] text-[#6B7280]">
                      {item.store_name}
                    </p>
                  </div>

                  {/* Location Proximity Badge */}
                  <div className="flex items-center justify-between text-[11px] text-[#6B7280] bg-[#F8F6F0] p-2 rounded-xl border border-[#E5E0D8]">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-[#10B981] flex-shrink-0" />
                      <span className="truncate">{item.location_badge}</span>
                    </div>
                    <a
                      href={item.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#10B981] hover:underline flex items-center gap-0.5 flex-shrink-0 ml-1 font-medium"
                    >
                      <span>Rute</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>

                  {/* Closing Window Countdown Indicator */}
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50/70 px-2.5 py-1.5 rounded-xl border border-amber-200/60 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>Tutup dalam {item.minutes_until_closing} menit (Self-Pickup)</span>
                  </div>
                </div>

                {/* Bottom card actions */}
                <div className="pt-2 border-t border-[#E5E0D8] space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-[#6B7280] line-through">
                      Rp{item.original_price.toLocaleString("id-ID")}
                    </span>
                    <span className="text-base font-extrabold text-[#10B981]">
                      Rp{item.discounted_price.toLocaleString("id-ID")}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onReserve(item.id)}
                    disabled={isProcessing || item.quantity === 0}
                    className="w-full py-2.5 px-3 rounded-xl font-bold text-xs bg-[#10B981] hover:bg-[#059669] text-white flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Memproses Reservasi...
                      </span>
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>🛍️ Klaim / Pesan 1 Porsi</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
