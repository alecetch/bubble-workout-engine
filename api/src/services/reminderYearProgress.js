import { firstValidTimezone } from "../utils/timezone.js";
import { localDateInZone, targetWindow, clubThresholds, paceSummary, MILESTONES } from "./trainingYear.js";

export function reminderCalendar(user, now) {
  const zone = firstValidTimezone(user.timezone, user.reminder_timezone);
  const todayLocal = localDateInZone(now, zone);
  const year = Number(todayLocal.slice(0, 4));
  const joinLocalDate = localDateInZone(user.onboarding_completed_at ?? user.created_at, zone);
  return { todayLocal, year, window: targetWindow({ year, joinLocalDate }) };
}

// One count query for the entire job, shared by its training-day and rest-day passes.
export async function reminderYearProgress(db, users, now) {
  if (!users.length) return new Map();
  const calendars = users.map(user => reminderCalendar(user, now));
  const result = await db.query(`/* reminder_year_counts */
    SELECT u.user_id, COUNT(DISTINCT ts.local_date)::int AS count,
      COUNT(DISTINCT ts.local_date) FILTER (
        WHERE ts.local_date BETWEEN u.today - 27 AND u.today)::int AS recent_count
    FROM unnest($1::uuid[], $2::date[], $3::date[], $4::date[]) AS u(user_id, year_start, year_end, today)
    LEFT JOIN training_session ts ON ts.user_id = u.user_id
      AND ts.local_date BETWEEN u.year_start AND u.year_end
    GROUP BY u.user_id`, [users.map(user => user.user_id), calendars.map(c => `${c.year}-01-01`),
    calendars.map(c => c.window.end), calendars.map(c => c.todayLocal)]);
  const counts = new Map(result.rows.map(row => [row.user_id, row]));
  return new Map(users.map((user, i) => {
    const { todayLocal, window } = calendars[i];
    const row = counts.get(user.user_id);
    if (!row) return [user.user_id, null];
    const count = Number(row.count);
    const clubs = clubThresholds(window.ratio);
    const next = [...clubs.map(club => ({ threshold: club.threshold, displayName: `Club ${club.tier}` })),
      ...MILESTONES.map(tier => ({ threshold: tier, displayName: `Club ${tier}` }))]
      .filter(m => m.threshold > count).sort((a, b) => a.threshold - b.threshold)[0];
    return [user.user_id, { count, target: window.target, todayLocal, windowEnd: window.end,
      paceDelta: paceSummary({ count, window, todayLocal, last28DaysCount: Number(row.recent_count) }).pace_delta,
      nextMilestone: next ? { ...next, club100Threshold: clubs[0].threshold } : null,
      reachedTarget: count >= window.target }];
  }));
}
