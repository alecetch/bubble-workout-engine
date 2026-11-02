import { firstValidTimezone } from "../utils/timezone.js";
import { userTrainingContext } from "./trainingDayLedger.js";
import { localDateInZone, targetWindow, clubThresholds, paceSummary, nextMilestone, offsetLocalDate } from "./trainingYear.js";

export async function getYearProgress(db, userId, { year, timeZone, now = new Date(), context } = {}) {
  const user = context ?? await userTrainingContext(db, userId);
  if (!user) return null;
  const zone = firstValidTimezone(timeZone, user.timezone, user.reminder_timezone);
  const today = localDateInZone(now, zone);
  const currentYear = Number(today.slice(0, 4));
  const selectedYear = year ?? currentYear;
  if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > currentYear + 1) {
    throw Object.assign(new Error("Invalid year."), { status: 400, code: "invalid_year" });
  }
  const dates = (await db.query(`SELECT DISTINCT local_date::text AS local_date FROM training_session
    WHERE user_id = $1 ORDER BY local_date`, [userId])).rows.map(row => row.local_date);
  const joinLocalDate = localDateInZone(user.onboarding_completed_at ?? user.created_at, zone);
  const datesFor = value => dates.filter(date => Number(date.slice(0, 4)) === value);
  const windowFor = value => targetWindow({ year: value, joinLocalDate });
  const window = windowFor(selectedYear);
  const trainingDates = datesFor(selectedYear);
  const clubs = clubThresholds(window.ratio).map(club => ({ ...club, reached_on: trainingDates[club.threshold - 1] ?? null }));
  const recentStart = offsetLocalDate(today, -27);
  const last28DaysCount = dates.filter(date => date >= recentStart && date <= today).length;
  const years = [...new Set([currentYear, ...dates.map(date => Number(date.slice(0, 4)))])]
    .sort((a, b) => b - a).map(value => {
      const count = datesFor(value).length;
      const yearlyWindow = windowFor(value);
      return { year: value, count, target: yearlyWindow.target,
        best_club: clubThresholds(yearlyWindow.ratio).filter(club => count >= club.threshold).at(-1)?.tier ?? null };
    });
  return { ok: true, year: selectedYear, today_local: today, count: trainingDates.length,
    target: window.target, pro_rated: window.proRated, window_start: window.start, window_end: window.end,
    ...paceSummary({ count: trainingDates.length, window, todayLocal: today, last28DaysCount }),
    clubs, next_milestone: nextMilestone(trainingDates.length), training_dates: trainingDates, years };
}
