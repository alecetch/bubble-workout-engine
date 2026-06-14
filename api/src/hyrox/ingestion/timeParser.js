const NULLISH_TIME_VALUES = new Set(["", "na", "n/a", "null", "--", "-"]);

export function parseTimeToSeconds(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;

  const value = String(rawValue).trim();
  if (NULLISH_TIME_VALUES.has(value.toLowerCase())) return null;

  const parts = value.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (parts.some((part) => !/^\d+$/.test(part))) return null;

  const nums = parts.map((part) => Number.parseInt(part, 10));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = nums;
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = nums;
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatSecondsToTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.trunc(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, "0");
  if (h <= 0) return `${m}:${ss}`;
  return `${h}:${String(m).padStart(2, "0")}:${ss}`;
}
