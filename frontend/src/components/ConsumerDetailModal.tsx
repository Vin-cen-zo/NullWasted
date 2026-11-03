import React, { useState, useEffect } from "react";
import { ItemListing } from "../types/listing";
import {
  X,
  ShieldCheck,
  MapPin,
  Clock,
  ExternalLink,
  ShoppingBag,
  Plus,
  Minus,
  Package,
  QrCode,
  Banknote,
  CheckCircle2,
} from "lucide-react";

interface ConsumerDetailModalProps {
  item: ItemListing | null;
  onClose: () => void;
  onReserve: (listingId: string, quantity: number, paymentMethod: string) => Promise<void>;
  isReserving: boolean;
}

export const ConsumerDetailModal: React.FC<ConsumerDetailModalProps> = ({
  item,
  onClose,
  onReserve,
  isReserving,
}) => {
  const [qty, setQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"CASH_ON_PICKUP" | "SIMULATED_QRIS">("CASH_ON_PICKUP");
  const [isQrisPaid, setIsQrisPaid] = useState(false);

  useEffect(() => {
    setQty(1);
    setPaymentMethod("CASH_ON_PICKUP");
    setIsQrisPaid(false);
  }, [item?.id]);

  if (!item) return null;

  const maxQty = item.quantity;
  const originalTotal = item.original_price * qty;
  const totalPrice = item.discounted_price * qty;
  const discountSavings = originalTotal - totalPrice;

  let bundledList: Array<{ food_name: string; quantity: number; original_price: number }> = [];
  if (item.is_bundle && item.bundled_items_json) {
    try {
      bundledList = JSON.parse(item.bundled_items_json);
    } catch {
      bundledList = [];
    }
  }

  const handleIncrement = () => {
    if (qty < maxQty) setQty(qty + 1);
  };

  const handleDecrement = () => {
    if (qty > 1) setQty(qty - 1);
  };

  const handleConfirmReservation = async () => {
    if (isReserving) return;
    await onReserve(item.id, qty, paymentMethod);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
      <div className="w-full max-w-[440px] bg-white rounded-t-[32px] sm:rounded-[32px] p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto space-y-4">
        {/* Top Handle / Close */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            {item.is_bundle ? (
              <span className="text-[11px] font-extrabold tracking-wider text-purple-900 bg-purple-100 px-2.5 py-1 rounded-full uppercase border border-purple-300 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                MYSTERY BAG ({item.discount_percent}% OFF)
              </span>
            ) : (
              <span className="text-[11px] font-bold tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full uppercase border border-emerald-200">
                {item.category} ({item.discount_percent}% OFF)
              </span>
            )}
          </div>
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
              <span className="text-base font-black text-emerald-600">
                Rp {item.discounted_price.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>

        {/* Mystery Bag Items Breakdown */}
        {item.is_bundle && bundledList.length > 0 && (
          <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 text-xs space-y-1.5">
            <div className="flex items-center gap-1 font-bold text-purple-950">
              <Package className="w-4 h-4 text-purple-600" />
              <span>Isi Paket Kejutan (Mystery Surprise):</span>
            </div>
            <ul className="space-y-1 pt-1 text-[11px] text-purple-900">
              {bundledList.map((b, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <span>
                    • {b.quantity}x {b.food_name}
                  </span>
                  <span className="text-stone-400 line-through text-[10px]">
                    Rp {(b.original_price * b.quantity).toLocaleString("id-ID")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-purple-700 italic pt-1 border-t border-purple-200/60">
              ⚠️ Catatan Alergen: Paket kejutan ini mencakup menu dapur hari ini. Periksa bahan sebelum konsumsi.
            </p>
          </div>
        )}

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
          <p className="text-[11px] text-emerald-950 leading-relaxed">{item.safety_reason}</p>
          <div className="flex items-center justify-between text-[10px] text-emerald-800/80 pt-1 border-t border-emerald-200">
            <span>
              Dimasak: {item.hours_since_cooked} jam lalu (Maks: {item.bpom_max_hours} jam)
            </span>
            <span className="font-mono">{item.regulation_ref}</span>
          </div>
        </div>

        {/* Closing Window Counter */}
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Batas pengambilan: <strong>{item.minutes_until_closing} menit lagi</strong>
          </span>
        </div>

        {/* Quantity Stepper */}
        {!item.is_bundle && (
          <div className="p-3 rounded-2xl bg-[#F8F6F0] border border-[#E8E2D5] flex items-center justify-between">
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
        )}

        {/* Transparent Bill Settlement Sheet */}
        <div className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-2 text-xs">
          <h4 className="font-bold text-[11px] text-stone-700 uppercase tracking-wider">
            Ringkasan Tagihan Transparan
          </h4>
          <div className="space-y-1 text-stone-600">
            <div className="flex items-center justify-between">
              <span>Harga Normal Kumulatif ({qty} porsi)</span>
              <span className="font-mono text-stone-400 line-through">
                Rp {originalTotal.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="flex items-center justify-between text-emerald-700 font-semibold">
              <span>Potongan Penyelamatan Pangan ({item.discount_percent}%)</span>
              <span className="font-mono">- Rp {discountSavings.toLocaleString("id-ID")}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-stone-100 font-bold text-stone-900 text-sm">
              <span>Total Bersih Bayar:</span>
              <span className="text-emerald-600 font-extrabold font-mono">
                Rp {totalPrice.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-stone-800">Pilih Metode Pembayaran:</label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setPaymentMethod("CASH_ON_PICKUP");
                setIsQrisPaid(false);
              }}
              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                paymentMethod === "CASH_ON_PICKUP"
                  ? "bg-amber-50/80 border-amber-400 font-bold text-amber-950 shadow-xs ring-1 ring-amber-400"
                  : "bg-white border-stone-200 text-stone-600 hover:border-amber-300"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Banknote className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-[11px]">Tunai di Kasir</span>
              </div>
              <span className="text-[10px] text-stone-500 font-normal">Cash on Pickup</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod("SIMULATED_QRIS")}
              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                paymentMethod === "SIMULATED_QRIS"
                  ? "bg-emerald-50/80 border-emerald-500 font-bold text-emerald-950 shadow-xs ring-1 ring-emerald-500"
                  : "bg-white border-stone-200 text-stone-600 hover:border-emerald-300"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-[11px]">QRIS Instan</span>
              </div>
              <span className="text-[10px] text-stone-500 font-normal">Simulasi Digital</span>
            </button>
          </div>
        </div>

        {/* QRIS Interactive Box if SIMULATED_QRIS chosen */}
        {paymentMethod === "SIMULATED_QRIS" && (
          <div className="p-3.5 bg-emerald-50/90 rounded-2xl border border-emerald-300 text-xs space-y-2 text-center animate-fade-in">
            <span className="font-bold text-emerald-950 text-xs block">
              Simulasi QRIS NullWasted Merchant
            </span>
            <div className="w-32 h-32 mx-auto bg-white p-2 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-center">
              <QrCode className="w-24 h-24 text-emerald-800" />
            </div>
            <p className="text-[10px] text-emerald-800">
              Total Tagihan QRIS: <strong>Rp {totalPrice.toLocaleString("id-ID")}</strong>
            </p>

            {isQrisPaid ? (
              <div className="p-2 bg-emerald-100 border border-emerald-400 text-emerald-900 rounded-xl font-bold flex items-center justify-center gap-1 text-[11px]">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Pembayaran QRIS Berhasil (PAID)</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsQrisPaid(true)}
                className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs active:scale-95 transition"
              >
                ✅ Simulasi Bayar QRIS Sekarang
              </button>
            )}
          </div>
        )}

        {/* Reserve CTA */}
        <button
          type="button"
          disabled={isReserving || maxQty <= 0 || (paymentMethod === "SIMULATED_QRIS" && !isQrisPaid)}
          onClick={handleConfirmReservation}
          className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all ${
            isReserving || maxQty <= 0 || (paymentMethod === "SIMULATED_QRIS" && !isQrisPaid)
              ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
              : "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-500/20 active:scale-[0.98]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>
            {isReserving
              ? "Memproses Reservasi Stok..."
              : paymentMethod === "SIMULATED_QRIS" && !isQrisPaid
              ? "Klik 'Simulasi Bayar QRIS' di atas terlebih dahulu"
              : `Konfirmasi Reservasi (${paymentMethod === "SIMULATED_QRIS" ? "Lunas QRIS" : "Bayar Tunai di Kasir"})`}
          </span>
        </button>
      </div>
    </div>
  );
};
