import React, { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ItemListing, OrderTicket, cleanLocationBadge, resolveImageUrl } from "../types/listing";
import { parseBackendUtcMs } from "../utils/clock";
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Ticket,
  MapPin,
  XCircle,
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
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const hasActiveReservedTicket = orders.some((o) => o.status === "RESERVED");

  const filteredOrders = orders.filter((o) => {
    if (orderTab === "ONGOING") return o.status === "RESERVED";
    if (orderTab === "HISTORY") return o.status !== "RESERVED";
    return true;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (hasActiveReservedTicket && onRefreshOrders) {
      timer = setInterval(() => {
        onRefreshOrders();
      }, 3500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [hasActiveReservedTicket, onRefreshOrders]);

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
    const confirmed = window.confirm(
      "Apakah Anda yakin ingin membatalkan pesanan ini? Stok makanan akan segera dikembalikan ke katalog gerai."
    );
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
            const isPaid = ticket.payment_status === "PAID" || ticket.payment_method === "SIMULATED_QRIS";

            return (
              <div
                key={ticket.id}
                className={`bg-white rounded-xl border shadow-[0_4px_16px_rgba(15,23,42,0.06)] p-5 space-y-4 transition-all h-full flex flex-col justify-between ${
                  isCancelled
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
                      {isCancelled ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-200 px-2.5 py-0.5 rounded-lg">
                          <XCircle className="w-3 h-3 text-slate-500" />
                          DIBATALKAN
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          SELESAI
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

                  {/* Unique Order Code & Copy */}
                  <div className="p-3 bg-[#F0F5FA] rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#646982] block font-medium">KODE PENGAMBILAN</span>
                      <span
                        className={`text-base font-extrabold tracking-wider tabular-nums ${
                          isCancelled ? "text-slate-400 line-through" : "text-[#181C2E]"
                        }`}
                      >
                        {ticket.order_code}
                      </span>
                    </div>
                    {!isCancelled && (
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

                  {/* ISO-Standard QR Code Matrix View */}
                  {!isCancelled && (
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
                          {isPaid ? "Lunas (QRIS)" : "Tunai di Kasir"}
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
    </div>
  );
};
