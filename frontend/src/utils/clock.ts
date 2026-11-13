const SIM_OFFSET_KEY = "nw_simulated_time_offset_ms";
export const NW_CLOCK_CHANGE_EVENT = "nw-clock-change";

const WIB_OFFSET_MS = 7 * 3600 * 1000;

export interface WibComponents {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getSimulatedOffsetMs(): number {
  try {
    const raw = localStorage.getItem(SIM_OFFSET_KEY);
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function isTimeSimulated(): boolean {
  try {
    const raw = localStorage.getItem(SIM_OFFSET_KEY);
    return raw !== null && Number.isFinite(Number(raw));
  } catch {
    return false;
  }
}

export function getEffectiveNow(): Date {
  return new Date(Date.now() + getSimulatedOffsetMs());
}

export function getWibComponents(date: Date = getEffectiveNow()): WibComponents {
  const wibDate = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    year: wibDate.getUTCFullYear(),
    month: wibDate.getUTCMonth() + 1,
    day: wibDate.getUTCDate(),
    hour: wibDate.getUTCHours(),
    minute: wibDate.getUTCMinutes(),
    second: wibDate.getUTCSeconds(),
  };
}

export function formatWibClock(date: Date = getEffectiveNow(), withSeconds: boolean = true): string {
  const { hour, minute, second } = getWibComponents(date);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  if (!withSeconds) {
    return `${hh}:${mm} WIB`;
  }
  const ss = String(second).padStart(2, "0");
  return `${hh}:${mm}:${ss} WIB`;
}

export function formatWibHHMM(date: Date = getEffectiveNow()): string {
  const { hour, minute } = getWibComponents(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getSimulatedTimeIsoHeader(): string | null {
  if (!isTimeSimulated()) return null;
  const { year, month, day, hour, minute, second } = getWibComponents(getEffectiveNow());
  const y = String(year).padStart(4, "0");
  const mo = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  const s = String(second).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+07:00`;
}

export function parseTimeHHMM(
  timeStr: string | undefined | null,
  fallbackH: number,
  fallbackM: number
): { hour: number; minute: number } {
  const raw = (timeStr || "").trim();
  if (!raw) return { hour: fallbackH, minute: fallbackM };
  const parts = raw.split(":");
  const parsedH = parseInt(parts[0], 10);
  const parsedM = parts.length > 1 ? parseInt(parts[1], 10) : fallbackM;
  const hour = !Number.isNaN(parsedH) && parsedH >= 0 && parsedH <= 23 ? parsedH : fallbackH;
  const minute = !Number.isNaN(parsedM) && parsedM >= 0 && parsedM <= 59 ? parsedM : fallbackM;
  return { hour, minute };
}

export function setSimulatedClockTime(hhmm: string): void {
  const { hour, minute } = parseTimeHHMM(hhmm, 12, 0);
  const realWib = getWibComponents(new Date());
  const targetUtcMs =
    Date.UTC(realWib.year, realWib.month - 1, realWib.day, hour, minute, 0, 0) - WIB_OFFSET_MS;
  const offsetMs = targetUtcMs - Date.now();
  try {
    localStorage.setItem(SIM_OFFSET_KEY, String(offsetMs));
  } catch {
    // Ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(NW_CLOCK_CHANGE_EVENT));
}

export function resetSimulatedClock(): void {
  try {
    localStorage.removeItem(SIM_OFFSET_KEY);
  } catch {
    // Ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(NW_CLOCK_CHANGE_EVENT));
}

export function parseBackendUtcMs(iso: string): number {
  const trimmed = iso.trim();
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  return new Date(hasTz ? trimmed : `${trimmed}Z`).getTime();
}

export function computeEffectiveSecondsUntilClosing(
  closingTime: string = "20:30",
  expiresAt?: string | null,
  nowDate: Date = getEffectiveNow()
): number {
  try {
    const { hour: targetH, minute: targetM } = parseTimeHHMM(closingTime, 20, 30);
    const nowWib = getWibComponents(nowDate);
    let targetUtcMs =
      Date.UTC(nowWib.year, nowWib.month - 1, nowWib.day, targetH, targetM, 0, 0) - WIB_OFFSET_MS;

    if (targetUtcMs <= nowDate.getTime()) {
      // Only treat early morning hours (00:00-05:59) as overnight closing rollover when evening
      if (targetH < 6 && nowWib.hour >= 18) {
        targetUtcMs += 24 * 3600 * 1000;
      } else {
        return 0;
      }
    }

    let diffSeconds = Math.max(0, Math.floor((targetUtcMs - nowDate.getTime()) / 1000));
    if (expiresAt) {
      const expMs = parseBackendUtcMs(expiresAt);
      if (!Number.isNaN(expMs)) {
        diffSeconds = Math.min(diffSeconds, Math.max(0, Math.floor((expMs - nowDate.getTime()) / 1000)));
      }
    }
    return diffSeconds;
  } catch {
    return 3600;
  }
}
