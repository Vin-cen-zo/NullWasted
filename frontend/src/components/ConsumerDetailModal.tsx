import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ItemListing, getFriendlyCategory, humanizeBpomText, resolveImageUrl } from "../types/listing";
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
        className="w-full max-w-xl bg-white rounded-t-[32px] sm:rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[88vh] overflow-y-auto overscroll-contain space-y-4"
      >
        {/* ========================================================================= */}
        {/* STEP 1: ITEM DETAIL & QUANTITY CHECKOUT STEP                              */}
        {/* ========================================================================= */}
        {modalStep === "DETAIL" ? (
          <>
            {/* Top Handle / Close */}
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Badge 1: Diskon (Clean text, no emoji) */}
                <span className="text-[11px] font-black tracking-wider text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300 shadow-xs">
                  {item.discount_percent}% OFF
                </span>

                {/* Badge 2: Kategori Ramah Konsumen (Clean text, no emoji) */}
                {item.is_bundle ? (
                  <span className="text-[11px] font-bold tracking-wide text-purple-900 bg-purple-100 px-2.5 py-1 rounded-full border border-purple-300 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    Mystery Bag
                  </span>
                ) : (
                  <span className="text-[11px] font-bold tracking-wide text-stone-700 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200">
                    {getFriendlyCategory(item.category).label}
                  </span>
                )}

                {item.portion_size && item.portion_size !== "Reguler" && (
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                    Porsi: {item.portion_size}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Food Image Banner (Adaptive presentation: hidden if no image or error) */}
            {(() => {
              const resolvedImg = resolveImageUrl(item.image_url, item.is_bundle);
              if (!resolvedImg || imageError) return null;
              return (
                <div className="relative w-full h-44 sm:h-52 rounded-2xl overflow-hidden bg-stone-100 shadow-xs shrink-0">
                  <img
                    src={resolvedImg}
                    alt={item.food_name}
                    onError={() => setImageError(true)}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"></div>
                  <div className="absolute bottom-2.5 left-3 text-white flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-400" />
                      {item.store_name}
                    </span>
                  </div>
                </div>
              );
            })()}

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
              <p className="text-[11px] text-emerald-950 leading-relaxed">{humanizeBpomText(item.safety_reason)}</p>
              <div className="flex items-center justify-between text-[10px] text-emerald-800/80 pt-1 border-t border-emerald-200">
                <span>
                  Dimasak: {item.hours_since_cooked} jam lalu (Maks: {item.bpom_max_hours} jam)
                </span>
                <span className="font-mono">{item.regulation_ref}</span>
              </div>
            </div>

            {/* Closing Window Counter with Live Synchronized Badge */}
            <div className="flex items-center justify-between text-xs text-amber-900 bg-amber-50/80 px-3 py-2 rounded-xl border border-amber-200">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Batas Penjemputan (Tutup pk {item.closing_time || "20:30"} WIB)</span>
              </div>
              <ClosingCountdownBadge
                closingTime={item.closing_time || "20:30"}
                fallbackMinutes={item.minutes_until_closing}
              />
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
                    className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-bold font-mono min-w-[20px] text-center">{qty}</span>
                  <button
                    type="button"
                    onClick={handleIncrement}
                    disabled={qty >= maxQty}
                    className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Transparent Bill Settlement Sheet */}
            <div className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-2 text-xs">
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
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    paymentMethod === "CASH_ON_PICKUP"
                      ? "bg-emerald-500 border-emerald-500 text-white font-bold shadow-sm"
                      : "bg-white border-stone-200 text-stone-700 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Banknote className={`w-4 h-4 ${paymentMethod === "CASH_ON_PICKUP" ? "text-white" : "text-emerald-600"}`} />
                    <span className="font-bold text-[11px]">Tunai di Kasir</span>
                  </div>
                  <span className={`text-[10px] font-normal ${paymentMethod === "CASH_ON_PICKUP" ? "text-emerald-100" : "text-stone-500"}`}>
                    Cash on Pickup
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("SIMULATED_QRIS")}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    paymentMethod === "SIMULATED_QRIS"
                      ? "bg-emerald-500 border-emerald-500 text-white font-bold shadow-sm"
                      : "bg-white border-stone-200 text-stone-700 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <QrCode className={`w-4 h-4 ${paymentMethod === "SIMULATED_QRIS" ? "text-white" : "text-emerald-600"}`} />
                    <span className="font-bold text-[11px]">QRIS Instan</span>
                  </div>
                  <span className={`text-[10px] font-normal ${paymentMethod === "SIMULATED_QRIS" ? "text-emerald-100" : "text-stone-500"}`}>
                    Pembayaran Digital
                  </span>
                </button>
              </div>
            </div>

            {/* Reserve / Proceed to Payment CTA */}
            <button
              type="button"
              disabled={isReserving || maxQty <= 0}
              onClick={handleMainActionClick}
              className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
                className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Merchant and Item Sub-banner */}
            <div className="bg-stone-50 p-2.5 rounded-2xl border border-stone-200 text-left text-xs">
              <span className="text-[10px] text-stone-500 block">Toko / Gerai Penjual:</span>
              <span className="font-bold text-stone-900 block">{item.store_name}</span>
              <p className="text-[11px] text-stone-600 mt-0.5">
                {qty}x {item.food_name} {item.portion_size && `(${item.portion_size})`}
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
              <span className="text-2xl font-black text-emerald-700 font-mono">
                Rp {totalPrice.toLocaleString("id-ID")}
              </span>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold font-mono">
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
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
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
