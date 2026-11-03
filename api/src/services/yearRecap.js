import { firstValidTimezone } from "../utils/timezone.js";
import { userTrainingContext } from "./trainingDayLedger.js";
import { getYearProgress } from "./yearProgress.js";
import { localDateInZone, offsetLocalDate, expectedCountAtDate } from "./trainingYear.js";
import { countYearPersonalRecords } from "./personalRecords.js";

export function bestMonth(dates) {
  const counts = Array(12).fill(0);
  for (const date of new Set(dates)) counts[Number(date.slice(5, 7)) - 1]++;
  const count = Math.max(...counts);
  return count ? { month: counts.indexOf(count) + 1, count } : null;
}

export function busiestWeekday(dates) {
  // Monday wins ties, followed by the rest of the ISO week.
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const counts = Array(7).fill(0);
  for (const date of new Set(dates)) counts[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]++;
  const count = Math.max(...counts);
  return count ? names[counts.indexOf(count)] : null;
}

export function longestOnPaceWeeks({ dates, window, throughDate = window.end }) {
  const sorted = [...new Set(dates)].filter(date => date >= window.start && date <= window.end).sort();
  if (!sorted.length || window.start > window.end) return 0;
  let sunday = offsetLocalDate(window.start, (7 - new Date(`${window.start}T00:00:00Z`).getUTCDay()) % 7);
  let index = 0, run = 0, best = 0;
  while (sunday >= window.start) {
    const end = sunday > window.end ? window.end : sunday;
    if (end > throughDate) break; // A live recap does not count an unfinished ISO week.
    while (index < sorted.length && sorted[index] <= end) index++;
    run = index >= expectedCountAtDate(window, end) ? run + 1 : 0;
    best = Math.max(best, run);
    if (end === window.end) break;
    sunday = offsetLocalDate(sunday, 7);
  }
  return best;
}

export async function getYearRecap(db, userId, { year, timeZone, now = new Date() } = {}) {
  const context = await userTrainingContext(db, userId);
  if (!context) throw Object.assign(new Error("No training year."), { status: 404, code: "no_year" });
  const zone = firstValidTimezone(timeZone, context.timezone, context.reminder_timezone);
  const today = localDateInZone(now, zone);
  const currentYear = Number(today.slice(0, 4));
  const selected = year ?? currentYear;
  if (!Number.isInteger(selected) || selected < 2000 || selected > currentYear) throw Object.assign(new Error("Invalid year."), { status: 400, code: "invalid_year" });
  const joined = localDateInZone(context.onboarding_completed_at ?? context.created_at, zone);
  if (selected < Number(joined.slice(0, 4))) throw Object.assign(new Error("No training year."), { status: 404, code: "no_year" });
  if (selected === currentYear && today < `${selected}-12-28`) throw Object.assign(new Error("Your recap is available from 28 December."), { status: 404, code: "recap_not_ready" });
  const progress = await getYearProgress(db, userId, { year: selected, timeZone: zone, now, context });
  const dates = progress.training_dates;
  const sessions = (await db.query(`SELECT COUNT(*)::int AS count FROM training_session
    WHERE user_id = $1 AND local_date BETWEEN $2::date AND $3::date`, [userId, `${selected}-01-01`, `${selected}-12-31`])).rows[0].count;
  const personalRecords = await countYearPersonalRecords(db, userId, selected);
  return { ok: true, year: selected, count: progress.count, target: progress.target, pro_rated: progress.pro_rated,
    best_club: progress.years.find(row => row.year === selected)?.best_club ?? null,
    best_month: bestMonth(dates), busiest_weekday: busiestWeekday(dates),
    longest_on_pace_weeks: longestOnPaceWeeks({ dates, window: { start: progress.window_start, end: progress.window_end, target: progress.target }, throughDate: today }),
    sessions_count: sessions, personal_records_count: personalRecords, first_training_date: dates[0] ?? null,
    milestones: progress.milestones.map(({ slug, reached_on }) => ({ slug, reached_on })),
    training_dates: dates, today_local: today, window_start: progress.window_start, window_end: progress.window_end };
}
