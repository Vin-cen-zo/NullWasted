import React, { useState, useEffect } from "react";
import { ShieldAlert, ShieldCheck, Tag, Lock, ArrowRight, Sparkles, CheckCircle } from "lucide-react";
import { DraftResponse, PublishRequest } from "../types/listing";

interface PreviewCardProps {
  draft: DraftResponse | null;
  onPublish: (payload: PublishRequest) => void;
  isPublishing: boolean;
}

export const PreviewCard: React.FC<PreviewCardProps> = ({
  draft,
  onPublish,
  isPublishing,
}) => {
  if (!draft) return null;

  const [discountPercent, setDiscountPercent] = useState<number>(
    draft.recommended_discount_percent
  );

  // Sync state whenever draft changes
  useEffect(() => {
    setDiscountPercent(draft.recommended_discount_percent);
  }, [draft]);

  // Recalculate discounted price based on active slider position
  const rawCalculatedPrice = draft.original_price * (1.0 - discountPercent / 100.0);
  const activeDiscountedPrice = Math.floor(rawCalculatedPrice / 100) * 100;

  const isSafe = draft.safety_status === "SAFE";
  const similarityPercent = Math.round(draft.similarity_score * 100);

  const handlePublishClick = () => {
    if (!isSafe || !draft.can_publish) return;

    const payload: PublishRequest = {
      food_name: draft.food_name,
      matched_canonical_dish: draft.matched_canonical_dish,
      category: draft.category,
      quantity: draft.quantity,
      original_price: draft.original_price,
      discount_percent: discountPercent,
      discounted_price: activeDiscountedPrice,
      hours_since_cooked: draft.hours_since_cooked,
      bpom_max_hours: draft.bpom_max_hours,
      minutes_until_closing: draft.minutes_until_closing,
      safety_status: draft.safety_status,
      safety_reason: draft.safety_reason,
      hazard_description: draft.hazard_description,
      regulation_ref: draft.regulation_ref,
      similarity_score: draft.similarity_score,
      store_name: "Dapur Barokah",
      location_badge: "Kantin FTUI · 250m (🚶 3 mnt)",
    };

    onPublish(payload);
  };

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm space-y-4 transition-all ${
        isSafe
          ? "bg-[#FFFFFF] border-emerald-200 ring-1 ring-emerald-100"
          : "bg-red-50/50 border-red-300 ring-1 ring-red-100"
      }`}
    >
      {/* Top Meta Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E0D8] pb-3">
        <div className="flex items-center gap-2">
          <span
            className={`p-1.5 rounded-lg ${
              isSafe ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
            }`}
          >
            {isSafe ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          </span>
          <div>
            <h3 className="text-sm font-bold text-[#1F1D1A]">
              1-Tap AI Extraction & Guardrail Preview
            </h3>
            <p className="text-[11px] text-[#6B7280]">
              Parser: <code className="bg-gray-100 px-1 py-0.2 rounded">{draft.extraction_source}</code> · Cosine Match:{" "}
              <span className="font-semibold text-emerald-700">{similarityPercent}% Match</span>
            </p>
          </div>
        </div>

        {/* BPOM Status Badge */}
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${
            isSafe
              ? "bg-[#10B981] text-white"
              : "bg-[#EF4444] text-white animate-pulse"
          }`}
        >
          {isSafe ? <CheckCircle className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          {isSafe ? "BPOM SAFE — Lolos Uji Standar" : "BPOM REJECTED — Bahaya Patogen"}
        </span>
      </div>

      {/* Main Extracted Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#F8F6F0] p-3 rounded-xl border border-[#E5E0D8]">
          <span className="text-[#6B7280] text-[10px] uppercase font-bold block mb-0.5">
            Nama Hidangan
          </span>
          <span className="font-bold text-[#1F1D1A] text-sm block truncate">
            {draft.food_name}
          </span>
          <span className="text-[10px] text-[#6B7280] block truncate">
            Match: {draft.matched_canonical_dish}
          </span>
        </div>

        <div className="bg-[#F8F6F0] p-3 rounded-xl border border-[#E5E0D8]">
          <span className="text-[#6B7280] text-[10px] uppercase font-bold block mb-0.5">
            Kuantitas Porsi
          </span>
          <span className="font-bold text-[#1F1D1A] text-sm block">
            {draft.quantity} Porsi
          </span>
          <span className="text-[10px] text-[#6B7280] block">
            Kategori: {draft.category.replace("_PERISHABILITY", "")}
          </span>
        </div>

        <div className="bg-[#F8F6F0] p-3 rounded-xl border border-[#E5E0D8]">
          <span className="text-[#6B7280] text-[10px] uppercase font-bold block mb-0.5">
            Waktu Simpan
          </span>
          <span
            className={`font-bold text-sm block ${
              isSafe ? "text-emerald-700" : "text-red-700 font-extrabold"
            }`}
          >
            {draft.hours_since_cooked.toFixed(1)} jam
          </span>
          <span className="text-[10px] text-[#6B7280] block">
            Batas Maks BPOM: {draft.bpom_max_hours.toFixed(1)} jam
          </span>
        </div>

        <div className="bg-[#F8F6F0] p-3 rounded-xl border border-[#E5E0D8]">
          <span className="text-[#6B7280] text-[10px] uppercase font-bold block mb-0.5">
            Sisa Waktu Toko
          </span>
          <span className="font-bold text-[#1F1D1A] text-sm block">
            {draft.minutes_until_closing} Menit
          </span>
          <span className="text-[10px] text-[#6B7280] block">
            Closing window active
          </span>
        </div>
      </div>

      {/* BPOM Guardrail Rationale Alert Box */}
      <div
        className={`p-3.5 rounded-xl border text-xs ${
          isSafe
            ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
            : "bg-red-50 border-red-300 text-red-950 font-medium"
        }`}
      >
        <div className="flex items-start gap-2">
          {isSafe ? (
            <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-bold">
              {isSafe ? "Verifikasi Keamanan Pangan BPOM:" : "Peringatan Bahaya Keamanan BPOM:"}
            </p>
            <p className="leading-relaxed">{draft.safety_reason}</p>
            {!isSafe && draft.hazard_description && (
              <p className="text-[11px] text-red-800 bg-red-100/70 p-2 rounded-lg mt-1 border border-red-200">
                <strong>Uji Bahaya Mikrobiologis:</strong> {draft.hazard_description}
              </p>
            )}
            <p className="text-[10px] text-[#6B7280] pt-0.5">
              Rujukan Resmi: {draft.regulation_ref}
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic Pricing Interactive Slider Section */}
      <div className="bg-[#F8F6F0] p-4 rounded-xl border border-[#E5E0D8] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-[#10B981]" />
            <span className="text-xs font-bold text-[#1F1D1A]">
              Dynamic Pricing Engine (Dynamic at Generation, Fixed at Publication)
            </span>
          </div>
          <span className="text-[11px] text-[#6B7280]">
            Rekomendasi AI: <strong>{draft.recommended_discount_percent}%</strong> (Geser untuk ubah 50%–70%)
          </span>
        </div>

        {/* Range Slider */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={50}
            max={70}
            step={1}
            value={discountPercent}
            disabled={!isSafe}
            onChange={(e) => setDiscountPercent(Number(e.target.value))}
            className="w-full accent-[#10B981] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-[10px] text-[#6B7280] font-semibold">
            <span>Batas Bawah 50%</span>
            <span className="text-[#10B981] font-bold text-xs">{discountPercent}% Diskon Terpilih</span>
            <span>Batas Maks 70%</span>
          </div>
        </div>

        {/* Price Comparison Summary */}
        <div className="flex items-center justify-between pt-1 border-t border-[#E5E0D8]">
          <div>
            <span className="text-[10px] text-[#6B7280] block uppercase font-medium">Harga Normal</span>
            <span className="text-xs line-through text-[#6B7280]">
              Rp{draft.original_price.toLocaleString("id-ID")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-[#6B7280]" />
            <div className="text-right">
              <span className="text-[10px] text-emerald-700 block uppercase font-bold">
                Harga Surplus (Diskon {discountPercent}%)
              </span>
              <span className="text-base font-extrabold text-[#10B981]">
                Rp{activeDiscountedPrice.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 1-Tap Publish Button */}
      <div>
        <button
          type="button"
          onClick={handlePublishClick}
          disabled={!isSafe || isPublishing}
          className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm ${
            isSafe
              ? "bg-[#10B981] hover:bg-[#059669] text-white cursor-pointer active:scale-[0.99]"
              : "bg-red-200 text-red-700 cursor-not-allowed border border-red-300"
          }`}
        >
          {isPublishing ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Menerbitkan dan Mengunci Harga...
            </span>
          ) : isSafe ? (
            <>
              <Sparkles className="w-4 h-4" />
              <span>⚡ 1-Tap Terbitkan ke Katalog Aktif (Kunci Harga Rp{activeDiscountedPrice.toLocaleString("id-ID")})</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>🔒 Diblokir oleh Food Safety Guardrail BPOM (Dilarang Terbit)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
