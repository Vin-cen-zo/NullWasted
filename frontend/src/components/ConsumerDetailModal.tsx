import React, { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ItemListing, cleanLocationBadge, getFriendlyCategory, humanizeBpomText, resolveImageUrl } from "../types/listing";
import { createQrisPayment, fetchPaymentStatus, fetchQrisConfig } from "../services/api";
import { computeEffectiveSecondsUntilClosing } from "../utils/clock";
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
  ArrowLeft,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { ClosingCountdownBadge } from "./ClosingCountdownBadge";

interface ConsumerDetailModalProps {
  item: ItemListing | null;
  onClose: () => void;
  onReserve: (listingId: string, quantity: number, paymentMethod: string) => Promise<void>;
  onAddToCart?: (item: ItemListing, quantity: number) => void;
  onQrisPaid?: (orderCode: string) => Promise<void>;
  customerName?: string;
  customerPhone?: string;
  isReserving: boolean;
  isGuest?: boolean;
  onRequireLogin?: (item: ItemListing) => void;
  onOpenStoreProfile?: (storeId: string) => void;
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
  onAddToCart,
  onQrisPaid,
  customerName = "Konsumen NullWasted",
  customerPhone = "0812-8899-0011",
  isReserving,
  isGuest = false,
  onRequireLogin,
  onOpenStoreProfile,
}) => {
  const [qty, setQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"CASH_ON_PICKUP" | "MIDTRANS_QRIS">("CASH_ON_PICKUP");
  const [qrisEnabled, setQrisEnabled] = useState(false);
  const [qrisMode, setQrisMode] = useState<"sandbox" | "production" | "disabled">("disabled");
  const [copiedQrisUrl, setCopiedQrisUrl] = useState(false);

  // Real Midtrans Sandbox QRIS state (zero fake confirmation)
  const [modalStep, setModalStep] = useState<"DETAIL" | "QRIS">("DETAIL");
  const [qrisSecondsLeft, setQrisSecondsLeft] = useState(900); // 15 minutes
  const [isCreatingQris, setIsCreatingQris] = useState(false);
  const [qrisData, setQrisData] = useState<{
    orderId: string;
    orderCode: string;
    qrisUrl?: string | null;
    qrisString?: string | null;
    simulatorUrl?: string | null;
  } | null>(null);
  const [imageError, setImageError] = useState(false);
  const [closingError, setClosingError] = useState<string | null>(null);
  const qrisSessionRef = useRef(0);

  useEffect(() => {
    fetchQrisConfig()
      .then((cfg) => {
        setQrisEnabled(Boolean(cfg.qris_enabled));
        setQrisMode(cfg.mode === "production" ? "production" : cfg.qris_enabled ? "sandbox" : "disabled");
      })
      .catch(() => {
        setQrisEnabled(false);
        setQrisMode("disabled");
      });
  }, []);

  const copyQrisUrlToClipboard = async (url?: string | null) => {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedQrisUrl(true);
      window.setTimeout(() => setCopiedQrisUrl(false), 2500);
    } catch {
      // Ignore clipboard permission denial
    }
  };

  useEffect(() => {
    qrisSessionRef.current += 1;
    setQty(1);
    setPaymentMethod("CASH_ON_PICKUP");
    setModalStep("DETAIL");
    setIsCreatingQris(false);
    setQrisData(null);
    setQrisSecondsLeft(900);
    setImageError(false);
    setClosingError(null);
  }, [item?.id]);

  // Poll Midtrans payment status every 3s while on QRIS step
  useEffect(() => {
    if (modalStep !== "QRIS" || !qrisData) return;
    let active = true;
    const poller = setInterval(async () => {
      try {
        const st = await fetchPaymentStatus(qrisData.orderId);
        if (!active) return;
        if (st.payment_status === "PAID") {
          clearInterval(poller);
          setModalStep("DETAIL");
          setQrisData(null);
          if (onQrisPaid) {
            await onQrisPaid(st.order_code);
          }
        } else if (st.status === "CANCELLED") {
          clearInterval(poller);
          setClosingError("Tagihan QRIS kedaluwarsa atau dibatalkan. Stok telah dikembalikan.");
        }
      } catch {
        // ignore transient polling error
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(poller);
    };
  }, [modalStep, qrisData, onQrisPaid]);

  // Invalidate any pending QRIS handshake when modal unmounts
  useEffect(() => {
    return () => {
      qrisSessionRef.current += 1;
    };
  }, []);

  // Lock background scroll & support Escape key when modal is active
  useEffect(() => {
    if (!item) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modalStep === "QRIS") {
          qrisSessionRef.current += 1;
          setModalStep("DETAIL");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [item, modalStep, onClose]);

  // QRIS 15-minute countdown timer (single stable interval per QRIS step)
  useEffect(() => {
    if (modalStep !== "QRIS") return;
    const timer = setInterval(() => {
      setQrisSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [modalStep]);

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

  const safeMapsUrl =
    item.maps_url && /^https?:\/\//i.test(item.maps_url.trim()) ? item.maps_url.trim() : null;

  const isExpiredOrClosed = () =>
    computeEffectiveSecondsUntilClosing(item.closing_time || "20:30", item.expires_at) <= 0;

  const handleMainActionClick = async () => {
    if (isReserving || isCreatingQris) return;
    if (isGuest && onRequireLogin) {
      onRequireLogin(item);
      return;
    }
    if (isExpiredOrClosed()) {
      setClosingError("Maaf, waktu pengambilan atau batas aman hidangan ini baru saja berakhir.");
      return;
    }
    setClosingError(null);
    if (paymentMethod === "MIDTRANS_QRIS") {
      try {
        setIsCreatingQris(true);
        const res = await createQrisPayment({
          listing_id: item.id,
          quantity: qty,
          customer_name: customerName,
          customer_phone: customerPhone,
        });
        setQrisData({
          orderId: res.ticket.id,
          orderCode: res.ticket.order_code,
          qrisUrl: res.qris_url,
          qrisString: res.qris_string,
          simulatorUrl: res.simulator_url,
        });
        setQrisSecondsLeft(900);
        setModalStep("QRIS");
      } catch (err) {
        setClosingError(err instanceof Error ? err.message : "Gagal membuat tagihan QRIS Midtrans.");
      } finally {
        setIsCreatingQris(false);
      }
    } else {
      await onReserve(item.id, qty, "CASH_ON_PICKUP");
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
                <div className="relative w-full h-48 sm:h-52 rounded-xl overflow-hidden bg-[#F0F5FA] shrink-0">
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
              <button
                type="button"
                onClick={() => {
                  if (item.store_id && onOpenStoreProfile) {
                    onClose();
                    onOpenStoreProfile(item.store_id);
                  }
                }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[#E9E9E9] hover:border-emerald-400 bg-white text-xs font-semibold text-[#181C2E] transition-colors cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>{item.store_name}</span>
                {item.store_id && onOpenStoreProfile && (
                  <span className="text-emerald-600 font-bold">&rarr;</span>
                )}
              </button>

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
                          <span className="font-bold text-[#181C2E] text-[11px]">
                            {b.quantity}x {b.food_name}
                          </span>
                          <span className="text-[#A0A5BA] line-through text-[10px]">
                            Rp {(b.original_price * b.quantity).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#646982] leading-snug">
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
              {safeMapsUrl && (
                <a
                  href={safeMapsUrl}
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
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-[0_4px_16px_rgba(15,23,42,0.05)] space-y-2.5 text-sm">
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
              <span className="block text-sm font-bold text-[#181C2E]">Pilih Metode Pembayaran:</span>
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CASH_ON_PICKUP")}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    paymentMethod === "CASH_ON_PICKUP"
                      ? "bg-emerald-600 border-emerald-600 text-white font-bold shadow-sm"
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
                  disabled={!qrisEnabled}
                  onClick={() => setPaymentMethod("MIDTRANS_QRIS")}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    !qrisEnabled
                      ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-75"
                      : paymentMethod === "MIDTRANS_QRIS"
                      ? "bg-emerald-600 border-emerald-600 text-white font-bold shadow-sm cursor-pointer"
                      : "bg-white border-slate-200 text-[#181C2E] hover:border-emerald-300 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <QrCode className={`w-4 h-4 ${paymentMethod === "MIDTRANS_QRIS" ? "text-white" : qrisEnabled ? "text-emerald-600" : "text-slate-400"}`} />
                    <span className="font-bold text-sm">QRIS Midtrans</span>
                  </div>
                  <span className={`text-[12px] font-normal ${paymentMethod === "MIDTRANS_QRIS" ? "text-emerald-100" : "text-[#646982]"}`}>
                    {qrisEnabled ? "Sandbox Live Webhook" : "Belum Aktif (Pakai Tunai)"}
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

              <div className="flex items-center gap-2">
                {onAddToCart && (
                  <button
                    type="button"
                    disabled={isReserving || maxQty <= 0}
                    onClick={() => {
                      if (isExpiredOrClosed()) {
                        setClosingError("Maaf, waktu pengambilan atau batas aman hidangan ini baru saja berakhir.");
                        return;
                      }
                      onAddToCart(item, qty);
                      onClose();
                    }}
                    className="h-[52px] px-4 rounded-xl border border-emerald-600 bg-white hover:bg-emerald-50 text-emerald-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Keranjang</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={isReserving || maxQty <= 0}
                  onClick={handleMainActionClick}
                  className={`flex-1 h-[52px] px-4 rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isReserving || maxQty <= 0
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25 active:scale-[0.98]"
                  }`}
                >
                  {isReserving || isCreatingQris ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : paymentMethod === "MIDTRANS_QRIS" ? (
                    <>
                      <QrCode className="w-4 h-4" />
                      <span>Buat QRIS</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>Pesan Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ========================================================================= */
          /* STEP 2: IN-MODAL SINGLE-CONTAINER QRIS PAYMENT STEP                       */
          /* ========================================================================= */
          <div className="space-y-4 text-center animate-in fade-in duration-200">
            {/* Modal Step Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
              <button
                type="button"
                onClick={() => setModalStep("DETAIL")}
                className="flex items-center gap-1 text-xs font-semibold text-[#646982] hover:text-[#181C2E] cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Ubah Pesanan</span>
              </button>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-red-600 text-white font-black text-[10px] tracking-widest">
                  QRIS
                </span>
                <span className="text-[10px] font-bold text-[#181C2E]">Standar Nasional</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup modal QRIS"
                className="p-1.5 rounded-lg text-[#646982] hover:text-[#181C2E] hover:bg-[#F0F5FA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Merchant and Item Sub-banner */}
            <div className="bg-[#F0F5FA] p-2.5 rounded-xl border border-slate-200 text-left text-xs">
              <span className="text-[10px] text-[#646982] block">Toko / Gerai Penjual:</span>
              <span className="font-bold text-[#181C2E] block">{item.store_name}</span>
              <p className="text-[11px] text-[#646982] mt-0.5">
                {qty}x {item.food_name}
              </p>
            </div>

            {/* Sandbox Notice Badge */}
            {(qrisMode === "sandbox" || Boolean(qrisData?.simulatorUrl)) && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold">
                <span>Mode Sandbox (Simulasi) · Gunakan Simulator Midtrans, bukan m-banking asli</span>
              </div>
            )}

            {/* QR Matrix Card (Real Midtrans Sandbox QRIS) */}
            <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex items-center justify-center mx-auto w-fit">
              {qrisData?.qrisUrl ? (
                <img src={qrisData.qrisUrl} alt="Midtrans QRIS" className="w-48 h-48 object-contain" />
              ) : (
                <QRCodeSVG
                  value={qrisData?.qrisString || `MIDTRANS-QRIS:${qrisData?.orderCode || item.id}`}
                  size={180}
                  level="M"
                  includeMargin={true}
                />
              )}
            </div>

            {/* Nominal Tagihan & Timer */}
            <div className="w-full space-y-1">
              <span className="text-[11px] text-[#646982] block">
                Total Tagihan ({qrisData?.orderCode || "QRIS"}):
              </span>
              <span className="text-2xl font-black text-emerald-700 tabular-nums">
                Rp {totalPrice.toLocaleString("id-ID")}
              </span>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Selesaikan dalam {formatCountdown(qrisSecondsLeft)}</span>
                </span>
              </div>
              <p className="text-[11px] text-[#646982] pt-1 flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>Menunggu konfirmasi otomatis dari Midtrans Webhook...</span>
              </p>
            </div>

            {/* 3-Step Sandbox Payment Guide */}
            {qrisData?.simulatorUrl && (
              <div className="w-full p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-left text-[11px] text-indigo-950 space-y-1">
                <p className="font-bold text-indigo-900">Cara Bayar Cepat (Midtrans Sandbox):</p>
                <ol className="list-decimal list-inside space-y-0.5 text-indigo-900/90">
                  <li>Klik <strong>Salin URL QR &amp; Buka Simulator</strong> di bawah.</li>
                  <li>Tempel (<em>Paste</em>) URL di kolom <strong>QR Code Image URL</strong>.</li>
                  <li>Klik <strong>Scan QR</strong> lalu <strong>Pay</strong> — tiket otomatis lunas dalam 2–3 detik.</li>
                </ol>
              </div>
            )}

            {closingError && (
              <div className="w-full p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-center">
                {closingError}
              </div>
            )}

            <div className="w-full space-y-2 pt-1">
              {qrisData?.simulatorUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    await copyQrisUrlToClipboard(qrisData.qrisUrl);
                    window.open(qrisData.simulatorUrl!, "_blank", "noopener,noreferrer");
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-[#181C2E] hover:bg-[#252a44] text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {copiedQrisUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copiedQrisUrl
                      ? "URL QR Tersalin! Simulator Dibuka"
                      : "Salin URL QR & Buka Simulator Midtrans"}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              {qrisData?.qrisUrl && (
                <button
                  type="button"
                  onClick={() => void copyQrisUrlToClipboard(qrisData.qrisUrl)}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-[#181C2E] text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {copiedQrisUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">URL QR Berhasil Disalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Salin URL QR Saja</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-3 rounded-xl bg-[#F0F5FA] hover:bg-slate-200/70 text-[#181C2E] text-xs font-bold transition cursor-pointer"
              >
                Tutup (Lanjutkan Bayar di Pesanan Saya)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
