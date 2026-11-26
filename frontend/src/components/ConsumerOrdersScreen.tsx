import React, { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ItemListing, OrderTicket, cleanLocationBadge, resolveImageUrl } from "../types/listing";
import { fetchPaymentStatus, fetchQrisConfig } from "../services/api";
import { getEffectiveNow, parseBackendUtcMs } from "../utils/clock";
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Ticket,
  MapPin,
  XCircle,
  QrCode,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";

interface ConsumerOrdersScreenProps {
  orders: OrderTicket[];
  listings?: ItemListing[];
  customerName: string;
  onCancelOrder?: (orderId: string) => Promise<void>;
  onRefreshOrders?: () => Promise<void> | void;
}

function resolveOrderThumbnail(
  ticket: OrderTicket,
  listings?: ItemListing[]
): string {
  const direct = resolveImageUrl(ticket.image_url);
  if (direct) return direct;

  if (listings && listings.length > 0) {
    const matched =
      listings.find((l) => l.id === ticket.listing_id) ||
      listings.find((l) => l.food_name.toLowerCase() === ticket.food_name.toLowerCase());
    if (matched) {
      const fromListing = resolveImageUrl(matched.image_url, matched.is_bundle);
      if (fromListing) return fromListing;
    }
  }

  const name = (ticket.food_name || "").toLowerCase();
  if (name.includes("mystery") || name.includes("bundle")) return "/assets/foods/mystery_bag.jpg";
  if (name.includes("donat")) return "/assets/foods/donat_klasik.jpg";
  if (name.includes("pisang")) return "/assets/foods/pisang_bakar.jpg";
  if (name.includes("croissant")) return "/assets/foods/croissant.jpg";
  if (name.includes("ayam") || name.includes("bakar")) return "/assets/foods/ayam_bakar.jpg";
  if (name.includes("tahu") || name.includes("bacem") || name.includes("tempe")) return "/assets/foods/tahu_tempe.jpg";
  if (name.includes("rendang")) return "/assets/foods/rendang.jpg";
  if (name.includes("kopi") || name.includes("susu")) return "/assets/foods/kopi_susu.jpg";
  if (name.includes("mie") || name.includes("indomie")) return "/assets/foods/indomie.jpg";
  if (name.includes("roti") || name.includes("unyil") || name.includes("pastry") || name.includes("bolu")) return "/assets/foods/roti_unyil.jpg";
  return "/assets/foods/default_food.jpg";
}

export const ConsumerOrdersScreen: React.FC<ConsumerOrdersScreenProps> = ({
  orders,
  listings,
  customerName,
  onCancelOrder,
  onRefreshOrders,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [orderTab, setOrderTab] = useState<"ALL" | "ONGOING" | "HISTORY">("ALL");
  const [activeQrisTicketId, setActiveQrisTicketId] = useState<string | null>(null);
  const [simulatorUrl, setSimulatorUrl] = useState<string | null>(null);
  const [copiedQrisUrl, setCopiedQrisUrl] = useState(false);
  const [nowTickMs, setNowTickMs] = useState(() => getEffectiveNow().getTime());
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchQrisConfig()
      .then((cfg) => setSimulatorUrl(cfg.simulator_url || null))
      .catch(() => setSimulatorUrl(null));
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const activeQrisTicket = activeQrisTicketId
    ? orders.find((o) => o.id === activeQrisTicketId) || null
    : null;

  useEffect(() => {
    if (!activeQrisTicketId) return;
    if (
      !activeQrisTicket ||
      activeQrisTicket.status !== "RESERVED" ||
      activeQrisTicket.payment_status === "PAID"
    ) {
      setActiveQrisTicketId(null);
      return;
    }
    setNowTickMs(getEffectiveNow().getTime());
    const tick = setInterval(() => setNowTickMs(getEffectiveNow().getTime()), 1000);
    return () => clearInterval(tick);
  }, [activeQrisTicketId, activeQrisTicket]);

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

  const formatCountdown = (sec: number) => {
    const safe = Math.max(0, sec);
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const hasActiveReservedTicket = orders.some((o) => o.status === "RESERVED");

  const filteredOrders = orders.filter((o) => {
    if (orderTab === "ONGOING") return o.status === "RESERVED";
    if (orderTab === "HISTORY") return o.status !== "RESERVED";
    return true;
  });

  const pendingQrisIdsKey = orders
    .filter(
      (o) =>
        o.status === "RESERVED" &&
        o.payment_method === "MIDTRANS_QRIS" &&
        o.payment_status === "PENDING"
    )
    .map((o) => o.id)
    .join(",");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (hasActiveReservedTicket && onRefreshOrders) {
      timer = setInterval(async () => {
        if (pendingQrisIdsKey) {
          const ids = pendingQrisIdsKey.split(",").filter(Boolean);
          await Promise.allSettled(ids.map((id) => fetchPaymentStatus(id)));
        }
        await onRefreshOrders();
      }, 3500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [hasActiveReservedTicket, onRefreshOrders, pendingQrisIdsKey]);

  const handleCopy = async (code: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedCode(code);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Ignore clipboard permission denial
    }
  };

  const handleCancelClick = async (orderId: string) => {
    if (!onCancelOrder || cancellingId) return;
    const targetTicket = orders.find((o) => o.id === orderId);
    const isPaidQris = targetTicket?.payment_status === "PAID";
    const confirmMsg = isPaidQris
      ? `PERINGATAN: Pesanan ${targetTicket.order_code} sudah LUNAS via QRIS (Rp ${targetTicket.total_price.toLocaleString("id-ID")}). Membatalkan pesanan ini akan menandai status pembayaran sebagai REFUNDED dan mengembalikan stok ke katalog gerai. Lanjutkan?`
      : "Apakah Anda yakin ingin membatalkan pesanan ini? Stok makanan akan segera dikembalikan ke katalog gerai.";
    const confirmed = window.confirm(confirmMsg);
    if (!confirmed) return;

    try {
      setCancellingId(orderId);
      await onCancelOrder(orderId);
    } catch (err: unknown) {
      console.error("Gagal membatalkan pesanan:", err);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-bold text-[#181C2E]">Pesanan Saya</h2>
          <p className="text-xs text-[#646982]">
            Konsumen: <span className="font-semibold text-[#181C2E]">{customerName}</span>
          </p>
        </div>
        {hasActiveReservedTicket && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Sinkronisasi Otomatis
          </span>
        )}
      </div>

      {/* Figma My Orders_01 Underline Tabs */}
      <div className="flex border-b border-[#EEF2F6]">
        {(
          [
            { key: "ALL", label: `Semua (${orders.length})` },
            { key: "ONGOING", label: `Aktif (${orders.filter((o) => o.status === "RESERVED").length})` },
            { key: "HISTORY", label: `Riwayat (${orders.filter((o) => o.status !== "RESERVED").length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setOrderTab(tab.key)}
            className={`flex-1 pb-3 text-[13px] font-bold transition-all cursor-pointer border-b-2 ${
              orderTab === tab.key
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-[#A5A7B9] hover:text-[#181C2E]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-[#F6F6F6] rounded-xl">
          <Ticket className="w-10 h-10 text-[#A0A5BA] mb-2.5" />
          <p className="text-sm font-bold text-[#181C2E]">Belum Ada Tiket Pesanan</p>
          <p className="text-xs text-[#646982] mt-1 max-w-[240px]">
            Pilih menu makanan surplus dari tab Jelajah untuk menerbitkan tiket pengambilan QR.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {filteredOrders.map((ticket) => {
            const isCompleted = ticket.status === "COMPLETED";
            const isCancelled = ticket.status === "CANCELLED";
            const isExpired = ticket.status === "EXPIRED";
            const isClosedTicket = isCancelled || isExpired;
            const isPaid = ticket.payment_status === "PAID" || ticket.payment_method === "SIMULATED_QRIS";
            const isPendingQris =
              ticket.status === "RESERVED" &&
              ticket.payment_method === "MIDTRANS_QRIS" &&
              ticket.payment_status === "PENDING";

            return (
              <div
                key={ticket.id}
                className={`bg-white rounded-xl border shadow-[0_4px_16px_rgba(15,23,42,0.06)] p-5 space-y-4 transition-all h-full flex flex-col justify-between ${
                  isClosedTicket
                    ? "border-slate-200 bg-slate-50/70 opacity-80"
                    : isCompleted
                    ? "border-emerald-300"
                    : "border-slate-300/80"
                }`}
              >
                <div className="space-y-4">
                  {/* Status & Payment Badges Header */}
                  <div className="flex items-center justify-between flex-wrap gap-1.5 pb-3 border-b border-[#EEF2F6]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isExpired ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-lg">
                          <Clock className="w-3 h-3 text-rose-600" />
                          KEDALUWARSA
                        </span>
                      ) : isCancelled ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-200 px-2.5 py-0.5 rounded-lg">
                          <XCircle className="w-3 h-3 text-slate-500" />
                          DIBATALKAN
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          SELESAI
                        </span>
                      ) : isPendingQris ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-lg">
                          <QrCode className="w-3 h-3 text-indigo-600" />
                          MENUNGGU BAYAR QRIS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-lg">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          SIAP DIAMBIL
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-[#6B6E82] underline font-medium">
                      {ticket.order_code}
                    </span>
                  </div>

                  {/* Order Item Embed Card (40% Left Food Photo + 60% Details, matching Map Modal) */}
                  <div className="rounded-xl overflow-hidden bg-[#F0F5FA] flex items-stretch min-h-[104px]">
                    <div className="w-[40%] shrink-0 bg-[#E2E8F0] relative overflow-hidden">
                      <img
                        src={resolveOrderThumbnail(ticket, listings)}
                        alt={ticket.food_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/assets/foods/default_food.jpg";
                        }}
                      />
                    </div>
                    <div className="flex-1 p-3.5 flex flex-col justify-between gap-1.5 min-w-0">
                      <div>
                        <h3 className="text-[15px] font-normal text-[#222222] leading-snug line-clamp-1">
                          {ticket.food_name}
                        </h3>
                        <p className="text-[13px] text-[#646982] line-clamp-1 mt-0.5">
                          {ticket.store_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm pt-1">
                        <span className="font-bold text-emerald-600 tabular-nums">
                          Rp {ticket.total_price.toLocaleString("id-ID")}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="text-xs font-medium text-[#646982]">
                          {ticket.quantity} Porsi
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Item Cart Breakdown (if ticket was created from Cart) */}
                  {(() => {
                    if (!ticket.items_json) return null;
                    try {
                      const parsed = JSON.parse(ticket.items_json) as Array<{
                        food_name: string;
                        quantity: number;
                        subtotal: number;
                      }>;
                      if (!Array.isArray(parsed) || parsed.length <= 1) return null;
                      return (
                        <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs space-y-1">
                          <span className="font-bold text-emerald-900 block">Rincian Keranjang ({parsed.length} menu):</span>
                          {parsed.map((ci, idx) => (
                            <div key={idx} className="flex justify-between text-[#32343E]">
                              <span className="truncate pr-2">{ci.quantity}x {ci.food_name}</span>
                              <span className="font-semibold tabular-nums shrink-0">Rp {ci.subtotal.toLocaleString("id-ID")}</span>
                            </div>
                          ))}
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  })()}

                  {/* Unique Order Code & Copy */}
                  <div className="p-3 bg-[#F0F5FA] rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#646982] block font-medium">KODE PENGAMBILAN</span>
                      <span
                        className={`text-base font-extrabold tracking-wider tabular-nums ${
                          isClosedTicket ? "text-slate-400 line-through" : "text-[#181C2E]"
                        }`}
                      >
                        {ticket.order_code}
                      </span>
                    </div>
                    {!isClosedTicket && (
                      <button
                        type="button"
                        onClick={() => handleCopy(ticket.order_code)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-xs font-bold text-[#181C2E] hover:bg-slate-50 active:scale-95 transition-all shadow-xs cursor-pointer"
                      >
                        {copiedCode === ticket.order_code ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* ISO-Standard QR Code Matrix View OR Resume Pending QRIS CTA */}
                  {!isClosedTicket && isPendingQris && (
                    <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-2.5 text-center">
                      <p className="text-xs font-semibold text-indigo-950">
                        Selesaikan pembayaran QRIS agar tiket pengambilan aktif.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCopiedQrisUrl(false);
                          setActiveQrisTicketId(ticket.id);
                        }}
                        className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Lanjutkan Bayar QRIS</span>
                      </button>
                    </div>
                  )}

                  {!isClosedTicket && !isPendingQris && (
                    <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                      <QRCodeSVG
                        value={ticket.qr_payload}
                        size={140}
                        level="M"
                        includeMargin={true}
                        bgColor="#FFFFFF"
                        fgColor="#181C2E"
                      />
                      <p className="text-xs text-center text-[#646982]">
                        Tunjukkan QR Code ini ke kasir toko saat mengambil pesanan
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-auto space-y-3 pt-2">
                  <div className="text-xs space-y-1.5 pt-2 border-t border-[#EEF2F6]">
                    {!isCancelled && (
                      <div className="flex justify-between text-[#646982]">
                        <span>Metode Pembayaran</span>
                        <span className="font-medium text-[#222222]">
                          {isPaid
                            ? "Lunas (QRIS)"
                            : isPendingQris
                            ? "Menunggu Bayar (QRIS)"
                            : "Tunai di Kasir"}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-[#646982]">
                      <span>Lokasi Gerai</span>
                      <span className="flex items-center gap-1 text-[#181C2E] font-medium">
                        <MapPin className="w-3 h-3 text-emerald-600" />
                        {cleanLocationBadge(ticket.location_badge)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#646982]">
                      <span>Batas Pengambilan</span>
                      <span className="text-amber-700 font-semibold">{ticket.pickup_deadline}</span>
                    </div>
                    {ticket.completed_at && (
                      <div className="flex justify-between text-emerald-700 font-medium pt-1 border-t border-dashed border-slate-200">
                        <span>Waktu Serah Terima</span>
                        <span>{new Date(parseBackendUtcMs(ticket.completed_at)).toLocaleTimeString("id-ID")}</span>
                      </div>
                    )}
                    {ticket.cancelled_at && (
                      <div className="flex justify-between text-slate-500 font-medium pt-1 border-t border-dashed border-slate-200">
                        <span>Waktu Dibatalkan</span>
                        <span>{new Date(parseBackendUtcMs(ticket.cancelled_at)).toLocaleTimeString("id-ID")}</span>
                      </div>
                    )}
                  </div>

                  {/* Cancel Order Action Button */}
                  {ticket.status === "RESERVED" && onCancelOrder && (
                    <button
                      type="button"
                      disabled={cancellingId === ticket.id}
                      onClick={() => handleCancelClick(ticket.id)}
                      className="w-full py-2.5 px-3 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-[13px] font-bold transition flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>
                        {cancellingId === ticket.id
                          ? "Membatalkan & Mengembalikan Stok..."
                          : "Batalkan Pesanan & Kembalikan Stok"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resume Pending Midtrans QRIS Modal */}
      {activeQrisTicket && (
        <div
          onClick={() => setActiveQrisTicketId(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 text-center"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-red-600 text-white font-black text-[10px] tracking-widest">
                  QRIS
                </span>
                <span className="text-xs font-bold text-[#181C2E]">
                  Lanjutkan Bayar {activeQrisTicket.order_code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveQrisTicketId(null)}
                aria-label="Tutup modal lanjut bayar QRIS"
                className="p-1.5 rounded-lg text-[#646982] hover:text-[#181C2E] hover:bg-[#F0F5FA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {simulatorUrl && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold">
                <span>Mode Sandbox (Simulasi) · Gunakan Simulator Midtrans, bukan m-banking asli</span>
              </div>
            )}

            <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex items-center justify-center mx-auto w-fit">
              {activeQrisTicket.qris_url ? (
                <img
                  src={activeQrisTicket.qris_url}
                  alt="Midtrans QRIS"
                  className="w-48 h-48 object-contain"
                />
              ) : (
                <QRCodeSVG
                  value={activeQrisTicket.qris_string || activeQrisTicket.qr_payload}
                  size={180}
                  level="M"
                  includeMargin={true}
                />
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-[#646982] block">
                {activeQrisTicket.store_name} · {activeQrisTicket.food_name}
              </span>
              <span className="text-2xl font-black text-emerald-700 tabular-nums">
                Rp {activeQrisTicket.total_price.toLocaleString("id-ID")}
              </span>
              {activeQrisTicket.payment_expires_at && (
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>
                      Sisa waktu{" "}
                      {formatCountdown(
                        Math.floor(
                          (parseBackendUtcMs(activeQrisTicket.payment_expires_at) - nowTickMs) / 1000
                        )
                      )}
                    </span>
                  </span>
                </div>
              )}
              <p className="text-[11px] text-[#646982] pt-1 flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>Menunggu konfirmasi otomatis dari Midtrans Webhook...</span>
              </p>
            </div>

            {simulatorUrl && (
              <div className="w-full p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-left text-[11px] text-indigo-950 space-y-1">
                <p className="font-bold text-indigo-900">Cara Bayar Cepat (Midtrans Sandbox):</p>
                <ol className="list-decimal list-inside space-y-0.5 text-indigo-900/90">
                  <li>Klik <strong>Salin URL QR &amp; Buka Simulator</strong> di bawah.</li>
                  <li>Tempel (<em>Paste</em>) URL di kolom <strong>QR Code Image URL</strong>.</li>
                  <li>Klik <strong>Scan QR</strong> lalu <strong>Pay</strong> — tiket otomatis lunas dalam 2–3 detik.</li>
                </ol>
              </div>
            )}

            <div className="w-full space-y-2 pt-1">
              {simulatorUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    await copyQrisUrlToClipboard(activeQrisTicket.qris_url);
                    window.open(simulatorUrl, "_blank", "noopener,noreferrer");
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-[#181C2E] hover:bg-[#252a44] text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {copiedQrisUrl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedQrisUrl
                      ? "URL QR Tersalin! Simulator Dibuka"
                      : "Salin URL QR & Buka Simulator Midtrans"}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              {activeQrisTicket.qris_url && (
                <button
                  type="button"
                  onClick={() => void copyQrisUrlToClipboard(activeQrisTicket.qris_url)}
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
                onClick={() => setActiveQrisTicketId(null)}
                className="w-full py-2.5 px-3 rounded-xl bg-[#F0F5FA] hover:bg-slate-200/70 text-[#181C2E] text-xs font-bold transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
