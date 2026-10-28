import React, { useState, useEffect } from "react";
import { ItemListing } from "../types/listing";
import { X, ShieldCheck, MapPin, Clock, ExternalLink, ShoppingBag, Plus, Minus } from "lucide-react";

interface ConsumerDetailModalProps {
  item: ItemListing | null;
  onClose: () => void;
  onReserve: (listingId: string, quantity: number) => Promise<void>;
  isReserving: boolean;
}

export const ConsumerDetailModal: React.FC<ConsumerDetailModalProps> = ({
  item,
  onClose,
  onReserve,
  isReserving,
}) => {
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setQty(1);
  }, [item?.id]);

  if (!item) return null;

  const maxQty = item.quantity;
  const totalPrice = item.discounted_price * qty;

  const handleIncrement = () => {
    if (qty < maxQty) setQty(qty + 1);
  };

  const handleDecrement = () => {
    if (qty > 1) setQty(qty - 1);
  };

  const handleConfirmReservation = async () => {
    if (isReserving) return;
    await onReserve(item.id, qty);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
      <div className="w-full max-w-[440px] bg-white rounded-t-[32px] sm:rounded-[32px] p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto space-y-4">
        {/* Top Handle / Close */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <span className="text-[11px] font-bold tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full uppercase border border-emerald-200">
            {item.category}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Food Info & Pricing */}
        <div>
          <h2 className="text-base font-extrabold text-[#1F1D1A] leading-snug">{item.food_name}</h2>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs font-semibold text-emerald-800">{item.store_name}</p>
            <div className="text-right">
              <span className="text-xs text-gray-400 line-through mr-1.5">
                Rp {item.original_price.toLocaleString("id-ID")}
              </span>
              <span className="text-sm font-black text-emerald-600">
                Rp {item.discounted_price.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>

        {/* Location & Map Link */}
        <div className="bg-[#F8F6F0] p-3 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-[#1F1D1A]">{item.location_badge}</p>
              <p className="text-[10px] text-[#6B655B]">Self-Pickup sebelum gerai tutup</p>
            </div>
          </div>
          {item.maps_url && (
            <a
              href={item.maps_url}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-xl bg-white border border-[#D8D2C5] text-emerald-700 hover:bg-gray-50 flex items-center gap-1 text-[11px] font-bold"
            >
              <span>Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* BPOM Safety Guarantee Box */}
        <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Jaminan Keamanan Pangan BPOM</span>
          </div>
          <p className="text-[11px] text-emerald-950 leading-relaxed">
            {item.safety_reason}
          </p>
          <div className="flex items-center justify-between text-[10px] text-emerald-800/80 pt-1 border-t border-emerald-200">
            <span>Dimasak: {item.hours_since_cooked} jam lalu (Maks: {item.bpom_max_hours} jam)</span>
            <span className="font-mono">{item.regulation_ref}</span>
          </div>
        </div>

        {/* Closing Window Counter */}
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Batas pengambilan: <strong>{item.minutes_until_closing} menit lagi</strong></span>
        </div>

        {/* Quantity Stepper & Total */}
        <div className="p-3.5 rounded-2xl bg-[#F8F6F0] border border-[#E8E2D5] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1F1D1A]">Pilih Jumlah Porsi:</span>
            <div className="flex items-center gap-3 bg-white px-2 py-1 rounded-xl border border-[#D8D2C5]">
              <button
                type="button"
                onClick={handleDecrement}
                disabled={qty <= 1}
                className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold font-mono min-w-[20px] text-center">{qty}</span>
              <button
                type="button"
                onClick={handleIncrement}
                disabled={qty >= maxQty}
                className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E8E2D5]">
            <span className="text-[#6B655B]">Total Pembayaran:</span>
            <span className="text-base font-extrabold text-emerald-600 font-mono">
              Rp {totalPrice.toLocaleString("id-ID")}
            </span>
          </div>
        </div>

        {/* Reserve CTA */}
        <button
          type="button"
          disabled={isReserving || maxQty <= 0}
          onClick={handleConfirmReservation}
          className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all ${
            isReserving || maxQty <= 0
              ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
              : "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-500/20 active:scale-[0.98]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>{isReserving ? "Memproses Reservasi Stok..." : "Reservasi Sekarang (Potong Stok Atomik)"}</span>
        </button>
      </div>
    </div>
  );
};

