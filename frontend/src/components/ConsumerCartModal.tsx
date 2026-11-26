import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CartItem, resolveImageUrl } from "../types/listing";
import { createQrisPayment, fetchPaymentStatus, fetchQrisConfig } from "../services/api";
import {
  X,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Banknote,
  Store,
  ArrowRight,
  QrCode,
  Clock,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";

interface ConsumerCartModalProps {
  isOpen: boolean;
  items: CartItem[];
  onClose: () => void;
  onUpdateQty: (listingId: string, nextQty: number) => void;
  onRemoveItem: (listingId: string) => void;
  onClearCart: () => void;
  onCheckout: (paymentMethod: string) => Promise<void>;
  onQrisPaid?: (orderCode: string) => Promise<void>;
  onRequireLogin?: () => void;
  customerName?: string;
  customerPhone?: string;
  isCheckingOut: boolean;
  isGuest: boolean;
}

export const ConsumerCartModal: React.FC<ConsumerCartModalProps> = ({
  isOpen,
  items,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onCheckout,
  onQrisPaid,
  onRequireLogin,
  customerName = "Konsumen NullWasted",
  customerPhone = "",
  isCheckingOut,
  isGuest,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<"CASH_ON_PICKUP" | "MIDTRANS_QRIS">("CASH_ON_PICKUP");
  const [qrisEnabled, setQrisEnabled] = useState(false);
  const [qrisMode, setQrisMode] = useState<"sandbox" | "production" | "disabled">("disabled");
  const [modalStep, setModalStep] = useState<"CART" | "QRIS">("CART");
  const [isCreatingQris, setIsCreatingQris] = useState(false);
  const [qrisSecondsLeft, setQrisSecondsLeft] = useState(900);
  const [copiedQrisUrl, setCopiedQrisUrl] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qrisData, setQrisData] = useState<{
    orderId: string;
    orderCode: string;
    totalPrice: number;
    storeName: string;
    totalQty: number;
    qrisUrl?: string | null;
    qrisString?: string | null;
    simulatorUrl?: string | null;
  } | null>(null);

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

  useEffect(() => {
    if (!isOpen) {
      setModalStep("CART");
      setQrisData(null);
      setErrorMsg(null);
      setIsCreatingQris(false);
      setQrisSecondsLeft(900);
    }
  }, [isOpen]);

  useEffect(() => {
    if (modalStep !== "QRIS" || !qrisData) return;
    let active = true;
    const poller = setInterval(async () => {
      try {
        const st = await fetchPaymentStatus(qrisData.orderId);
        if (!active) return;
        if (st.payment_status === "PAID") {
          clearInterval(poller);
          setModalStep("CART");
          setQrisData(null);
          if (onQrisPaid) {
            await onQrisPaid(st.order_code);
          }
        } else if (st.status === "CANCELLED") {
          clearInterval(poller);
          setErrorMsg("Tagihan QRIS kedaluwarsa atau dibatalkan. Stok telah dikembalikan.");
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

  useEffect(() => {
    if (modalStep !== "QRIS") return;
    const timer = setInterval(() => {
      setQrisSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [modalStep]);

  if (!isOpen) return null;

  const storeName = items[0]?.listing.store_name || "Gerai Mitra";
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalOriginal = items.reduce((s, i) => s + i.listing.original_price * i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + i.listing.discounted_price * i.quantity, 0);
  const totalSavings = Math.max(0, totalOriginal - totalPrice);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

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

  const handleCheckoutClick = async () => {
    if (isCheckingOut || isCreatingQris) return;
    setErrorMsg(null);
    if (isGuest) {
      if (onRequireLogin) {
        onRequireLogin();
      } else {
        await onCheckout("CASH_ON_PICKUP");
      }
      return;
    }

    if (paymentMethod === "MIDTRANS_QRIS") {
      try {
        setIsCreatingQris(true);
        const res = await createQrisPayment({
          items: items.map((c) => ({ listing_id: c.listing.id, quantity: c.quantity })),
          customer_name: customerName,
          customer_phone: customerPhone,
        });
        setQrisData({
          orderId: res.ticket.id,
          orderCode: res.ticket.order_code,
          totalPrice: res.ticket.total_price ?? totalPrice,
          storeName,
          totalQty,
          qrisUrl: res.qris_url,
          qrisString: res.qris_string,
          simulatorUrl: res.simulator_url,
        });
        setQrisSecondsLeft(900);
        setModalStep("QRIS");
        onClearCart();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gagal membuat tagihan QRIS Midtrans.");
      } finally {
        setIsCreatingQris(false);
      }
    } else {
      await onCheckout("CASH_ON_PICKUP");
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4"
      >
        {modalStep === "QRIS" && qrisData ? (
          <div className="space-y-4 text-center animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 text-xs font-semibold text-[#646982] hover:text-[#181C2E] cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Tutup</span>
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

            <div className="bg-[#F0F5FA] p-2.5 rounded-xl border border-slate-200 text-left text-xs">
              <span className="text-[10px] text-[#646982] block">Toko / Gerai Penjual:</span>
              <span className="font-bold text-[#181C2E] block">{qrisData.storeName}</span>
              <p className="text-[11px] text-[#646982] mt-0.5">
                Keranjang Terpadu ({qrisData.totalQty} porsi · 1 Tiket QR)
              </p>
            </div>

            {(qrisMode === "sandbox" || Boolean(qrisData.simulatorUrl)) && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold">
                <span>Mode Sandbox (Simulasi) · Gunakan Simulator Midtrans, bukan m-banking asli</span>
              </div>
            )}

            <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex items-center justify-center mx-auto w-fit">
              {qrisData.qrisUrl ? (
                <img src={qrisData.qrisUrl} alt="Midtrans QRIS" className="w-48 h-48 object-contain" />
              ) : (
                <QRCodeSVG
                  value={qrisData.qrisString || `MIDTRANS-QRIS:${qrisData.orderCode}`}
                  size={180}
                  level="M"
                  includeMargin={true}
                />
              )}
            </div>

            <div className="w-full space-y-1">
              <span className="text-[11px] text-[#646982] block">
                Total Tagihan ({qrisData.orderCode}):
              </span>
              <span className="text-2xl font-black text-emerald-700 tabular-nums">
                Rp {qrisData.totalPrice.toLocaleString("id-ID")}
              </span>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Selesaikan dalam {formatCountdown(qrisSecondsLeft)}</span>
                </span>
              </div>
              <p className="text-[11px] text-[#646982] pt-1 flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>Menunggu konfirmasi otomatis dari Midtrans...</span>
              </p>
            </div>

            {qrisData.simulatorUrl && (
              <div className="w-full p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-left text-[11px] text-indigo-950 space-y-1">
                <p className="font-bold text-indigo-900">Cara Bayar Cepat (Midtrans Sandbox):</p>
                <ol className="list-decimal list-inside space-y-0.5 text-indigo-900/90">
                  <li>Klik <strong>Salin URL QR &amp; Buka Simulator</strong> di bawah.</li>
                  <li>Tempel (<em>Paste</em>) URL di kolom <strong>QR Code Image URL</strong>.</li>
                  <li>Klik <strong>Scan QR</strong> lalu <strong>Pay</strong> — tiket otomatis lunas dalam 2–3 detik.</li>
                </ol>
              </div>
            )}

            {errorMsg && (
              <div className="w-full p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-center">
                {errorMsg}
              </div>
            )}

            <div className="w-full space-y-2 pt-1">
              {qrisData.simulatorUrl && (
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
              {qrisData.qrisUrl && (
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
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#181C2E]">Keranjang Belanja ({totalQty})</h2>
                  {items.length > 0 && (
                    <p className="text-xs text-[#646982] flex items-center gap-1">
                      <Store className="w-3 h-3 text-emerald-600" />
                      <span>{storeName} (1 Gerai · 1 Tiket QR)</span>
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup keranjang"
                className="w-9 h-9 rounded-lg bg-[#ECF0F4] hover:bg-slate-200 flex items-center justify-center text-[#181C2E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-[#181C2E]">Keranjang Masih Kosong</p>
                <p className="text-xs text-[#646982]">
                  Tambahkan beberapa menu dari 1 gerai yang sama untuk checkout sekaligus dalam 1 tiket QR.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2.5">
                  {items.map(({ listing, quantity }) => {
                    const img = resolveImageUrl(listing.image_url, listing.is_bundle);
                    return (
                      <div
                        key={listing.id}
                        className="p-3 rounded-xl bg-[#F0F5FA] border border-slate-200 flex items-center gap-3"
                      >
                        {img && (
                          <img
                            src={img}
                            alt={listing.food_name}
                            className="w-14 h-14 rounded-lg object-cover shrink-0 bg-white"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#181C2E] truncate">{listing.food_name}</p>
                          <p className="text-xs font-bold text-emerald-700 tabular-nums">
                            Rp {listing.discounted_price.toLocaleString("id-ID")} / porsi
                          </p>
                          <p className="text-[11px] text-[#646982]">Maks tersedia: {listing.quantity} porsi</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(listing.id, quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center cursor-pointer"
                            aria-label="Kurangi"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold tabular-nums w-5 text-center">{quantity}</span>
                          <button
                            type="button"
                            disabled={quantity >= listing.quantity}
                            onClick={() => onUpdateQty(listing.id, quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                            aria-label="Tambah"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(listing.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label="Hapus item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between text-[#646982]">
                    <span>Harga Normal ({totalQty} porsi)</span>
                    <span className="line-through tabular-nums">Rp {totalOriginal.toLocaleString("id-ID")}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Total Hemat Surplus</span>
                    <span className="tabular-nums">- Rp {totalSavings.toLocaleString("id-ID")}</span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-[#181C2E] pt-2 border-t border-slate-200">
                    <span>Total Bayar</span>
                    <span className="text-emerald-600 tabular-nums">Rp {totalPrice.toLocaleString("id-ID")}</span>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#181C2E]">Metode Pembayaran</span>
                    <button
                      type="button"
                      onClick={onClearCart}
                      className="text-red-600 hover:underline font-semibold cursor-pointer"
                    >
                      Kosongkan Keranjang
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("CASH_ON_PICKUP")}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        paymentMethod === "CASH_ON_PICKUP"
                          ? "bg-emerald-50 border-emerald-500 text-emerald-950"
                          : "bg-white border-slate-200 text-[#646982] hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Tunai di Kasir</span>
                      </div>
                      <span className="text-[10px] block mt-0.5 opacity-80">Bayar saat ambil</span>
                    </button>

                    <button
                      type="button"
                      disabled={!qrisEnabled}
                      onClick={() => setPaymentMethod("MIDTRANS_QRIS")}
                      className={`p-3 rounded-xl border text-left transition ${
                        !qrisEnabled
                          ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                          : paymentMethod === "MIDTRANS_QRIS"
                          ? "bg-indigo-50 border-indigo-500 text-indigo-950 cursor-pointer"
                          : "bg-white border-slate-200 text-[#646982] hover:border-slate-300 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <QrCode className={`w-4 h-4 shrink-0 ${qrisEnabled ? "text-indigo-600" : "text-slate-400"}`} />
                        <span>QRIS Midtrans</span>
                      </div>
                      <span className="text-[10px] block mt-0.5 opacity-80">
                        {qrisEnabled ? (qrisMode === "sandbox" ? "Sandbox QRIS" : "Bayar Instan") : "Belum aktif"}
                      </span>
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isCheckingOut || isCreatingQris}
                  onClick={() => void handleCheckoutClick()}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isCheckingOut || isCreatingQris ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isCreatingQris ? "Membuat Tagihan QRIS..." : "Memproses Reservasi Atomik..."}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {isGuest
                          ? "Masuk untuk Checkout Keranjang"
                          : paymentMethod === "MIDTRANS_QRIS"
                          ? `Buat QRIS · Rp ${totalPrice.toLocaleString("id-ID")}`
                          : `Checkout ${totalQty} Porsi · Rp ${totalPrice.toLocaleString("id-ID")}`}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
