import React, { useState } from "react";
import { OrderTicket } from "../types/listing";
import { QrCode, CheckCircle2, AlertCircle, ArrowRight, User, ShoppingBag } from "lucide-react";

interface MerchantCashierScreenProps {
  orders: OrderTicket[];
  onCompletePickup: (orderCode: string) => Promise<OrderTicket>;
  isVerifying: boolean;
}

export const MerchantCashierScreen: React.FC<MerchantCashierScreenProps> = ({
  orders,
  onCompletePickup,
  isVerifying,
}) => {
  const [inputCode, setInputCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successTicket, setSuccessTicket] = useState<OrderTicket | null>(null);

  const reservedOrders = orders.filter((o) => o.status === "RESERVED");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim() || isVerifying) return;

    setErrorMessage(null);
    setSuccessTicket(null);

    try {
      const ticket = await onCompletePickup(inputCode.trim());
      setSuccessTicket(ticket);
      setInputCode("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal memverifikasi tiket.");
    }
  };

  const handleFillCode = (code: string) => {
    setInputCode(code);
    setErrorMessage(null);
    setSuccessTicket(null);
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
      {/* Visual Scanner Viewfinder Header */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm text-center">
        <div className="relative w-28 h-28 mx-auto mb-3 rounded-2xl border-2 border-dashed border-emerald-500 bg-emerald-50/40 flex flex-col items-center justify-center overflow-hidden">
          <QrCode className="w-12 h-12 text-emerald-600 opacity-80" />
          <div className="absolute inset-x-0 h-0.5 bg-emerald-500 animate-[bounce_2s_infinite]"></div>
        </div>
        <h2 className="text-sm font-bold text-[#1F1D1A]">Kasir Pemindai QR & Kode Tiket</h2>
        <p className="text-xs text-[#6B655B] mt-0.5">
          Verifikasi kode pengambilan pesanan untuk menyelesaikan transaksi
        </p>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm space-y-3">
        <div>
          <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">
            Kode Tiket Pesanan / QR Payload
          </label>
          <input
            type="text"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="Ketik kode (contoh: #NW-4821 atau 4821)"
            className="w-full text-xs font-mono uppercase px-3.5 py-2.5 rounded-xl border border-[#D8D2C5] bg-[#F8F6F0] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
          />
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!inputCode.trim() || isVerifying}
          className={`w-full py-3 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all ${
            !inputCode.trim() || isVerifying
              ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
              : "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-500/20 active:scale-[0.98]"
          }`}
        >
          {isVerifying ? (
            <span>Memverifikasi Kode ke SQLite...</span>
          ) : (
            <>
              <span>Verifikasi & Serah Terima</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Success Confirmation Card */}
      {successTicket && (
        <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-2xl text-emerald-950 space-y-2 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>TRANSAKSI SELESAI (STATUS: COMPLETED)</span>
          </div>

          <div className="text-xs space-y-1 bg-white/70 p-3 rounded-xl border border-emerald-200">
            <div className="flex justify-between">
              <span className="text-[#6B655B]">Kode Tiket:</span>
              <span className="font-mono font-bold text-emerald-800">{successTicket.order_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B655B]">Pembeli:</span>
              <span className="font-semibold text-[#1F1D1A]">{successTicket.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B655B]">Menu & Porsi:</span>
              <span className="font-semibold text-[#1F1D1A]">{successTicket.food_name} ({successTicket.quantity} porsi)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B655B]">Total Tagihan:</span>
              <span className="font-bold text-emerald-600">
                Rp {successTicket.total_price.toLocaleString("id-ID")}
              </span>
            </div>
            {successTicket.completed_at && (
              <div className="flex justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                <span>Diserahterimakan pada:</span>
                <span>{new Date(successTicket.completed_at).toLocaleTimeString("id-ID")}</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-emerald-800 font-medium text-center">
            Pesanan telah berhasil diserahkan kepada konsumen. Stok telah berkurang di sistem.
          </p>
        </div>
      )}

      {/* Pending Queue List */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#1F1D1A] uppercase tracking-wider">
            Antrean Menunggu Pengambilan ({reservedOrders.length})
          </h3>
          <span className="text-[10px] text-gray-400">Status: RESERVED</span>
        </div>

        {reservedOrders.length === 0 ? (
          <p className="text-xs text-[#6B655B] text-center py-4 italic">
            Tidak ada pesanan yang sedang menunggu pengambilan saat ini.
          </p>
        ) : (
          <div className="space-y-2">
            {reservedOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#E8E2D5] flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-emerald-800">{ord.order_code}</span>
                    <span className="text-[10px] text-[#6B655B] flex items-center gap-1">
                      <User className="w-3 h-3 text-gray-400" />
                      {ord.customer_name}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#1F1D1A] font-medium flex items-center gap-1 mt-0.5">
                    <ShoppingBag className="w-3 h-3 text-gray-400" />
                    {ord.food_name} ({ord.quantity} porsi) · Rp {ord.total_price.toLocaleString("id-ID")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleFillCode(ord.order_code)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[10px] font-bold text-emerald-800 transition-colors"
                >
                  Isi ke Kasir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

