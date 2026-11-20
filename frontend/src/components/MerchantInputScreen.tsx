import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  MicOff,
  Sparkles,
  AlertCircle,
  Info,
  RefreshCw,
  BookOpen,
  Plus,
  Minus,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Send,
  X,
  Utensils,
  MapPin,
} from "lucide-react";
import { startIndonesianSpeechRecognition } from "../services/speech";
import { fetchStoreMenu, publishListing, updateStoreLocation } from "../services/api";
import { MerchantCatalogModal } from "./MerchantCatalogModal";
import { StorePinpointPickerModal } from "./StorePinpointPickerModal";
import { PublishRequest, StoreMenuItem, getFriendlyCategory, resolveImageUrl } from "../types/listing";
import {
  computeEffectiveSecondsUntilClosing,
  getEffectiveNow,
  getWibComponents,
  NW_CLOCK_CHANGE_EVENT,
  parseTimeHHMM,
} from "../utils/clock";

interface MerchantInputScreenProps {
  onAnalyze: (text: string) => Promise<void>;
  isLoading: boolean;
  storeName: string;
  storeId?: string;
  onDirectPublish?: (payload: PublishRequest) => Promise<void>;
  isPublishing?: boolean;
  closingTime?: string;
  locationName?: string;
  latitude?: number | null;
  longitude?: number | null;
  onStoreLocationUpdated?: (lat: number | null, lng: number | null, label?: string) => void;
  initialText?: string;
  onTextChange?: (text: string) => void;
  analyzeError?: string | null;
  onClearAnalyzeError?: () => void;
}

export const MerchantInputScreen: React.FC<MerchantInputScreenProps> = ({
  onAnalyze,
  isLoading,
  storeName,
  storeId = "FTUI-001",
  onDirectPublish,
  isPublishing = false,
  closingTime = "20:30",
  locationName = "",
  latitude = null,
  longitude = null,
  onStoreLocationUpdated,
  initialText = "",
  onTextChange,
  analyzeError = null,
  onClearAnalyzeError,
}) => {
  // Navigation: Dual-Mode Tabs (Default to AI if initialText provided)
  const [inputMode, setInputMode] = useState<"catalog" | "ai">(() =>
    initialText && initialText.trim().length > 0 ? "ai" : "catalog"
  );

  // Jalur 1: Catalog Routine Items State
  const [menuItems, setMenuItems] = useState<StoreMenuItem[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<StoreMenuItem | null>(null);
  const [batchQty, setBatchQty] = useState(3);
  const [batchCookHour, setBatchCookHour] = useState("16");
  const [batchCookMinute, setBatchCookMinute] = useState("00");
  const [batchDiscountPercent, setBatchDiscountPercent] = useState(60);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [batchClockTick, setBatchClockTick] = useState<number>(() => getEffectiveNow().getTime());

  useEffect(() => {
    const syncClock = () => setBatchClockTick(getEffectiveNow().getTime());
    const timer = setInterval(syncClock, 15000);
    window.addEventListener(NW_CLOCK_CHANGE_EVENT, syncClock);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NW_CLOCK_CHANGE_EVENT, syncClock);
    };
  }, []);

  // Jalur 2: Voice & AI Ad-Hoc State
  const [inputText, setInputText] = useState(initialText);
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechStopFn, setSpeechStopFn] = useState<(() => void) | null>(null);
  const baseTextRef = useRef("");

  // Catalog & Pinpoint Modal Managers
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isPinpointOpen, setIsPinpointOpen] = useState(false);

  useEffect(() => {
    if (initialText && initialText !== inputText) {
      setInputText(initialText);
      setInputMode("ai");
    }
  }, [initialText]);

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (onTextChange) {
      onTextChange(text);
    }
  };

  // Load store menu items
  const loadMenuItems = async () => {
    try {
      setIsLoadingMenu(true);
      const data = await fetchStoreMenu(storeId);
      setMenuItems(data);
    } catch (err) {
      console.error("Gagal memuat katalog toko:", err);
    } finally {
      setIsLoadingMenu(false);
    }
  };

  useEffect(() => {
    loadMenuItems();
  }, [storeId]);

  // Speech Recognition Handler
  const toggleSpeechRecognition = () => {
    if (isRecording) {
      if (speechStopFn) speechStopFn();
      setIsRecording(false);
      return;
    }

    setSpeechError(null);
    baseTextRef.current = inputText.trim();
    setIsRecording(true);

    const recognitionInstance = startIndonesianSpeechRecognition({
      onResult: (transcript, isFinal) => {
        const prefix = baseTextRef.current;
        const combined = prefix ? `${prefix} ${transcript}`.trim() : transcript.trim();
        handleTextChange(combined);
        if (isFinal) {
          baseTextRef.current = combined;
          setIsRecording(false);
        }
      },
      onError: (errMsg) => {
        setSpeechError(errMsg);
        setIsRecording(false);
      },
      onEnd: () => {
        setIsRecording(false);
      },
    });

    setSpeechStopFn(() => recognitionInstance.stop);
  };

  const handleAiFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    await onAnalyze(inputText.trim());
  };

  // Open Batch Modal for selected item
  const handleOpenBatchModal = (item: StoreMenuItem) => {
    setSelectedMenuItem(item);
    setBatchQty(3);
    const parts = (item.typical_cooking_time || "16:00").split(":");
    setBatchCookHour(parts[0] ? parts[0].padStart(2, "0") : "16");
    setBatchCookMinute(parts[1] ? parts[1].padStart(2, "0") : "00");
    setBatchDiscountPercent(60);
  };

  const handleSetCurrentTime = () => {
    const nowWib = getWibComponents(getEffectiveNow());
    setBatchCookHour(String(nowWib.hour).padStart(2, "0"));
    setBatchCookMinute(String(Math.floor(nowWib.minute / 5) * 5).padStart(2, "0"));
  };

  const handleSetTypicalTime = () => {
    if (!selectedMenuItem) return;
    const parts = (selectedMenuItem.typical_cooking_time || "16:00").split(":");
    setBatchCookHour(parts[0] ? parts[0].padStart(2, "0") : "16");
    setBatchCookMinute(parts[1] ? parts[1].padStart(2, "0") : "00");
  };

  // Real-Time BPOM Guardrail & Closing Window Evaluation in Modal
  void batchClockTick;
  const effectiveNowWib = getWibComponents(getEffectiveNow());
  const nowMinutesWib = effectiveNowWib.hour * 60 + effectiveNowWib.minute;
  const remainingClosingSeconds = computeEffectiveSecondsUntilClosing(closingTime || "20:30");
  const isStoreClosed = remainingClosingSeconds <= 0;
  const minutesUntilClosing = Math.max(0, Math.round(remainingClosingSeconds / 60));

  let diffHours = 2.0;
  let isFutureCookTime = false;
  let isBpomRejected = false;
  let cookedAtHHMM = "16:00";
  if (selectedMenuItem) {
    const { hour: cookH, minute: cookM } = parseTimeHHMM(
      `${batchCookHour}:${batchCookMinute}`,
      16,
      0
    );
    cookedAtHHMM = `${String(cookH).padStart(2, "0")}:${String(cookM).padStart(2, "0")}`;
    const elapsedRawHours = (nowMinutesWib - (cookH * 60 + cookM)) / 60;
    isFutureCookTime = elapsedRawHours < 0;
    diffHours = isFutureCookTime ? 0 : Number(Math.max(0.5, elapsedRawHours).toFixed(1));
    isBpomRejected = !isFutureCookTime && diffHours > selectedMenuItem.bpom_max_hours;
  }

  const calculatedDiscountedPrice = selectedMenuItem
    ? Math.floor((selectedMenuItem.original_price * (1 - batchDiscountPercent / 100)) / 100) * 100
    : 0;

  // Direct Publish Action from Modal
  const handleBatchPublish = async () => {
    if (
      !selectedMenuItem ||
      isFutureCookTime ||
      isBpomRejected ||
      isStoreClosed ||
      isSubmittingBatch ||
      isPublishing
    ) {
      return;
    }

    try {
      setIsSubmittingBatch(true);
      const payload: PublishRequest = {
        store_id: storeId,
        store_name: storeName,
        food_name: selectedMenuItem.food_name,
        matched_canonical_dish: selectedMenuItem.canonical_bpom_dish || selectedMenuItem.food_name,
        category: selectedMenuItem.category || "MEDIUM_PERISHABILITY",
        food_type: selectedMenuItem.food_type || "MEAL",
        quantity: Math.max(1, Math.min(200, batchQty)),
        original_price: selectedMenuItem.original_price,
        discount_percent: batchDiscountPercent,
        discounted_price: calculatedDiscountedPrice,
        hours_since_cooked: diffHours,
        cooked_at_hhmm: cookedAtHHMM,
        bpom_max_hours: selectedMenuItem.bpom_max_hours,
        minutes_until_closing: minutesUntilClosing,
        safety_status: "SAFE",
        safety_reason: `Hidangan rutin tersimpan dalam batas aman suhu ruang (${diffHours} jam dari batas maks ${selectedMenuItem.bpom_max_hours} jam).`,
        hazard_description: "Kepatuhan batas simpan suhu ruang PerBPOM No. 16/2019.",
        regulation_ref: "PerBPOM No. 16/2019",
        similarity_score: 0.95,
        location_badge: locationName || "Area Gerai Mitra",
        closing_time: closingTime || "20:30",
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        portion_size: "Reguler",
        image_url: selectedMenuItem.image_url ?? null,
      };

      if (onDirectPublish) {
        await onDirectPublish(payload);
      } else {
        await publishListing(payload);
      }
      setSelectedMenuItem(null);
    } catch (err) {
      console.error("Gagal menerbitkan batch listing:", err);
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minuteOptions = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full space-y-4">
      {/* Top Banner / Store Context & Catalog Quick Action */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-100 shadow-[0_8px_24px_rgba(150,150,154,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-[#222222]">Buat Listing Makanan Surplus</h2>
            <p className="text-xs text-[#646982] flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-[#222222]">{storeName}</span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                {latitude != null && longitude != null
                  ? locationName || "Lokasi peta terpasang"
                  : "Pin peta belum dipasang"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsPinpointOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F0F5FA] hover:bg-slate-200/70 text-[#222222] text-xs font-bold transition cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>{latitude != null ? "Ubah Pin" : "Pasang Pin"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCatalogOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Kelola Buku Menu</span>
            </button>
          </div>
        </div>
      </div>

      <StorePinpointPickerModal
        isOpen={isPinpointOpen}
        initialLat={latitude ?? null}
        initialLng={longitude ?? null}
        initialLabel={locationName}
        storeName={storeName}
        allowRemove={true}
        onClose={() => setIsPinpointOpen(false)}
        onSave={async (lat, lng, label) => {
          const updated = await updateStoreLocation(storeId, {
            latitude: lat,
            longitude: lng,
            location_name: label ?? (locationName || undefined),
          });
          if (onStoreLocationUpdated) {
            onStoreLocationUpdated(updated.latitude ?? null, updated.longitude ?? null, updated.location_name);
          }
        }}
      />

      {/* Dual-Mode Tabs */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-[#E8E3D9]/60 rounded-xl border border-[#E4EAF1]">
        <button
          type="button"
          onClick={() => setInputMode("catalog")}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            inputMode === "catalog"
              ? "bg-white text-[#222222] shadow-sm border border-black/5"
              : "text-[#646982] hover:text-[#222222]"
          }`}
        >
          <Utensils className="w-4 h-4 text-emerald-600" />
          <span>Pilih Menu Rutin Gerai</span>
        </button>
        <button
          type="button"
          onClick={() => setInputMode("ai")}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            inputMode === "ai"
              ? "bg-white text-[#222222] shadow-sm border border-black/5"
              : "text-[#646982] hover:text-[#222222]"
          }`}
        >
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>Input Suara AI</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* JALUR 1: PILIH MENU RUTIN GERAI (80% Kasus)                               */}
      {/* ========================================================================= */}
      {inputMode === "catalog" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700">
              Ketuk Hidangan untuk Terbitkan Sisa Batch:
            </span>
            <span className="text-xs text-stone-500">
              {menuItems.length} menu aktif
            </span>
          </div>

          {isLoadingMenu ? (
            <div className="p-8 text-center bg-white rounded-xl border border-stone-200">
              <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin mx-auto mb-2" />
              <p className="text-xs text-stone-500">Memuat katalog menu gerai...</p>
            </div>
          ) : menuItems.length === 0 ? (
            <div className="p-6 text-center bg-white rounded-xl border border-stone-200 space-y-3">
              <BookOpen className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="text-xs text-stone-600">
                Belum ada hidangan rutin di Buku Menu Gerai Anda.
              </p>
              <button
                type="button"
                onClick={() => setIsCatalogOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
              >
                + Tambah Hidangan ke Buku Menu
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {menuItems.map((item) => {
                const itemImg = resolveImageUrl(item.image_url);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleOpenBatchModal(item)}
                    className="p-3 text-left bg-white hover:bg-emerald-50/50 rounded-xl border border-stone-200 hover:border-emerald-400 shadow-sm transition-all flex flex-col justify-between h-full space-y-2 group cursor-pointer"
                  >
                    <div className="flex items-start gap-2.5">
                      {itemImg && (
                        <img
                          src={itemImg}
                          alt={item.food_name}
                          className="w-10 h-10 rounded-lg object-cover border border-stone-200 shrink-0 bg-stone-100"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-bold text-xs text-stone-900 group-hover:text-emerald-900 leading-snug line-clamp-2">
                            {item.food_name}
                          </span>
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 shrink-0 flex items-center gap-0.5">
                            <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                            <span>{item.bpom_max_hours}j</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-100">
                      <span className="font-extrabold text-stone-800">
                        Rp {item.original_price.toLocaleString("id-ID")}
                      </span>
                      <span className="text-xs text-stone-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" />
                        <span>Masak: {item.typical_cooking_time}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* JALUR 2: INPUT SUARA / MENU SPESIAL AI (15% Kasus)                        */
        /* ========================================================================= */
        <div className="space-y-4">
          <div className="bg-[#F0F5FA] p-4 rounded-xl text-[13px] text-[#646982] space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-sm text-[#222222]">
              <Info className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Cara Pakai Input Suara</span>
            </div>
            <p className="leading-relaxed">
              Sebutkan nama makanan, jumlah porsi, harga, dan jam masak untuk menu di luar buku menu.
            </p>
            <p className="text-xs text-[#222222]/80">
              Contoh: <span className="italic">"Ada sisa 3 porsi Sop Buntut, harga 35 ribu, matang jam 5 sore."</span>
            </p>
          </div>

          <form onSubmit={handleAiFormSubmit} className="space-y-4">
            <div className="relative">
              <textarea
                rows={4}
                value={inputText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Ketik deskripsi sisa makanan atau tekan tombol Rekam Suara di bawah..."
                className="w-full p-3.5 text-xs rounded-xl border border-[#E4EAF1] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 resize-none text-[#222222] leading-relaxed placeholder:text-gray-400"
              />
              {inputText && (
                <button
                  type="button"
                  onClick={() => handleTextChange("")}
                  className="absolute right-3 top-3 text-xs text-gray-400 hover:text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded cursor-pointer"
                >
                  Hapus
                </button>
              )}
            </div>

            {/* Speech Button Bar */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  isRecording
                    ? "bg-red-50 text-red-700 border-red-300 animate-pulse"
                    : "bg-white text-[#222222] border-[#E4EAF1] hover:bg-gray-50"
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-4 h-4 text-red-600" />
                    <span>Stop Bicara (Sedang Mendengarkan...)</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-emerald-600" />
                    <span>Rekam Suara</span>
                  </>
                )}
              </button>
            </div>

            {isRecording && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                <span>Mendengarkan ucapan Bahasa Indonesia Anda secara langsung...</span>
              </div>
            )}

            {speechError && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#F0F5FA] text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{speechError}</span>
              </div>
            )}

            {analyzeError && (
              <div
                role="alert"
                className="flex items-start justify-between gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 font-medium"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{analyzeError}</span>
                </div>
                {onClearAnalyzeError && (
                  <button
                    type="button"
                    onClick={onClearAnalyzeError}
                    className="text-red-500 hover:text-red-700 shrink-0 cursor-pointer"
                    aria-label="Tutup pesan error"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all ${
                !inputText.trim() || isLoading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                  : "bg-[#10B981] hover:bg-[#059669] text-white shadow-emerald-500/20 active:scale-[0.98]"
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menganalisis dengan AI & Guardrail BPOM...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analisis dengan AI & Guardrail BPOM</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL BOTTOM-SHEET: PENERBITAN INSTAN BATCH MENU RUTIN                     */}
      {/* ========================================================================= */}
      {selectedMenuItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md sm:max-w-lg bg-white rounded-t-3xl sm:rounded-xl shadow-2xl border border-stone-200 p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {resolveImageUrl(selectedMenuItem.image_url) && (
                  <img
                    src={resolveImageUrl(selectedMenuItem.image_url)!}
                    alt={selectedMenuItem.food_name}
                    className="w-12 h-12 rounded-xl object-cover border border-stone-200 shrink-0 bg-stone-100 shadow-xs"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                )}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Penerbitan Batch Cepat
                  </span>
                  <h3 className="text-base font-bold text-stone-900 mt-0.5">
                    {selectedMenuItem.food_name}
                  </h3>
                  <p className="text-xs text-stone-500">
                    Kategori: <strong className="text-stone-700">{getFriendlyCategory(selectedMenuItem.category).label}</strong> · Batas Maks: <strong className="text-emerald-700">{selectedMenuItem.bpom_max_hours} jam</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMenuItem(null)}
                className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Porsi Sisa (1 - 200) */}
            <div className="p-3 bg-[#F0F5FA] rounded-xl border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-stone-800 block">Jumlah Porsi Sisa</span>
                <span className="text-xs text-stone-500">Porsi tersedia (maks 200)</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBatchQty((prev) => Math.max(1, prev - 1))}
                  className="w-8 h-8 rounded-xl bg-white border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-100 font-bold active:scale-95 transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center text-base font-black text-stone-900">
                  {batchQty}
                </span>
                <button
                  type="button"
                  onClick={() => setBatchQty((prev) => Math.min(200, prev + 1))}
                  className="w-8 h-8 rounded-xl bg-white border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-100 font-bold active:scale-95 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Jam Matang Batch 24-Jam (Dual Dropdown) & Quick Action Buttons */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-stone-700">
                Jam Matang Batch Ini (Format 24 Jam):
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-stone-500 block mb-0.5">Jam (00 - 23)</span>
                  <select
                    value={batchCookHour}
                    onChange={(e) => setBatchCookHour(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-xl border border-stone-300 bg-white tabular-nums font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>
                        {h}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-xs text-stone-500 block mb-0.5">Menit (00 - 55)</span>
                  <select
                    value={batchCookMinute}
                    onChange={(e) => setBatchCookMinute(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-xl border border-stone-300 bg-white tabular-nums font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {minuteOptions.map((m) => (
                      <option key={m} value={m}>
                        :{m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Preset Action Buttons */}
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleSetCurrentTime}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition flex items-center gap-1"
                >
                  <Clock className="w-3 h-3 text-emerald-600" />
                  <span>Waktu Sekarang</span>
                </button>
                <button
                  type="button"
                  onClick={handleSetTypicalTime}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-300 transition"
                >
                  <span>Jadwal Rutin ({selectedMenuItem.typical_cooking_time})</span>
                </button>
              </div>
            </div>

            {/* Real-time BPOM & Closing Window Guardrail Card */}
            {isStoreClosed ? (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-950 space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-red-800">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>Gerai Tutup (CLOSED): Melewati Jam Tutup pk {closingTime || "20:30"} WIB</span>
                </div>
                <p className="text-xs text-red-800 leading-relaxed">
                  Waktu operasional gerai hari ini telah berakhir. Listing surplus baru tidak dapat diterbitkan hingga jendela buka berikutnya.
                </p>
              </div>
            ) : isFutureCookTime ? (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-950 space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-red-800">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>Jam masak tidak boleh di masa depan</span>
                </div>
                <p className="text-xs text-red-800 leading-relaxed">
                  Jam masak yang dipilih (<strong>{cookedAtHHMM} WIB</strong>) melampaui waktu sekarang. Harap pilih jam masak aktual saat hidangan selesai diolah.
                </p>
              </div>
            ) : isBpomRejected ? (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-950 space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-red-800">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>Ditolak BPOM: Melebihi Batas Suhu Ruang</span>
                </div>
                <p className="text-xs text-red-800 leading-relaxed">
                  Waktu simpan <strong>({diffHours} jam)</strong> melebihi batas aman suhu ruang <strong>({selectedMenuItem.bpom_max_hours} jam)</strong> sesuai standar PerBPOM No. 16/2019. Hidangan ini tidak dapat diterbitkan.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#F0F5FA] text-emerald-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Terverifikasi Aman Dikonsumsi</span>
                </div>
                <p className="text-xs text-emerald-800">
                  Waktu simpan: <strong>{diffHours} jam</strong> (Batas aman: {selectedMenuItem.bpom_max_hours} jam hingga tutup gerai pk {closingTime}).
                </p>

                {/* Price & Discount preview */}
                <div className="pt-2 border-t border-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-stone-500 block">Harga Normal</span>
                    <span className="text-xs text-stone-400 line-through">
                      Rp {selectedMenuItem.original_price.toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-emerald-800 block">
                      Diskon {batchDiscountPercent}%
                    </span>
                    <span className="text-base font-black text-emerald-700">
                      Rp {calculatedDiscountedPrice.toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedMenuItem(null)}
                className="flex-1 py-3 px-4 rounded-xl border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isStoreClosed || isFutureCookTime || isBpomRejected || isSubmittingBatch || isPublishing}
                onClick={handleBatchPublish}
                className="flex-[2] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmittingBatch || isPublishing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menerbitkan...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Terbitkan Listing Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Modal */}
      <MerchantCatalogModal
        storeId={storeId}
        storeName={storeName}
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        onMenuUpdated={loadMenuItems}
      />
    </div>
  );
};
