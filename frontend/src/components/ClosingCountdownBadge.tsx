import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  computeEffectiveSecondsUntilClosing,
  NW_CLOCK_CHANGE_EVENT,
} from "../utils/clock";

export const computeSecondsUntilClosing = computeEffectiveSecondsUntilClosing;

interface ClosingCountdownBadgeProps {
  closingTime: string;
  fallbackMinutes?: number;
  expiresAt?: string | null;
}

export const ClosingCountdownBadge: React.FC<ClosingCountdownBadgeProps> = ({
  closingTime,
  fallbackMinutes,
  expiresAt,
}) => {
  const resolveSeconds = () => {
    const computed = computeEffectiveSecondsUntilClosing(closingTime, expiresAt);
    if (computed <= 0 && !expiresAt && !closingTime && typeof fallbackMinutes === "number") {
      return Math.max(0, Math.round(fallbackMinutes * 60));
    }
    return computed;
  };

  const [secondsLeft, setSecondsLeft] = useState<number>(resolveSeconds);

  useEffect(() => {
    const sync = () => setSecondsLeft(resolveSeconds());
    sync();
    const timer = setInterval(sync, 1000);
    window.addEventListener(NW_CLOCK_CHANGE_EVENT, sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NW_CLOCK_CHANGE_EVENT, sync);
    };
  }, [closingTime, expiresAt, fallbackMinutes]);

  const formatDuration = (totalSecs: number) => {
    if (totalSecs <= 0) return "Tutup";
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    if (hrs > 0) return `${hrs}j ${pad(mins)}m ${pad(secs)}d`;
    return `${mins}m ${pad(secs)}d`;
  };

  const isExpired = secondsLeft <= 0;
  const isUrgent = secondsLeft > 0 && secondsLeft <= 1800;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
        isExpired
          ? "bg-red-50 text-red-700 border-red-200"
          : isUrgent
          ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
          : "bg-stone-100 text-stone-700 border-stone-200"
      }`}
    >
      <Clock className="w-3 h-3 shrink-0" />
      <span>{formatDuration(secondsLeft)}</span>
    </span>
  );
};
