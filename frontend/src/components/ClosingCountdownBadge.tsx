import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface ClosingCountdownBadgeProps {
  closingTime?: string;
  fallbackMinutes?: number;
  className?: string;
}

export function computeSecondsUntilClosing(closingTime: string = "20:30"): number {
  try {
    const parts = closingTime.split(":");
    const targetH = parseInt(parts[0], 10) || 20;
    const targetM = parseInt(parts[1], 10) || 30;
    const now = new Date();
    const target = new Date();
    target.setHours(targetH, targetM, 0, 0);

    if (target.getTime() <= now.getTime()) {
      // Jika jam tutup hari ini sudah lewat, hitung mundur menuju jam tutup esok hari
      target.setDate(target.getDate() + 1);
    }

    const diffSec = Math.floor((target.getTime() - now.getTime()) / 1000);
    return Math.max(0, diffSec);
  } catch {
    return 3600;
  }
}

export const ClosingCountdownBadge: React.FC<ClosingCountdownBadgeProps> = ({
  closingTime = "20:30",
  className = "",
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    computeSecondsUntilClosing(closingTime)
  );

  useEffect(() => {
    setSecondsRemaining(computeSecondsUntilClosing(closingTime));
    const timer = setInterval(() => {
      setSecondsRemaining(computeSecondsUntilClosing(closingTime));
    }, 1000);
    return () => clearInterval(timer);
  }, [closingTime]);

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
