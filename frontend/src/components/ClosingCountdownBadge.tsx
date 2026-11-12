import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface ClosingCountdownBadgeProps {
  closingTime?: string;
  expiresAt?: string | null;
  fallbackMinutes?: number;
  className?: string;
}

export function computeSecondsUntilClosing(
  closingTime: string = "20:30",
  expiresAt?: string | null
): number {
  try {
    const parts = closingTime.split(":");
    const targetH = parseInt(parts[0], 10) || 20;
    const targetM = parseInt(parts[1], 10) || 30;
    const now = new Date();
    const target = new Date();
    target.setHours(targetH, targetM, 0, 0);

    if (target.getTime() <= now.getTime()) {
      // Hanya treat jam dini hari (00:00-05:59) sebagai jadwal tutup lanjutan malam ini
      if (targetH < 6 && now.getHours() >= 18) {
        target.setDate(target.getDate() + 1);
      } else {
        return 0;
      }
    }
    let diffSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    if (expiresAt) {
      const expMs = new Date(expiresAt).getTime();
      if (!Number.isNaN(expMs)) {
        diffSeconds = Math.min(diffSeconds, Math.max(0, Math.floor((expMs - now.getTime()) / 1000)));
      }
    }
    return diffSeconds;
  } catch {
    return 3600;
  }
}

export const ClosingCountdownBadge: React.FC<ClosingCountdownBadgeProps> = ({
  closingTime = "20:30",
  expiresAt = null,
  className = "",
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    computeSecondsUntilClosing(closingTime, expiresAt)
  );

  useEffect(() => {
    setSecondsRemaining(computeSecondsUntilClosing(closingTime, expiresAt));
    const timer = setInterval(() => {
      setSecondsRemaining(computeSecondsUntilClosing(closingTime, expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [closingTime, expiresAt]);

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
