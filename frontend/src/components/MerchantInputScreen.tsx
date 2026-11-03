import React, { useState, useRef } from "react";
import { Mic, MicOff, Sparkles, AlertCircle, Info, RefreshCw, BookOpen, Layers } from "lucide-react";
import { startIndonesianSpeechRecognition } from "../services/speech";
import { MerchantCatalogModal } from "./MerchantCatalogModal";

interface MerchantInputScreenProps {
  onAnalyze: (text: string) => Promise<void>;
  isLoading: boolean;
  storeName: string;
  storeId?: string;
}

export const MerchantInputScreen: React.FC<MerchantInputScreenProps> = ({
  onAnalyze,
  isLoading,
  storeName,
  storeId = "FTUI-001",
}) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechStopFn, setSpeechStopFn] = useState<(() => void) | null>(null);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const baseTextRef = useRef("");

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
        setInputText(combined);
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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    await onAnalyze(inputText.trim());
  };

  const applyPreset = (text: string) => {
    setInputText(text);
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      {/* Top Banner / Store Context & Catalog Quick Action */}
      <div className="bg-white p-3.5 rounded-2xl border border-[#E2DDD3] shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1F1D1A]">Buat Listing Makanan Surplus</h2>
            <p className="text-xs text-[#6B655B]">
              Gerai: <span className="font-semibold text-emerald-800">{storeName}</span> ({storeId})
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCatalogOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition shadow-sm"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>📚 Buku Menu Gerai</span>
          </button>
        </div>
      </div>

      {/* Zero-Toggle Quick Preset Pills */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700 mb-2">
          <Layers className="w-3.5 h-3.5 text-emerald-600" />
          <span>Contoh Input Pintar (Context-Aware Zero-Toggle):</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => applyPreset("Sisa 3 rendang")}
            className="p-2 text-left rounded-xl bg-white hover:bg-emerald-50 border border-stone-200 hover:border-emerald-300 transition text-[11px] shadow-sm"
          >
            <span className="font-bold text-emerald-800 block">Kasus A: Menu Terdaftar</span>
            <span className="text-stone-500 italic">"Sisa 3 rendang"</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("Sisa 2 ayam bakar, baru matang 1 jam lalu")}
            className="p-2 text-left rounded-xl bg-white hover:bg-emerald-50 border border-stone-200 hover:border-emerald-300 transition text-[11px] shadow-sm"
          >
            <span className="font-bold text-emerald-800 block">Kasus B: Override Jam Masak</span>
            <span className="text-stone-500 italic">"Sisa 2 ayam bakar, baru matang 1 jam lalu"</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("Ada 3 porsi Nasi Rawon Spesial, baru matang 1 jam lalu")}
            className="p-2 text-left rounded-xl bg-white hover:bg-emerald-50 border border-stone-200 hover:border-emerald-300 transition text-[11px] shadow-sm"
          >
            <span className="font-bold text-amber-800 block">Kasus C/D: Menu Baru Ad-Hoc</span>
            <span className="text-stone-500 italic">"Ada 3 porsi Nasi Rawon Spesial, baru matang 1 jam lalu"</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("Ada sisa 3 porsi Gulai Ayam Padang santan kental, harga Rp25.000, sudah 7 jam suhu ruang")}
            className="p-2 text-left rounded-xl bg-white hover:bg-red-50 border border-stone-200 hover:border-red-300 transition text-[11px] shadow-sm"
          >
            <span className="font-bold text-red-800 block">Uji Tolak BPOM Santan Basi</span>
            <span className="text-stone-500 italic">"Gulai Ayam santan kental, 7 jam suhu ruang"</span>
          </button>
        </div>
      </div>

      {/* Guide Info Box */}
      <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8E2D5] text-[11px] text-[#555047] mb-4 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-[#1F1D1A]">
          <Info className="w-3.5 h-3.5 text-emerald-600" />
          <span>Panduan Dikte Bebas:</span>
        </div>
        <p className="leading-relaxed">
          Cukup sebutkan sisa makanan (misal: <em>"Sisa 3 rendang"</em>). Sistem otomatis mencocokkan ke <strong>Buku Menu Gerai</strong> untuk menarik harga dan jam masak. Jika menu belum terdaftar, Anda dapat melengkapinya di halaman pratinjau.
        </p>
      </div>

      {/* Input Form */}
      <form onSubmit={handleFormSubmit} className="flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          <div className="relative">
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ketik deskripsi sisa makanan atau tekan tombol mikrofon di bawah untuk mendiktekan dalam Bahasa Indonesia..."
              className="w-full p-3.5 text-xs rounded-2xl border border-[#D8D2C5] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 resize-none text-[#1F1D1A] leading-relaxed placeholder:text-gray-400"
            />

            {inputText && (
              <button
                type="button"
                onClick={() => setInputText("")}
                className="absolute right-3 top-3 text-[10px] text-gray-400 hover:text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded"
              >
                Hapus
              </button>
            )}
          </div>

          {/* Speech Recording Bar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                isRecording
                  ? "bg-red-50 text-red-700 border-red-300 animate-pulse"
                  : "bg-white text-[#1F1D1A] border-[#D8D2C5] hover:bg-gray-50"
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
                  <span>Dikte Suara (Web Speech API id-ID)</span>
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
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{speechError}</span>
            </div>
          )}
        </div>

        {/* Submit Action Button */}
        <div className="pt-2">
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
                <span>Menganalisis Entitas & Guardrail BPOM...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Analisis dengan AI & Guardrail BPOM</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Catalog Modal */}
      <MerchantCatalogModal
        storeId={storeId}
        storeName={storeName}
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
      />
    </div>
  );
};
