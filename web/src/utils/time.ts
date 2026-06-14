export function parseTimeToSeconds(
  value: string,
  _format?: "MM:SS" | "HH:MM:SS",
): number | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
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
