import React, { useState } from "react";
import { DraftResponse, PublishRequest, getFriendlyCategory, humanizeBpomText } from "../types/listing";
import {
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Send,
  Clock,
  Sparkles,
  BookOpen,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { createStoreMenuItem } from "../services/api";

interface MerchantPreviewScreenProps {
  draft: DraftResponse;
  onBack: () => void;
  onPublish: (payload: PublishRequest) => Promise<void>;
  isPublishing: boolean;
  storeName: string;
  storeId?: string;
}

export const MerchantPreviewScreen: React.FC<MerchantPreviewScreenProps> = ({
  draft,
  onBack,
  onPublish,
  isPublishing,
  storeName,
  storeId = "FTUI-001",
}) => {
  // Interactive editable fields (Human-in-the-Loop)
  const [foodName, setFoodName] = useState(draft.food_name);
  const [quantity, setQuantity] = useState<number>(draft.quantity || 1);
  const [originalPrice, setOriginalPrice] = useState<number>(draft.original_price || 20000);
  const [discountPercent, setDiscountPercent] = useState<number>(
    draft.recommended_discount_percent || 50
  );

  // Catalog saving state
  const [isSavingToCatalog, setIsSavingToCatalog] = useState(false);
  const [savedToCatalog, setSavedToCatalog] = useState(false);

  const calculatedDiscountedPrice = Math.floor(
    (originalPrice * (1 - discountPercent / 100)) / 100
  ) * 100;

  const isSafe = draft.safety_status === "SAFE";

  const handleSaveToCatalog = async () => {
    // Hardening: strictly prevent spoiled / rejected items from entering catalog
    if (!isSafe || !draft.can_publish || isSavingToCatalog || savedToCatalog) return;
    try {
      setIsSavingToCatalog(true);
      await createStoreMenuItem(storeId, {
        food_name: foodName.trim() || draft.food_name,
        original_price: Math.max(1000, Math.min(2000000, originalPrice)),
        typical_cooking_time: "16:00",
        default_hours_cooked: draft.hours_since_cooked || 2.0,
        portion_size: draft.portion_size || "Reguler",
      });
      setSavedToCatalog(true);
    } catch (err: unknown) {
      console.error("Gagal menyimpan ke buku menu:", err);
    } finally {
      setIsSavingToCatalog(false);
    }
  };

  const handlePublishClick = async () => {
    if (!isSafe || !draft.can_publish || isPublishing) return;

    const payload: PublishRequest = {
      store_id: storeId,
      food_name: foodName.trim() || draft.food_name,
      matched_canonical_dish: draft.matched_canonical_dish,
      category: draft.category,
      quantity: Math.max(1, Math.min(200, quantity)),
      original_price: Math.max(1000, Math.min(2000000, originalPrice)),
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
      location_badge: "Kantin FTUI · 250m (3 mnt)",
      closing_time: draft.closing_time || "20:30",
      portion_size: draft.portion_size || "Reguler",
    };

    await onPublish(payload);
  };

  // Status badge resolver
  const renderCatalogBadge = () => {
    switch (draft.catalog_match_status) {
      case "MATCHED_CATALOG":
        return (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Terhubung ke Buku Menu Gerai</span>
          </span>
        );
      case "MATCHED_WITH_OVERRIDE":
        return (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300">
            <Clock className="w-3.5 h-3.5" />
            <span>Waktu Masak Diperbarui dari Suara/Teks</span>
          </span>
        );
      case "ADHOC_NEEDS_PRICE":
        return (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Menu Ad-Hoc: Lengkapi Harga Normal</span>
          </span>
        );
      case "ADHOC_COMPLETE":
      default:
        return (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full border border-blue-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Menu Ad-Hoc Lengkap</span>
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full space-y-4">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#6B655B] hover:text-[#1F1D1A] py-1 px-2.5 rounded-lg bg-white border border-[#E2DDD3] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Ubah Input</span>
        </button>
        <span
          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
            isSafe
              ? "text-emerald-800 bg-emerald-50 border-emerald-200"
              : "text-red-800 bg-red-50 border-red-200"
          }`}
        >
          {isSafe ? "Audit Keamanan BPOM: Terverifikasi Aman" : "Ditolak BPOM"}
        </span>
      </div>

      {/* Catalog Match Resolution Banner */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
            Status Pencocokan Katalog
          </span>
          {renderCatalogBadge()}
        </div>

        {/* 1-Click Save to Catalog Button for Ad-Hoc dishes: ONLY if safe and can_publish */}
        {draft.can_save_to_catalog && isSafe && draft.can_publish && (
          <button
            type="button"
            onClick={handleSaveToCatalog}
            disabled={isSavingToCatalog || savedToCatalog}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
              savedToCatalog
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default"
                : "bg-stone-100 hover:bg-emerald-50 text-stone-800 hover:text-emerald-800 border border-stone-300 cursor-pointer"
            }`}
          >
            {savedToCatalog ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tersimpan di Buku Menu</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isSavingToCatalog ? "Menyimpan..." : "Simpan ke Buku Menu"}</span>
              </>
            )}
          </button>
        )}
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
                Standar PerBPOM No. 16/2019
              </span>
            </div>
            <h3 className="text-sm font-bold mt-1.5">
              {isSafe ? "Lolos Verifikasi Keamanan Pangan" : "Ditolak: Pelanggaran Batas Suhu Ruang"}
            </h3>
            <p className="text-xs mt-1 leading-relaxed opacity-90">{humanizeBpomText(draft.safety_reason)}</p>

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

      {/* 2-Column Responsive Grid: Human-in-the-Loop Entity Card & Dynamic Pricing Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* Editable Human-in-the-Loop Entity Card */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm space-y-3 h-full flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-[#1F1D1A] uppercase tracking-wider">
                Rincian Entitas & Verifikasi Staf
              </h4>
              <span className="text-[10px] text-stone-400">Klik kolom untuk mengubah</span>
            </div>

            <div className="space-y-3 text-xs">
              {/* Editable Food Name */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                  Nama Hidangan
                </label>
                <input
                  type="text"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 font-bold text-stone-800 bg-[#F4F3F7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Editable Quantity bounded 1 - 200 */}
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Jumlah Porsi (Maks 200)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1)))}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 font-bold text-stone-800 bg-[#F4F3F7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs transition-colors"
                  />
                </div>

                {/* Editable Original Price bounded 1000 - 2000000 */}
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1 flex items-center justify-between">
                    <span>Harga Normal (Rp)</span>
                    {draft.needs_manual_price && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1 rounded">
                        Wajib Diisi
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step={500}
                    min={1000}
                    max={2000000}
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(Math.max(1000, Math.min(2000000, parseInt(e.target.value, 10) || 1000)))}
                    className={`w-full px-3 py-2 rounded-xl font-bold text-xs focus:outline-none focus:ring-2 ${
                      draft.needs_manual_price
                        ? "border-2 border-amber-400 bg-amber-50 text-amber-950 focus:ring-amber-500"
                        : "border border-stone-200 bg-[#F4F3F7] focus:bg-white text-stone-800 focus:ring-emerald-500 transition-colors"
                    }`}
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-[#F4F3F7] border border-stone-200/50">
                  <span className="text-[10px] text-[#6B655B] block">Kategori Pangan</span>
                  <span className="font-bold text-[#1F1D1A]">{getFriendlyCategory(draft.category).label}</span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F4F3F7] border border-stone-200/50">
                  <span className="text-[10px] text-[#6B655B] block">Waktu Sejak Dimasak</span>
                  <span className="font-bold text-[#1F1D1A]">
                    {draft.hours_since_cooked} jam / Maks {draft.bpom_max_hours} jam
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#6B655B] pt-2 border-t border-stone-100 mt-2">
            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              Sisa waktu tutup toko: <strong>{draft.minutes_until_closing} menit</strong>
            </span>
          </div>
        </div>

        {/* Dynamic Pricing Interactive Slider */}
        <div className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm space-y-3 h-full flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-[#1F1D1A]">Dynamic Pricing (50% – 70%)</h4>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Diskon: {discountPercent}%
              </span>
            </div>

            <div className="space-y-2 mt-3">
              <input
                type="range"
                min={50}
                max={70}
                step={1}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#6B655B]">
                <span>50% (Awal Window)</span>
                <span>Rekomendasi AI: {draft.recommended_discount_percent}%</span>
                <span>70% (Menjelang Tutup)</span>
              </div>
            </div>
          </div>

          {/* Pricing Calculation Display */}
          <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/60 flex items-center justify-between mt-3">
            <div>
              <span className="text-[10px] text-[#6B655B] block">Harga Normal Asli</span>
              <span className="text-xs text-gray-400 line-through">
                Rp {originalPrice.toLocaleString("id-ID")}
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
      </div>

      {/* Publish Action Button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!isSafe || !draft.can_publish || isPublishing}
          onClick={handlePublishClick}
          className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all ${
            !isSafe || !draft.can_publish
              ? "bg-red-200 text-red-600 cursor-not-allowed shadow-none border border-red-300"
              : isPublishing
              ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
              : "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-500/20 active:scale-[0.98] cursor-pointer"
          }`}
        >
          {!isSafe || !draft.can_publish ? (
            <span>DITOLAK OLEH GUARDRAIL BPOM (TIDAK DAPAT DITERBITKAN)</span>
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
