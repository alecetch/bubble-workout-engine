export function parseTimeToSeconds(
  value: string,
  _format?: "MM:SS" | "HH:MM:SS",
): number | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{3,6}$/.test(trimmed)) {
    const normalized = normalizeTimeInputValue(trimmed);
    if (normalized !== trimmed) return parseTimeToSeconds(normalized);
  }
  const parts = trimmed.split(":").map((p) => p.trim());

  if (parts.length === 2) {
    // MM:SS — minutes can exceed 59 (e.g. 85:17 for times over 1 hour)
    const [m, s] = parts.map(Number);
    if (!Number.isInteger(m) || !Number.isInteger(s)) return null;
    if (m < 0 || s < 0 || s >= 60) return null;
    const total = m * 60 + s;
    if (total <= 0) return null;
    return total;
  }

  if (parts.length === 3) {
    // HH:MM:SS
    const [h, m, s] = parts.map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(s))
      return null;
    if (h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) return null;
    const total = h * 3600 + m * 60 + s;
    if (total <= 0) return null;
    return total;
  }

  return null;
}

export const HYROX_TARGET_TIME_MIN_SECONDS = 35 * 60;
export const HYROX_TARGET_TIME_MAX_SECONDS = 4 * 60 * 60 + 30 * 60;

export function isPlausibleHyroxTargetTimeSeconds(seconds: number | null): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isFinite(seconds) &&
    seconds >= HYROX_TARGET_TIME_MIN_SECONDS &&
    seconds <= HYROX_TARGET_TIME_MAX_SECONDS
  );
}

export function normalizeTimeInputValue(value: string): string {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes(":")) return trimmed;

  const digits = trimmed.replace(/\s+/g, "");
  if (!/^\d{3,6}$/.test(digits)) return trimmed;

  if (digits.length <= 4) {
    const minutes = digits.slice(0, -2);
    const seconds = digits.slice(-2);
    const formatted = `${Number(minutes)}:${seconds.padStart(2, "0")}`;
    return parseTimeToSeconds(formatted) === null ? trimmed : formatted;
  }

  const hours = digits.slice(0, -4);
  const minutes = digits.slice(-4, -2);
  const seconds = digits.slice(-2);
  const formatted = `${Number(hours)}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
  return parseTimeToSeconds(formatted) === null ? trimmed : formatted;
}

export function formatSeconds(
  seconds: number,
  format?: "MM:SS" | "HH:MM:SS",
): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const totalSecs = Math.round(seconds);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (format === "HH:MM:SS" || h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${m}:${pad(s)}`;
}

export function isValidTimeString(value: string): boolean {
  return parseTimeToSeconds(value) !== null;
}
