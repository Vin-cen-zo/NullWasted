import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ItemListing, cleanLocationBadge, getFriendlyCategory, humanizeBpomText, resolveImageUrl } from "../types/listing";
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
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { ClosingCountdownBadge } from "./ClosingCountdownBadge";

interface ConsumerDetailModalProps {
  item: ItemListing | null;
  onClose: () => void;
  onReserve: (listingId: string, quantity: number, paymentMethod: string) => Promise<void>;
  isReserving: boolean;
}

interface BundleItemDetail {
  food_name: string;
  quantity: number;
  original_price: number;
  ingredients?: string | string[];
  allergen_tags?: string[];
}

export function resolveBundleItemAllergens(
  foodName: string,
  rawIngredients?: string | string[],
  rawTags?: string[]
): { ingredients: string; tags: string[] } {
  let ingStr = "";
  if (Array.isArray(rawIngredients)) {
    ingStr = rawIngredients.join(", ");
  } else if (typeof rawIngredients === "string") {
    ingStr = rawIngredients;
  }

  const nameLower = foodName.toLowerCase();
  const ingLower = ingStr.toLowerCase();

  // Smart culinary inference fallback
  if (!ingStr || ingStr.trim().length === 0) {
    if (nameLower.includes("croissant") || nameLower.includes("roti") || nameLower.includes("pastry") || nameLower.includes("donut") || nameLower.includes("cake")) {
      ingStr = "Tepung terigu, mentega, susu, ragi, telur";
    } else if (nameLower.includes("rendang") || nameLower.includes("gulai") || nameLower.includes("opor") || nameLower.includes("santan")) {
      ingStr = "Daging, santan kelapa murni, cabai, bumbu rempah nusantara";
    } else if (nameLower.includes("bento") || nameLower.includes("ayam") || nameLower.includes("nasi")) {
      ingStr = "Beras, daging ayam segar, kecap kedelai, rempah dapur";
    } else {
      ingStr = "Bahan pangan segar olahan dapur pilihan";
    }
  }

  const tags = new Set<string>();
  if (Array.isArray(rawTags) && rawTags.length > 0) {
    rawTags.forEach((t) => tags.add(t));
  }

  const combined = `${nameLower} ${ingLower} ${ingStr.toLowerCase()}`;
  if (combined.includes("santan") || combined.includes("kelapa")) tags.add("Santan/Kelapa");
  if (combined.includes("susu") || combined.includes("keju") || combined.includes("mentega") || combined.includes("butter") || combined.includes("dairy")) tags.add("Susu/Dairy");
  if (combined.includes("telur")) tags.add("Telur");
  if (combined.includes("terigu") || combined.includes("gandum") || combined.includes("roti") || combined.includes("pastry") || combined.includes("croissant")) tags.add("Gluten/Tepung");
  if (combined.includes("kacang")) tags.add("Kacang");
  if (combined.includes("kedelai") || combined.includes("kecap") || combined.includes("tahu") || combined.includes("tempe")) tags.add("Kedelai");
  if (combined.includes("ikan") || combined.includes("udang") || combined.includes("seafood")) tags.add("Seafood/Ikan");

  return {
    ingredients: ingStr,
    tags: Array.from(tags),
  };
}

export const ConsumerDetailModal: React.FC<ConsumerDetailModalProps> = ({
  item,
  onClose,
  onReserve,
  isReserving,
}) => {
  const [qty, setQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"CASH_ON_PICKUP" | "SIMULATED_QRIS">("CASH_ON_PICKUP");

  // Single-Modal Step Transition (Eliminating nested backdrop stacking)
  const [modalStep, setModalStep] = useState<"DETAIL" | "QRIS">("DETAIL");
  const [qrisSecondsLeft, setQrisSecondsLeft] = useState(900); // 15 minutes
  const [isConfirmingQris, setIsConfirmingQris] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setQty(1);
    setPaymentMethod("CASH_ON_PICKUP");
    setModalStep("DETAIL");
    setIsConfirmingQris(false);
    setQrisSecondsLeft(900);
    setImageError(false);
  }, [item?.id]);

  // Lock background scroll when modal is active
  useEffect(() => {
    if (!item) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [item]);

  // QRIS 15-minute countdown timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (modalStep === "QRIS" && qrisSecondsLeft > 0) {
      timer = setInterval(() => {
        setQrisSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [modalStep, qrisSecondsLeft]);

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

  let bundledList: BundleItemDetail[] = [];
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
      setModalStep("QRIS");
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
      setModalStep("DETAIL");
    } catch (err) {
      console.error("Gagal memproses pembayaran QRIS:", err);
    } finally {
      setIsConfirmingQris(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in overscroll-contain"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[88vh] overflow-y-auto overscroll-contain space-y-4"
      >
        {/* ========================================================================= */}
        {/* STEP 1: ITEM DETAIL & QUANTITY CHECKOUT STEP                              */}
        {/* ========================================================================= */}
        {modalStep === "DETAIL" ? (
          <>
            {/* Top Handle / Close (Figma Food Details_01 Style) */}
            <div className="flex items-center justify-between pb-1 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-10 h-10 rounded-lg bg-[#ECF0F4] text-[#181C2E] hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
                <span className="text-[18px] font-bold text-[#181C2E]">Detail Hidangan</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span className="text-[11px] font-extrabold tracking-wider text-white bg-[#181C2E] px-2.5 py-1 rounded-lg">
                  {item.discount_percent}% OFF
                </span>
                {item.is_bundle ? (
                  <span className="text-[11px] font-bold text-purple-900 bg-purple-100 px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    Mystery Bag
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-[#646982] bg-[#F0F5FA] px-2.5 py-1 rounded-lg">
                    {getFriendlyCategory(item.category).label}
                  </span>
                )}
              </div>
            </div>

            {/* Food Image Banner (Figma 20px rounded) */}
            {(() => {
              const resolvedImg = resolveImageUrl(item.image_url, item.is_bundle);
              if (!resolvedImg || imageError) return null;
              return (
                <div className="relative w-full h-48 sm:h-52 rounded-xl overflow-hidden bg-[#F0ECE9] shrink-0">
                  <img
                    src={resolvedImg}
                    alt={item.food_name}
                    onError={() => setImageError(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
              );
            })()}

            {/* Store Pill & Dish Info */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[#E9E9E9] bg-white text-xs font-semibold text-[#181C2E]">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>{item.store_name}</span>
              </div>

              <h2 className="text-[22px] font-normal text-[#181C2E] leading-snug">{item.food_name}</h2>
              <p className="text-[15px] text-[#646982] leading-relaxed">
                {item.hazard_description || humanizeBpomText(item.safety_reason)}
              </p>
            </div>

            {/* Mystery Bag Items Breakdown with Allergen & Ingredient Transparency */}
            {item.is_bundle && bundledList.length > 0 && (
              <div className="p-3.5 bg-purple-50/80 rounded-2xl border border-purple-200 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-purple-950">
                  <Package className="w-4 h-4 text-purple-600" />
                  <span>Rincian Isi Paket Kejutan & Alergen:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {bundledList.map((b, idx) => {
                    const info = resolveBundleItemAllergens(b.food_name, b.ingredients, b.allergen_tags);

                    return (
                      <div key={idx} className="p-2.5 bg-white rounded-xl border border-purple-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-900 text-[11px]">
                            {b.quantity}x {b.food_name}
                          </span>
                          <span className="text-stone-400 line-through text-[10px]">
                            Rp {(b.original_price * b.quantity).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-500 leading-snug">
                          <strong>Bahan:</strong> {info.ingredients}
                        </p>
                        {info.tags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap pt-0.5">
                            <span className="text-[9px] font-bold text-purple-800">Alergen:</span>
                            {info.tags.map((t) => (
                              <span
                                key={t}
                                className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-300"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-purple-800 italic pt-1 border-t border-purple-200/60 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Periksa alergen di atas sebelum mengonsumsi jika Anda memiliki riwayat alergi.</span>
                </p>
              </div>
            )}

            {/* Location & Map Link */}
            <div className="bg-[#F0F5FA] p-3.5 rounded-xl flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-[#181C2E] truncate">{cleanLocationBadge(item.location_badge)}</p>
                  <p className="text-[13px] text-[#646982]">Self-Pickup sebelum gerai tutup</p>
                </div>
              </div>
              {item.maps_url && (
                <a
                  href={item.maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-white text-[#181C2E] hover:bg-slate-50 shadow-xs flex items-center gap-1.5 text-[13px] font-bold shrink-0"
                >
                  <span>Maps</span>
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                </a>
              )}
            </div>

            {/* BPOM Safety Guarantee Box (Clean neutral surface, no colored stroke) */}
            <div className="bg-[#F0F5FA] p-4 rounded-xl text-sm space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#181C2E]">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Jaminan Keamanan Pangan BPOM</span>
              </div>
              <p className="text-[13px] text-[#646982] leading-relaxed">{humanizeBpomText(item.safety_reason)}</p>
              <div className="flex items-center justify-between gap-2 text-[13px] text-[#646982] pt-2 border-t border-slate-200/80 flex-wrap">
                <span>
                  Dimasak: {item.hours_since_cooked} jam lalu (Maks: {item.bpom_max_hours} jam)
                </span>
                <span className="font-medium text-right">{item.regulation_ref}</span>
              </div>
            </div>

            {/* Closing Window Counter with Live Synchronized Badge */}
            <div className="flex items-center justify-between text-sm text-[#181C2E] bg-[#F0F5FA] px-4 py-3 rounded-xl">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">Batas Penjemputan (Tutup {item.closing_time || "20:30"} WIB)</span>
              </div>
              <ClosingCountdownBadge
                closingTime={item.closing_time || "20:30"}
                fallbackMinutes={item.minutes_until_closing}
                expiresAt={item.expires_at}
              />
            </div>

            {/* Transparent Bill Settlement Sheet */}
            <div className="p-4 rounded-xl bg-white border border-slate-100 shadow-[0_6px_20px_rgba(150,150,154,0.08)] space-y-2.5 text-sm">
              <h4 className="font-bold text-xs text-[#646982] uppercase tracking-wider">
                Ringkasan Tagihan Transparan
              </h4>
              <div className="space-y-1.5 text-[#646982]">
                <div className="flex items-center justify-between">
                  <span>Harga Normal Kumulatif ({qty} porsi)</span>
                  <span className="tabular-nums text-[#A0A5BA] line-through">
                    Rp {originalTotal.toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-emerald-700 font-semibold">
                  <span>Potongan Penyelamatan Pangan ({item.discount_percent}%)</span>
                  <span className="tabular-nums">- Rp {discountSavings.toLocaleString("id-ID")}</span>
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2.5">
              <label className="block text-sm font-bold text-[#181C2E]">Pilih Metode Pembayaran:</label>
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CASH_ON_PICKUP")}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    paymentMethod === "CASH_ON_PICKUP"
                      ? "bg-emerald-500 border-emerald-500 text-white font-bold shadow-sm"
                      : "bg-white border-slate-200 text-[#181C2E] hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className={`w-4 h-4 ${paymentMethod === "CASH_ON_PICKUP" ? "text-white" : "text-emerald-600"}`} />
                    <span className="font-bold text-sm">Tunai di Kasir</span>
                  </div>
                  <span className={`text-[13px] font-normal ${paymentMethod === "CASH_ON_PICKUP" ? "text-emerald-100" : "text-[#646982]"}`}>
                    Cash on Pickup
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("SIMULATED_QRIS")}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    paymentMethod === "SIMULATED_QRIS"
                      ? "bg-emerald-500 border-emerald-500 text-white font-bold shadow-sm"
                      : "bg-white border-slate-200 text-[#181C2E] hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <QrCode className={`w-4 h-4 ${paymentMethod === "SIMULATED_QRIS" ? "text-white" : "text-emerald-600"}`} />
                    <span className="font-bold text-sm">QRIS Instan</span>
                  </div>
                  <span className={`text-[13px] font-normal ${paymentMethod === "SIMULATED_QRIS" ? "text-emerald-100" : "text-[#646982]"}`}>
                    Pembayaran Digital
                  </span>
                </button>
              </div>
            </div>

            {/* Bottom Checkout Panel */}
            <div className="bg-[#F0F5FA] p-4 rounded-xl space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-[13px] font-medium text-[#646982] block">Total Bayar</span>
                  <span className="text-[22px] font-extrabold text-[#181C2E] tracking-tight">
                    Rp {totalPrice.toLocaleString("id-ID")}
                  </span>
                </div>

                {!item.is_bundle && (
                  <div className="flex items-center gap-3 bg-white border border-slate-200 text-[#222222] px-2.5 py-1.5 rounded-lg shadow-2xs">
                    <button
                      type="button"
                      onClick={handleDecrement}
                      disabled={qty <= 1}
                      className="w-7 h-7 rounded-md bg-[#F0F5FA] hover:bg-slate-200 text-[#222222] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                      aria-label="Kurangi porsi"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-bold tabular-nums min-w-[20px] text-center">{qty}</span>
                    <button
                      type="button"
                      onClick={handleIncrement}
                      disabled={qty >= maxQty}
                      className="w-7 h-7 rounded-md bg-[#F0F5FA] hover:bg-slate-200 text-[#222222] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                      aria-label="Tambah porsi"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isReserving || maxQty <= 0}
                onClick={handleMainActionClick}
                className={`w-full h-[52px] px-4 rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isReserving || maxQty <= 0
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-500/25 active:scale-[0.98]"
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
                    <span>Bayar</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>Bayar</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* ========================================================================= */
          /* STEP 2: IN-MODAL SINGLE-CONTAINER QRIS PAYMENT STEP                       */
          /* ========================================================================= */
          <div className="space-y-4 text-center animate-in fade-in duration-200">
            {/* Modal Step Header */}
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <button
                type="button"
                onClick={() => setModalStep("DETAIL")}
                className="flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Ubah Pesanan</span>
              </button>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-red-600 text-white font-black text-[10px] tracking-widest">
                  QRIS
                </span>
                <span className="text-[10px] font-bold text-stone-800">Standar Nasional</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Merchant and Item Sub-banner */}
            <div className="bg-stone-50 p-2.5 rounded-2xl border border-stone-200 text-left text-xs">
              <span className="text-[10px] text-stone-500 block">Toko / Gerai Penjual:</span>
              <span className="font-bold text-stone-900 block">{item.store_name}</span>
              <p className="text-[11px] text-stone-600 mt-0.5">
                {qty}x {item.food_name}
              </p>
            </div>

            {/* QR Matrix Card */}
            <div className="p-3 bg-white rounded-2xl border-2 border-stone-200 shadow-sm flex items-center justify-center mx-auto w-fit">
              <QRCodeSVG
                value={`00020101021226580014ID.CO.NULLWASTED.QRIS|STORE:${item.store_id || "FTUI-001"}|ITEM:${item.id}|AMT:${totalPrice}`}
                size={180}
                level="M"
                includeMargin={true}
              />
            </div>

            {/* Nominal Tagihan & Timer */}
            <div className="w-full space-y-1">
              <span className="text-[11px] text-stone-500 block">Total Tagihan Bersih:</span>
              <span className="text-2xl font-black text-emerald-700 tabular-nums">
                Rp {totalPrice.toLocaleString("id-ID")}
              </span>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Selesaikan dalam {formatCountdown(qrisSecondsLeft)}</span>
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
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
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
                onClick={() => setModalStep("DETAIL")}
                className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-stone-600 text-xs font-semibold hover:bg-stone-50 transition cursor-pointer"
              >
                Kembali / Ganti Metode Pembayaran
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
