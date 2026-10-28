import React, { useState } from "react";
import { Mic, MicOff, Sparkles, AlertCircle, Info, RefreshCw } from "lucide-react";
import { startIndonesianSpeechRecognition } from "../services/speech";

interface MerchantInputScreenProps {
  onAnalyze: (text: string) => Promise<void>;
  isLoading: boolean;
  storeName: string;
}

export const MerchantInputScreen: React.FC<MerchantInputScreenProps> = ({
  onAnalyze,
  isLoading,
  storeName,
}) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechStopFn, setSpeechStopFn] = useState<(() => void) | null>(null);

  const toggleSpeechRecognition = () => {
    if (isRecording) {
      if (speechStopFn) speechStopFn();
      setIsRecording(false);
      return;
    }

    setSpeechError(null);
    setIsRecording(true);

    const recognitionInstance = startIndonesianSpeechRecognition({
      onResult: (transcript, isFinal) => {
        setInputText((prev) => {
          // If previous ends with text, add space
          if (!prev.trim()) return transcript;
          return `${prev.trim()} ${transcript}`.trim();
        });
        if (isFinal) {
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

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      {/* Top Banner / Store Context */}
      <div className="bg-white p-3.5 rounded-2xl border border-[#E2DDD3] shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1F1D1A]">Buat Listing Makanan Surplus</h2>
            <p className="text-xs text-[#6B655B]">Gerai: <span className="font-semibold text-emerald-800">{storeName}</span></p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
            Live Input
          </span>
        </div>
      </div>

      {/* Guide Info Box */}
      <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8E2D5] text-[11px] text-[#555047] mb-4 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-[#1F1D1A]">
          <Info className="w-3.5 h-3.5 text-emerald-600" />
          <span>Panduan Format Suara / Ketik Bebas:</span>
        </div>
        <p className="leading-relaxed">
          Sebutkan <strong>jumlah porsi</strong>, <strong>nama makanan</strong>, <strong>harga normal</strong>, <strong>lama waktu sejak matang</strong>, dan <strong>sisa waktu toko tutup</strong>.
        </p>
        <p className="text-[10px] text-[#7C7569] italic">
          Contoh: "Sisa 4 porsi Croissant Cokelat, harga normal 20 ribu, baru matang 1 jam lalu, toko tutup 2 jam lagi."
        </p>
      </div>

      {/* Input Form */}
      <form onSubmit={handleFormSubmit} className="flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          <div className="relative">
            <textarea
              rows={5}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ketik deskripsi surplus makanan di sini atau tekan tombol mikrofon di bawah untuk mendiktekan dalam Bahasa Indonesia..."
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
                <span>Menganalisis Entitas & Keamanan BPOM...</span>
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
    </div>
  );
};
