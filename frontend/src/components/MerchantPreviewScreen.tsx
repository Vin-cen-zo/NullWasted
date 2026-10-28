import React, { useState } from "react";
import { DraftResponse, PublishRequest } from "../types/listing";
import { ShieldCheck, ShieldAlert, ArrowLeft, Send, Clock, Sparkles } from "lucide-react";

interface MerchantPreviewScreenProps {
  draft: DraftResponse;
  onBack: () => void;
  onPublish: (payload: PublishRequest) => Promise<void>;
  isPublishing: boolean;
  storeName: string;
}

export const MerchantPreviewScreen: React.FC<MerchantPreviewScreenProps> = ({
  draft,
  onBack,
  onPublish,
  isPublishing,
  storeName,
}) => {
  const [discountPercent, setDiscountPercent] = useState<number>(
    draft.recommended_discount_percent || 50
  );

  const calculatedDiscountedPrice = Math.floor(
    (draft.original_price * (1 - discountPercent / 100)) / 100
  ) * 100;

  const isSafe = draft.safety_status === "SAFE";

  const handlePublishClick = async () => {
    if (!isSafe || isPublishing) return;

    const payload: PublishRequest = {
      food_name: draft.food_name,
      matched_canonical_dish: draft.matched_canonical_dish,
      category: draft.category,
      quantity: draft.quantity,
      original_price: draft.original_price,
      discount_percent: discountPercent,
      discounted_price: calculatedDiscountedPrice,
      hours_since_cooked: draft.hours_since_cooked,
      bpom_max_hours: draft.bpom_max_hours,
      minutes_until_closing: draft.minutes_until_closing,
      safety_status: draft.safety_status,
      safety_reason: draft.safety_reason,
      hazard_description: draft.hazard_description,
      regulation_ref: draft.regulation_ref,
      similarity_score: draft.similarity_score,
      store_name: storeName,
      location_badge: "Kantin FTUI · 250m (🚶 3 mnt)",
    };

    await onPublish(payload);
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#6B655B] hover:text-[#1F1D1A] py-1 px-2 rounded-lg bg-white border border-[#E2DDD3]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Ubah Input</span>
        </button>
        <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          Source: {draft.extraction_source}
        </span>
      </div>

      {/* BPOM Safety Audit Card */}
      <div
        className={`p-4 rounded-2xl border shadow-sm ${
          isSafe
            ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
            : "bg-red-50/80 border-red-200 text-red-950"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-xl shrink-0 ${
              isSafe ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
            }`}
          >
            {isSafe ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isSafe ? "bg-emerald-200 text-emerald-900" : "bg-red-200 text-red-900"
                }`}
              >
                {isSafe ? "PASSED BPOM" : "REJECTED BPOM"}
              </span>
              <span className="text-[10px] text-gray-500">
                Vector Match: {Math.round(draft.similarity_score * 100)}%
              </span>
            </div>
            <h3 className="text-sm font-bold mt-1.5">
              {isSafe ? "Lolos Verifikasi Keamanan Pangan" : "Ditolak: Pelanggaran Batas Suhu Ruang"}
            </h3>
            <p className="text-xs mt-1 leading-relaxed opacity-90">{draft.safety_reason}</p>

            <div className="mt-2.5 pt-2 border-t border-black/10 text-[10px] space-y-0.5">
              <div>
                <strong>Dasar Regulasi:</strong> {draft.regulation_ref}
              </div>
              <div className="opacity-80">
                <strong>Analisis Bahaya:</strong> {draft.hazard_description}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Entity Extraction Summary */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-[#1F1D1A] uppercase tracking-wider">
          Rincian Entitas Terdeteksi
        </h4>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#F8F6F0]">
            <span className="text-[10px] text-[#6B655B] block">Nama Makanan</span>
            <span className="font-bold text-[#1F1D1A]">{draft.food_name}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#F8F6F0]">
            <span className="text-[10px] text-[#6B655B] block">Kategori BPOM</span>
            <span className="font-bold text-[#1F1D1A]">{draft.category}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#F8F6F0]">
            <span className="text-[10px] text-[#6B655B] block">Jumlah Porsi</span>
            <span className="font-bold text-[#1F1D1A]">{draft.quantity} Porsi</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#F8F6F0]">
            <span className="text-[10px] text-[#6B655B] block">Waktu Sejak Dimasak</span>
            <span className="font-bold text-[#1F1D1A]">
              {draft.hours_since_cooked} jam / Maks {draft.bpom_max_hours} jam
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#6B655B] pt-1">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Sisa waktu tutup toko: <strong>{draft.minutes_until_closing} menit</strong></span>
        </div>
      </div>

      {/* Dynamic Pricing Interactive Slider */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-[#1F1D1A]">Dynamic Pricing (50% – 70%)</h4>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Diskon: {discountPercent}%
          </span>
        </div>

        <div>
          <input
            type="range"
            min={50}
            max={70}
            step={1}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(Number(e.target.value))}
            className="w-full accent-emerald-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#6B655B] mt-1">
            <span>50% (Awal Window)</span>
            <span>Rekomendasi AI: {draft.recommended_discount_percent}%</span>
            <span>70% (Menjelang Tutup)</span>
          </div>
        </div>

        {/* Pricing Calculation Display */}
        <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-[#6B655B] block">Harga Normal Asli</span>
            <span className="text-xs text-gray-400 line-through">
              Rp {draft.original_price.toLocaleString("id-ID")}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-emerald-800 block">Harga Surplus Terkunci</span>
            <span className="text-base font-extrabold text-emerald-600">
              Rp {calculatedDiscountedPrice.toLocaleString("id-ID")}
            </span>
          </div>
        </div>
      </div>

      {/* Publish Action Button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!isSafe || isPublishing}
          onClick={handlePublishClick}
          className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all ${
            !isSafe
              ? "bg-red-200 text-red-600 cursor-not-allowed shadow-none border border-red-300"
              : isPublishing
              ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
              : "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-500/20 active:scale-[0.98]"
          }`}
        >
          {!isSafe ? (
            <span>🔒 DITOLAK OLEH GUARDRAIL BPOM (TIDAK DAPAT DITERBITKAN)</span>
          ) : isPublishing ? (
            <span>Menerbitkan Listing ke Marketplace...</span>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>1-Tap Terbitkan Listing Resmi</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
