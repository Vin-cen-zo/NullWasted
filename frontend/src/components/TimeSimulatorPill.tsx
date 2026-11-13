import React, { useEffect, useRef, useState } from "react";
import { Clock, RotateCcw, Sparkles, X } from "lucide-react";
import {
  NW_CLOCK_CHANGE_EVENT,
  formatWibClock,
  formatWibHHMM,
  getEffectiveNow,
  isTimeSimulated,
  resetSimulatedClock,
  setSimulatedClockTime,
} from "../utils/clock";

const PRESETS = [
  { label: "09:00 Pagi", time: "09:00" },
  { label: "16:30 Sore", time: "16:30" },
  { label: "19:45 Jelang Tutup", time: "19:45" },
  { label: "21:00 Lewat Tutup", time: "21:00" },
];

export const TimeSimulatorPill: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [nowDate, setNowDate] = useState<Date>(() => getEffectiveNow());
  const [simulated, setSimulated] = useState<boolean>(() => isTimeSimulated());
  const [timeInput, setTimeInput] = useState<string>(() => formatWibHHMM(getEffectiveNow()));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncClock = () => {
      const eff = getEffectiveNow();
      setNowDate(eff);
      setSimulated(isTimeSimulated());
    };

    syncClock();
    const timer = setInterval(syncClock, 1000);
    window.addEventListener(NW_CLOCK_CHANGE_EVENT, syncClock);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NW_CLOCK_CHANGE_EVENT, syncClock);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeInput(formatWibHHMM(getEffectiveNow()));
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const handleApplyTime = (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeInput) return;
    setSimulatedClockTime(timeInput);
    setOpen(false);
  };

  const handleSelectPreset = (hhmm: string) => {
    setTimeInput(hhmm);
    setSimulatedClockTime(hhmm);
    setOpen(false);
  };

  const handleReset = () => {
    resetSimulatedClock();
    setTimeInput(formatWibHHMM(new Date()));
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Klik untuk membuka Simulator Jam Uji WIB"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold border transition-all active:scale-95 ${
          simulated
            ? "bg-amber-50 text-amber-800 border-amber-300 shadow-xs"
            : "bg-[#F8F6F0] text-[#5C574F] border-[#E5E0D5] hover:border-[#10B981]/50 hover:text-[#1F1D1A]"
        }`}
      >
        <Clock className={`w-3.5 h-3.5 shrink-0 ${simulated ? "text-amber-600" : "text-[#10B981]"}`} />
        <span>{formatWibClock(nowDate, true)}</span>
        {simulated && (
          <span className="px-1.5 py-0.5 rounded-md bg-amber-200/80 text-amber-900 text-[9px] font-extrabold uppercase tracking-wider">
            Simulasi
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-[#E5E0D5] rounded-2xl shadow-xl p-4 z-50 text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-extrabold text-[#1F1D1A]">Simulator Jam Uji (WIB)</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-[#5C574F] hover:text-[#1F1D1A] rounded-lg"
              aria-label="Tutup simulator jam"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-[#5C574F] leading-relaxed mb-3">
            Uji skenario pagi, jelang tutup, atau lewat jam tutup tanpa mengubah jam OS perangkat.
          </p>

          <form onSubmit={handleApplyTime} className="flex items-center gap-2 mb-3">
            <input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              className="flex-1 bg-[#F8F6F0] border border-[#E5E0D5] rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-[#1F1D1A] focus:outline-none focus:border-[#10B981]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold rounded-xl transition-colors"
            >
              Terapkan
            </button>
          </form>

          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.time}
                type="button"
                onClick={() => handleSelectPreset(preset.time)}
                className="text-left px-2.5 py-1.5 rounded-xl bg-[#F8F6F0] hover:bg-[#E8F8F2] border border-[#E5E0D5] hover:border-[#10B981]/50 text-[11px] font-semibold text-[#1F1D1A] transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="w-full py-2 px-3 rounded-xl border border-[#E5E0D5] bg-white hover:bg-[#F8F6F0] text-xs font-bold text-[#5C574F] hover:text-[#1F1D1A] flex items-center justify-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Gunakan Waktu Sekarang</span>
          </button>
        </div>
      )}
    </div>
  );
};
