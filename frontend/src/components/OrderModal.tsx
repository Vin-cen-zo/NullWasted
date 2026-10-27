import React from "react";
import { X, CheckCircle2, Clock, MapPin, QrCode } from "lucide-react";
import { OrderTicket } from "../types/listing";

interface OrderModalProps {
  ticket: OrderTicket | null;
  onClose: () => void;
}

// Generates a crisp, deterministic 21x21 QR-like matrix SVG purely in React
const DeterministicQrSvg: React.FC<{ payload: string }> = ({ payload }) => {
  const size = 21;
  const cells: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  // Simple deterministic hash to populate internal data cells
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) & 0xffffffff;
  }

  // Draw 3 corner finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          cells[startY + r][startX + c] = true;
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // Fill pseudo-data cells
  let pseudo = Math.abs(hash);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder pattern zones
      const inTL = r < 8 && c < 8;
      const inTR = r < 8 && c >= size - 8;
      const inBL = r >= size - 8 && c < 8;
      if (!inTL && !inTR && !inBL) {
        pseudo = (pseudo * 1103515245 + 12345) & 0x7fffffff;
        cells[r][c] = (pseudo % 3) === 0;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-48 h-48 bg-white p-2 rounded-xl shadow-inner border border-[#E5E0D8]"
    >
      {cells.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c}
              y={r}
              width={1}
              height={1}
              fill="#1F1D1A"
            />
          ) : null
        )
      )}
    </svg>
  );
};

export const OrderModal: React.FC<OrderModalProps> = ({ ticket, onClose }) => {
  if (!ticket) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#FFFFFF] rounded-3xl border border-[#E5E0D8] max-w-sm w-full p-6 shadow-2xl space-y-4 relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full text-[#6B7280] hover:text-[#1F1D1A] hover:bg-[#F8F6F0] transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#059669] flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#059669] block">
            Pemesanan Berhasil
          </span>
          <h2 className="text-xl font-extrabold text-[#1F1D1A]">
            Digital Pickup Pass
          </h2>
          <p className="text-xs text-[#6B7280]">
            Tunjukkan kode atau QR Pass ini ke kasir toko saat mengambil makanan
          </p>
        </div>

        {/* Big Unique Order Code */}
        <div className="bg-[#F8F6F0] p-3 rounded-2xl border border-dashed border-[#10B981] text-center">
          <span className="text-[10px] uppercase font-bold text-[#6B7280] block mb-0.5">
            Kode Pengambilan Unik
          </span>
          <span className="text-2xl font-black text-[#10B981] tracking-wider block">
            {ticket.order_code}
          </span>
        </div>

        {/* Crisp Deterministic QR Code */}
        <div className="flex flex-col items-center justify-center space-y-1.5 pt-1">
          <DeterministicQrSvg payload={ticket.qr_payload} />
          <div className="flex items-center gap-1 text-[10px] text-[#6B7280] font-mono">
            <QrCode className="w-3 h-3" />
            <span className="truncate max-w-[200px]">{ticket.qr_payload}</span>
          </div>
        </div>

        {/* Order Details list */}
        <div className="bg-[#F8F6F0] p-3 rounded-xl border border-[#E5E0D8] space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-[#6B7280]">Menu Makanan:</span>
            <span className="font-bold text-[#1F1D1A] truncate max-w-[180px]">
              {ticket.food_name}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#6B7280]">Jumlah:</span>
            <span className="font-bold text-[#1F1D1A]">{ticket.quantity} Porsi</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#6B7280]">Total Bayar:</span>
            <span className="font-extrabold text-sm text-[#10B981]">
              Rp{ticket.total_price.toLocaleString("id-ID")}
            </span>
          </div>

          <div className="pt-2 border-t border-[#E5E0D8] space-y-1 text-[11px] text-[#6B7280]">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#10B981] flex-shrink-0" />
              <span className="truncate">{ticket.location_badge}</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-800 font-medium">
              <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span>{ticket.pickup_deadline}</span>
            </div>
          </div>
        </div>

        {/* Done / Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-[#1F1D1A] hover:bg-black text-white transition-all shadow-sm"
        >
          Selesai & Tutup Tiket
        </button>
      </div>
    </div>
  );
};
