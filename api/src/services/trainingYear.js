import { firstValidTimezone } from "../utils/timezone.js";

export const BASE_TARGET = 200;
export const CLUB_TIERS = Object.freeze([100, 200, 250, 300]);
export const MILESTONES = Object.freeze([1, 25, 50, 100, 150, 200, 250, 300]);
export const ON_PACE_TOLERANCE = 1;
const DAY_MS = 86_400_000;
const dayNumber = iso => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

export function localDateInZone(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: firstValidTimezone(timeZone), year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(instant));
  const value = type => parts.find(part => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function daysInYear(year) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
}

export function dayOfYear(isoDate) {
  return dayNumber(isoDate) - dayNumber(`${isoDate.slice(0, 4)}-01-01`) + 1;
}

export function targetWindow({ year, joinLocalDate }) {
  const startOfYear = `${year}-01-01`;
  const end = `${year}-12-31`;
  const start = joinLocalDate > startOfYear ? joinLocalDate : startOfYear;
  const ratio = start > end ? 0 : (dayNumber(end) - dayNumber(start) + 1) / daysInYear(year);
  return { start, end, target: Math.round(BASE_TARGET * ratio), proRated: ratio < 1, ratio };
}

export function clubThresholds(ratio) {
  return CLUB_TIERS.map(tier => ({ tier, threshold: Math.max(1, Math.round(tier * ratio)) }));
}

export function expectedCountAtDate(window, todayLocal) {
  const length = Math.max(0, dayNumber(window.end) - dayNumber(window.start) + 1);
  const elapsed = Math.max(0, Math.min(length, dayNumber(todayLocal) - dayNumber(window.start) + 1));
  return length ? window.target * elapsed / length : 0;
}

export function paceSummary({ count, window, todayLocal, last28DaysCount }) {
  const expected = expectedCountAtDate(window, todayLocal);
  const delta = count - expected;
  const daysLeft = Math.max(0, dayNumber(window.end) - Math.max(dayNumber(todayLocal), dayNumber(window.start) - 1));
  return {
    expected_to_date: Number(expected.toFixed(1)),
    pace_delta: Number(delta.toFixed(1)),
    pace_status: Math.abs(delta) < ON_PACE_TOLERANCE ? "on_pace" : delta > 0 ? "ahead" : "behind",
    projected_year_end: count + Math.round(last28DaysCount / 28 * daysLeft),
  };
}

export function nextMilestone(count) {
  return MILESTONES.find(value => value > count) ?? null;
}

export function offsetLocalDate(isoDate, days) {
  return new Date((dayNumber(isoDate) + days) * DAY_MS).toISOString().slice(0, 10);
}
