import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { OrderTicket } from "../types/listing";
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Ticket,
  MapPin,
  Store,
  XCircle,
  CreditCard,
  Banknote,
} from "lucide-react";

interface ConsumerOrdersScreenProps {
  orders: OrderTicket[];
  customerName: string;
  onCancelOrder?: (orderId: string) => Promise<void>;
  onRefreshOrders?: () => Promise<void> | void;
}

export const ConsumerOrdersScreen: React.FC<ConsumerOrdersScreenProps> = ({
  orders,
  customerName,
  onCancelOrder,
  onRefreshOrders,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const hasActiveReservedTicket = orders.some((o) => o.status === "RESERVED");

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

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
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
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1F1D1A]">Tiket Pesanan Saya</h2>
          <p className="text-xs text-[#6B655B]">
            Konsumen: <span className="font-semibold text-emerald-800">{customerName}</span>
          </p>
        </div>
        {hasActiveReservedTicket && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Sinkronisasi Status Otomatis Aktif
          </span>
        )}
      </div>

      {/* Orders List */}
      {orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-dashed border-[#D8D2C5]">
          <Ticket className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-xs font-bold text-[#1F1D1A]">Belum Ada Tiket Pesanan</p>
          <p className="text-[11px] text-[#6B655B] mt-1 max-w-[220px]">
            Pilih menu makanan surplus dari tab Jelajah untuk menerbitkan tiket pengambilan QR.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((ticket) => {
            const isCompleted = ticket.status === "COMPLETED";
            const isCancelled = ticket.status === "CANCELLED";
            const isPaid = ticket.payment_status === "PAID" || ticket.payment_method === "SIMULATED_QRIS";

            return (
              <div
                key={ticket.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 space-y-3.5 transition-all ${
                  isCancelled
                    ? "border-stone-300 bg-stone-100/60 opacity-80"
                    : isCompleted
                    ? "border-emerald-300 bg-emerald-50/20"
                    : "border-[#E2DDD3]"
                }`}
              >
                {/* Status & Payment Badges Header */}
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Lifecycle Status Badge */}
                    {isCancelled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-stone-700 bg-stone-200 px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3 text-stone-500" />
                        DIBATALKAN — STOK DIKEMBALIKAN
                      </span>
                    ) : isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        COMPLETED — Sudah Diambil
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full animate-pulse">
                        <Clock className="w-3 h-3 text-amber-600" />
                        RESERVED — Siap Diambil
                      </span>
                    )}

                    {/* Payment Status Badge */}
                    {!isCancelled && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isPaid
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        }`}
                      >
                        {isPaid ? (
                          <>
                            <CreditCard className="w-3 h-3 text-emerald-600" />
                            <span>LUNAS (QRIS)</span>
                          </>
                        ) : (
                          <>
                            <Banknote className="w-3 h-3 text-amber-600" />
                            <span>BAYAR TUNAI DI KASIR</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-gray-400 font-mono">
                    {new Date(ticket.created_at).toLocaleTimeString("id-ID")}
                  </span>
                </div>

                {/* Big Unique Order Code Bar */}
                <div className="p-3 bg-[#F8F6F0] rounded-xl flex items-center justify-between border border-[#E8E2D5]">
                  <div>
                    <span className="text-[10px] text-[#6B655B] block font-medium">KODE PENGAMBILAN</span>
                    <span
                      className={`text-lg font-mono font-extrabold tracking-wider ${
                        isCancelled ? "text-stone-400 line-through" : "text-[#1F1D1A]"
                      }`}
                    >
                      {ticket.order_code}
                    </span>
                  </div>
                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={() => handleCopy(ticket.order_code)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#D8D2C5] text-xs font-bold text-emerald-700 hover:bg-gray-50 active:scale-95 transition-all shadow-xs"
                    >
                      {copiedCode === ticket.order_code ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Kode</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* ISO-Standard QR Code Matrix View */}
                {!isCancelled && (
                  <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-gray-100 space-y-2">
                    <QRCodeSVG
                      value={ticket.qr_payload}
                      size={140}
                      level="M"
                      includeMargin={true}
                      bgColor="#FFFFFF"
                      fgColor="#1F1D1A"
                      className="bg-white p-2 rounded-2xl shadow-xs border border-gray-200"
                    />
                    <p className="text-[9px] font-mono text-gray-400 break-all text-center max-w-[280px]">
                      {ticket.qr_payload}
                    </p>
                    <p className="text-[10px] text-center text-[#6B655B]">
                      Tunjukkan QR Code ini ke kasir toko saat mengambil pesanan Anda
                    </p>
                  </div>
                )}

                {/* Order Details */}
                <div className="text-xs space-y-1.5 pt-1 border-t border-gray-100">
                  <div className="flex items-center justify-between font-semibold text-[#1F1D1A]">
                    <span className="flex items-center gap-1">
                      <Store className="w-3.5 h-3.5 text-emerald-600" />
                      {ticket.store_name}
                    </span>
                    <span className="text-emerald-600 font-bold">
                      Rp {ticket.total_price.toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#6B655B]">
                    <span>Menu Makanan:</span>
                    <span className="font-medium text-[#1F1D1A]">
                      {ticket.food_name} ({ticket.quantity} porsi)
                    </span>
                  </div>
                  <div className="flex justify-between text-[#6B655B]">
                    <span>Lokasi Gerai:</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-400" />
                      {ticket.location_badge}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#6B655B]">
                    <span>Batas Pengambilan:</span>
                    <span className="text-amber-700 font-medium">{ticket.pickup_deadline}</span>
                  </div>
                  {ticket.completed_at && (
                    <div className="flex justify-between text-emerald-700 font-medium pt-1 border-t border-dashed border-gray-200">
                      <span>Waktu Serah Terima:</span>
                      <span>{new Date(ticket.completed_at).toLocaleTimeString("id-ID")}</span>
                    </div>
                  )}
                  {ticket.cancelled_at && (
                    <div className="flex justify-between text-stone-500 font-medium pt-1 border-t border-dashed border-stone-200">
                      <span>Waktu Dibatalkan:</span>
                      <span>{new Date(ticket.cancelled_at).toLocaleTimeString("id-ID")}</span>
                    </div>
                  )}
                </div>

                {/* Cancel Order Action Button (Available ONLY if RESERVED) */}
                {ticket.status === "RESERVED" && onCancelOrder && (
                  <div className="pt-2 border-t border-stone-100">
                    <button
                      type="button"
                      disabled={cancellingId === ticket.id}
                      onClick={() => handleCancelClick(ticket.id)}
                      className="w-full py-2 px-3 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>
                        {cancellingId === ticket.id
                          ? "Membatalkan & Mengembalikan Stok..."
                          : "Batalkan Pesanan & Kembalikan Stok"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
