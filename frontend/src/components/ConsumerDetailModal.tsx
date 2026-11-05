import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
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
  Loader2,
  ArrowRight,
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

  // QRIS Payment Modal State (Pilar 5)
  const [isQrisSheetOpen, setIsQrisSheetOpen] = useState(false);
  const [qrisSecondsLeft, setQrisSecondsLeft] = useState(900); // 15 menit
  const [isConfirmingQris, setIsConfirmingQris] = useState(false);

  useEffect(() => {
    setQty(1);
    setPaymentMethod("CASH_ON_PICKUP");
    setIsQrisSheetOpen(false);
    setIsConfirmingQris(false);
    setQrisSecondsLeft(900);
  }, [item?.id]);

  // QRIS 15-minute countdown timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isQrisSheetOpen && qrisSecondsLeft > 0) {
      timer = setInterval(() => {
        setQrisSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isQrisSheetOpen, qrisSecondsLeft]);

  if (!item) return null;

  const maxQty = item.quantity;
  const originalTotal = item.original_price * qty;
  const totalPrice = item.discounted_price * qty;
  const discountSavings = originalTotal - totalPrice;

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

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

  const handleMainActionClick = async () => {
    if (isReserving) return;
    if (paymentMethod === "SIMULATED_QRIS") {
      setQrisSecondsLeft(900);
      setIsQrisSheetOpen(true);
    } else {
      await onReserve(item.id, qty, "CASH_ON_PICKUP");
    }
  };

  const handleConfirmQrisPayment = async () => {
    if (isConfirmingQris || isReserving) return;
    try {
      setIsConfirmingQris(true);
      // Realistic payment settlement handshake delay (1200ms)
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await onReserve(item.id, qty, "SIMULATED_QRIS");
      setIsQrisSheetOpen(false);
    } catch (err) {
      console.error("Gagal memproses pembayaran QRIS:", err);
    } finally {
      setIsConfirmingQris(false);
    }
  };

  return (
    <>
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
                onClick={() => setPaymentMethod("CASH_ON_PICKUP")}
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
                <span className="text-[10px] text-stone-500 font-normal">Pembayaran Digital</span>
              </button>
            </div>
          </div>

          {/* Reserve / Proceed to Payment CTA */}
          <button
            type="button"
            disabled={isReserving || maxQty <= 0}
            onClick={handleMainActionClick}
            className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all ${
              isReserving || maxQty <= 0
                ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                : "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-500/20 active:scale-[0.98]"
            }`}
          >
            {isReserving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses Reservasi Stok...</span>
              </>
            ) : paymentMethod === "SIMULATED_QRIS" ? (
              <>
                <QrCode className="w-4 h-4" />
                <span>Lanjut ke Pembayaran QRIS (Rp {totalPrice.toLocaleString("id-ID")})</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                <span>Konfirmasi Reservasi (Bayar Tunai di Kasir · Rp {totalPrice.toLocaleString("id-ID")})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL LEMBAR PEMBAYARAN QRIS RESMI (Pilar 5)                              */}
      {/* ========================================================================= */}
      {isQrisSheetOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-stone-200 flex flex-col items-center space-y-4 text-center">
            {/* Modal Header */}
            <div className="w-full flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-1.5 text-left">
                <span className="px-2 py-0.5 rounded-md bg-red-600 text-white font-black text-[10px] tracking-widest">
                  QRIS
                </span>
                <div>
                  <span className="text-[10px] font-bold text-stone-800 block leading-tight">
                    Standar Pembayaran Nasional
                  </span>
                  <span className="text-[9px] text-stone-500">
                    Mitra: {item.store_name}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQrisSheetOpen(false)}
                className="p-1 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Matrix Card */}
            <div className="p-3 bg-white rounded-2xl border-2 border-stone-200 shadow-sm flex items-center justify-center">
              <QRCodeSVG
                value={`00020101021226580014ID.CO.NULLWASTED.QRIS|STORE:${item.store_id || "FTUI-001"}|ITEM:${item.id}|AMT:${totalPrice}`}
                size={176}
                level="M"
                includeMargin={true}
              />
            </div>

            {/* Nominal Tagihan & Timer */}
            <div className="w-full space-y-1">
              <span className="text-[11px] text-stone-500 block">Total Tagihan Bersih:</span>
              <span className="text-xl font-black text-emerald-700 font-mono">
                Rp {totalPrice.toLocaleString("id-ID")}
              </span>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold font-mono">
                  ⏱️ Selesaikan dalam {formatCountdown(qrisSecondsLeft)}
                </span>
              </div>
              <p className="text-[10px] text-stone-400 pt-1">
                Buka GoPay, OVO, Dana, BCA Mobile, atau aplikasi e-wallet Anda untuk memindai QRIS di atas.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-2 pt-1">
              <button
                type="button"
                disabled={isConfirmingQris || isReserving}
                onClick={handleConfirmQrisPayment}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50"
              >
                {isConfirmingQris ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi Status Pembayaran QRIS...</span>
                  </>
                ) : (
                  <>
                    <span>Saya Sudah Selesai Bayar via E-Wallet</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsQrisSheetOpen(false)}
                className="w-full py-2 px-3 rounded-xl border border-stone-200 text-stone-600 text-xs font-semibold hover:bg-stone-50 transition"
              >
                Kembali / Ganti Metode Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
