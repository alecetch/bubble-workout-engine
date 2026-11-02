export function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function firstValidTimezone(...zones) {
  return zones.find(isValidTimezone) ?? "UTC";
}
