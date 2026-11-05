import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface ClosingCountdownBadgeProps {
  closingTime?: string;
  fallbackMinutes?: number;
  className?: string;
}

export const ClosingCountdownBadge: React.FC<ClosingCountdownBadgeProps> = ({
  closingTime = "20:30",
  fallbackMinutes = 90,
  className = "",
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    try {
      const parts = closingTime.split(":");
      const targetH = parseInt(parts[0], 10);
      const targetM = parseInt(parts[1], 10);
      const now = new Date();
      const target = new Date();
      target.setHours(targetH, targetM, 0, 0);

      let diffSec = Math.floor((target.getTime() - now.getTime()) / 1000);
      if (diffSec <= 0 || diffSec > 18000) {
        // Fallback or demo off-hours: deterministic simulation between 45m and 120m
        const simMin = 45 + ((targetH * 60 + targetM) % 76);
        diffSec = (fallbackMinutes || simMin) * 60;
      }
      return diffSec;
    } catch {
      return (fallbackMinutes || 90) * 60;
    }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  const formattedTime =
    hours > 0
      ? `${hours}j ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}d`
      : `${minutes}m ${seconds.toString().padStart(2, "0")}d`;

  const isUrgent = secondsRemaining < 1800; // Under 30 mins

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border transition-colors ${
        isUrgent
          ? "bg-red-50 text-red-700 border-red-200 animate-pulse"
          : "bg-amber-50 text-amber-800 border-amber-200"
      } ${className}`}
      title={`Toko tutup pk ${closingTime}`}
    >
      <Clock className="w-3 h-3 shrink-0" />
      <span>{formattedTime}</span>
    </span>
  );
};
