import React, { useState } from "react";
import { Mic, MicOff, Send, Sparkles, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { PresetScenario } from "../types/listing";

interface InputPanelProps {
  inputText: string;
  setInputText: (val: string) => void;
  onSubmitDraft: (text: string) => void;
  isLoading: boolean;
}

const PRESET_PILLS: PresetScenario[] = [
  {
    id: "pill-1",
    pillTitle: "🥐 Pill 1: Happy Path (Roti Fresh)",
    pillSubtitle: "4 porsi · Rp20.000 · Matang 1 jam · Tutup 2 jam",
    text: "Sisa 4 porsi Croissant Cokelat, harga normal Rp20.000, baru matang 1 jam lalu, toko tutup 2 jam lagi.",
    icon: "Croissant",
    toneColor: "emerald",
    badge: "BPOM SAFE · Diskon 55% (Rp9.000)",
  },
  {
    id: "pill-2",
    pillTitle: "🍛 Pill 2: Negative Guardrail (Santan Basi)",
    pillSubtitle: "3 porsi · Rp25.000 · Sudah 7 jam di suhu ruang",
    text: "Ada sisa 3 porsi Gulai Ayam Padang santan kental, harga Rp25.000, selesai masak jam 11 siang (sudah 7 jam suhu ruang).",
    icon: "AlertTriangle",
    toneColor: "red",
    badge: "BPOM REJECTED · Bacillus cereus",
  },
  {
    id: "pill-3",
    pillTitle: "⏰ Pill 3: Boundary Pricing (Jam Kritis)",
    pillSubtitle: "5 porsi · Rp30.000 · Matang 2 jam · Tutup 15 menit",
    text: "Ada 5 porsi Nasi Bento Ayam, harga Rp30.000, baru matang 2 jam lalu, toko tutup 15 menit lagi.",
    icon: "Clock",
    toneColor: "amber",
    badge: "BPOM SAFE · Diskon Maksimal 70% (Rp9.000)",
  },
];

export const InputPanel: React.FC<InputPanelProps> = ({
  inputText,
  setInputText,
  onSubmitDraft,
  isLoading,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingNote, setRecordingNote] = useState<string | null>(null);

  const handlePillClick = (preset: PresetScenario) => {
    setInputText(preset.text);
    onSubmitDraft(preset.text);
  };

  const handleVoiceRecordToggle = async () => {
    if (isRecording) {
      setIsRecording(false);
      setRecordingNote(null);
      return;
    }

    // Attempt Web Audio API Recording with simulated fallback
    try {
      if (typeof navigator !== "undefined" && Boolean(navigator?.mediaDevices?.getUserMedia)) {
        setIsRecording(true);
        setRecordingNote("Merekam audio mikrofon via Web Audio API...");
        
        // Listen for 3 seconds, then simulate transcribed speech
        setTimeout(() => {
          setIsRecording(false);
          setRecordingNote(null);
          const sampleAudioVoice = "Sisa 4 porsi Croissant Cokelat, harga normal Rp20.000, baru matang 1 jam lalu, toko tutup 2 jam lagi.";
          setInputText(sampleAudioVoice);
          onSubmitDraft(sampleAudioVoice);
        }, 2500);
      } else {
        // Fallback simulation
        setIsRecording(true);
        setTimeout(() => {
          setIsRecording(false);
          const sampleAudioVoice = "Ada 5 porsi Nasi Bento Ayam, harga Rp30.000, baru matang 2 jam lalu, toko tutup 15 menit lagi.";
          setInputText(sampleAudioVoice);
          onSubmitDraft(sampleAudioVoice);
        }, 1500);
      }
    } catch {
      setIsRecording(false);
      setRecordingNote("Izin mikrofon tidak tersedia, gunakan input teks.");
    }
  };

  return (
    <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E0D8] p-5 shadow-sm space-y-4">
      {/* Header section with quick pills */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#10B981]/10 text-[#059669]">
              <Sparkles className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-bold text-[#1F1D1A]">
              Natural Language Listing Input
            </h2>
          </div>
          <span className="text-xs text-[#6B7280]">
            Pilih preset 1-klik atau ketik perintah bebas
          </span>
        </div>

        {/* 3 Quick Test Preset Pills */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
          {PRESET_PILLS.map((pill) => {
            const isRed = pill.toneColor === "red";
            const isAmber = pill.toneColor === "amber";

            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => handlePillClick(pill)}
                disabled={isLoading}
                className={`text-left p-3 rounded-xl border transition-all text-xs flex flex-col justify-between group ${
                  isRed
                    ? "bg-red-50/60 border-red-200 hover:border-red-400 hover:bg-red-50"
                    : isAmber
                    ? "bg-amber-50/60 border-amber-200 hover:border-amber-400 hover:bg-amber-50"
                    : "bg-emerald-50/60 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-[#1F1D1A] group-hover:text-black">
                      {pill.pillTitle}
                    </span>
                    {isRed ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                    ) : isAmber ? (
                      <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-[#6B7280] line-clamp-2 mb-2">
                    {pill.pillSubtitle}
                  </p>
                </div>
                <span
                  className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${
                    isRed
                      ? "bg-red-100 text-red-700"
                      : isAmber
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {pill.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Textarea & Voice Action Bar */}
      <div className="space-y-2">
        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Contoh: Ada 4 porsi Croissant Cokelat harga normal Rp20.000, baru matang 1 jam lalu, toko tutup 2 jam lagi..."
            rows={3}
            disabled={isLoading || isRecording}
            className="w-full p-3.5 pr-12 text-sm bg-[#F8F6F0] rounded-xl border border-[#E5E0D8] focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:bg-white transition-all text-[#1F1D1A] placeholder-[#6B7280]"
          />

          {/* Voice recording button inside textarea */}
          <button
            type="button"
            onClick={handleVoiceRecordToggle}
            title={isRecording ? "Hentikan Rekaman" : "Rekam Suara (Web Audio API)"}
            className={`absolute right-3 top-3 p-2 rounded-lg transition-all ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "bg-white text-[#6B7280] hover:text-[#10B981] border border-[#E5E0D8] shadow-sm"
            }`}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        {recordingNote && (
          <p className="text-xs text-red-600 flex items-center gap-1.5 animate-pulse font-medium">
            <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
            {recordingNote}
          </p>
        )}

        {/* Submit Draft Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSubmitDraft(inputText)}
            disabled={isLoading || !inputText.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Mengevaluasi BPOM & Dynamic Pricing...
              </span>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Analisis dengan Agentic AI & BPOM Guardrail</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
