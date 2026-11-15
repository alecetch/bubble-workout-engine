import { makeNotificationService } from "./notificationService.js";
import { choosePaceMessage, dailyReminderBody } from "./paceMessages.js";
import { reminderCalendar, reminderYearProgress } from "./reminderYearProgress.js";
import { offsetLocalDate } from "./trainingYear.js";
import { reminderDue } from "./reminderSchedule.js";

const userColumns = `au.id AS user_id, au.created_at, au.timezone, np.reminder_timezone, np.reminder_time_local_hhmm,
  cp.onboarding_completed_at, np.last_reminder_sent_date::text, np.last_pace_message_sent_on::text`;
const userJoins = `LEFT JOIN notification_preference np ON np.user_id = au.id
  LEFT JOIN LATERAL (SELECT MIN(onboarding_completed_at) AS onboarding_completed_at
    FROM client_profile WHERE user_id = au.id) cp ON true`;

export async function runWorkoutReminders(db, notificationService, { now = () => new Date(), log = () => {} } = {}) {
  const training = await db.query(`/* reminder_training_candidates */
    SELECT DISTINCT ON (au.id, pcd.scheduled_date) ${userColumns}, pcd.scheduled_date::text AS scheduled_date, pd.day_label, pd.id AS program_day_id
    FROM program_calendar_day pcd JOIN program p ON p.id = pcd.program_id
    JOIN app_user au ON au.id = p.user_id ${userJoins}
    JOIN program_day pd ON pd.id = pcd.program_day_id
    WHERE pcd.scheduled_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1 AND pcd.is_training_day = TRUE
      AND pd.is_completed = FALSE
      AND COALESCE(np.reminder_enabled, TRUE)
      AND au.device_push_token IS NOT NULL
    ORDER BY au.id, pcd.scheduled_date, pd.id`);
  const rest = await db.query(`/* reminder_rest_candidates */
    SELECT ${userColumns}, ARRAY(SELECT pcd.scheduled_date::text
        FROM program_calendar_day pcd JOIN program p ON p.id = pcd.program_id
        WHERE p.user_id = au.id AND pcd.is_training_day = TRUE
          AND pcd.scheduled_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1) AS training_dates
    FROM app_user au ${userJoins}
    WHERE COALESCE(np.reminder_enabled, TRUE)
      AND au.device_push_token IS NOT NULL
      AND EXISTS (SELECT 1 FROM program p WHERE p.user_id = au.id AND p.status = 'active')`);
  const instant = now();
  const localTraining = new Map();
  for (const row of training.rows) {
    if (row.scheduled_date === reminderCalendar(row, instant).todayLocal && !localTraining.has(row.user_id)) {
      localTraining.set(row.user_id, row);
    }
  }
  const localRest = rest.rows.filter(row => !(row.training_dates ?? []).includes(reminderCalendar(row, instant).todayLocal));
  const candidatesBeforeTime = [...new Map([...localRest, ...localTraining.values()].map(row => [row.user_id, row])).values()]
    .filter(row => {
      const today = reminderCalendar(row, instant).todayLocal;
      return !row.last_reminder_sent_date || row.last_reminder_sent_date < today;
    });
  const candidates = candidatesBeforeTime.filter(row => reminderDue(row, instant));
  const not_due = candidatesBeforeTime.length - candidates.length;
  const progress = await reminderYearProgress(db, candidates, instant);
  const trainingIds = new Set(localTraining.keys());
  let eligible = 0, sent = 0, failed = 0, paceSent = 0;
  for (const row of candidates) {
    const year = progress.get(row.user_id);
    const today = year?.todayLocal ?? reminderCalendar(row, instant).todayLocal;
    const paceDue = !row.last_pace_message_sent_on || row.last_pace_message_sent_on <= offsetLocalDate(today, -7);
    const pace = year && paceDue ? choosePaceMessage(year) : null;
    const isTrainingDay = trainingIds.has(row.user_id);
    if (!isTrainingDay && !pace) continue;
    eligible++;
    const title = pace?.title ?? "Time to train";
    const body = isTrainingDay ? dailyReminderBody({ dayLabel: row.day_label, count: year?.count }) : pace.body;
    try {
      const result = await notificationService.send({ userId: row.user_id, title, body,
        data: isTrainingDay ? { event: "reminder", programDayId: row.program_day_id } : { event: "pace_nudge" },
        isReminder: true, isPaceMessage: Boolean(pace),
      });
      // The shared service atomically reserves both dates before delivery, across all notification kinds.
      if (result?.sent === false) { if (result.reason === "delivery_failed") failed++; continue; }
      sent++;
      if (pace) paceSent++;
    } catch (err) {
      failed++;
      log({ event: "notification.reminder.error", err: err?.message, user_id: row.user_id }, "Workout reminder send failed");
    }
  }
  return { eligible, sent, failed, pace_sent: paceSent, not_due };
}

export function shouldStartReminderScheduler(env = process.env) {
  return env.REMINDER_SCHEDULER_ENABLED === "true";
}

export function startWorkoutReminderScheduler({ db, notificationService = makeNotificationService(db),
  intervalMs = Number(process.env.REMINDER_SCHEDULER_INTERVAL_MS) || 300000,
  logger, now = () => new Date() }) {
  let running = false;
  let stopped = false;
  async function tick() {
    if (running || stopped) return;
    running = true;
    let client;
    let locked = false;
    const started = Date.now();
    try {
      client = await db.connect();
      const result = await client.query("SELECT pg_try_advisory_lock(hashtext('workout-reminders')::bigint) AS locked");
      locked = result.rows[0]?.locked === true;
      if (!locked) return;
      const counts = await runWorkoutReminders(db, notificationService, { now,
        log: (...args) => logger?.warn?.(...args),
      });
      logger?.info?.({ event: "notification.reminder.run", ...counts, duration_ms: Date.now() - started });
    } catch (err) {
      logger?.error?.({ event: "notification.reminder.run_error", err: err?.message });
    } finally {
      try {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('workout-reminders')::bigint)").catch(() => {});
      } finally {
        client?.release();
        running = false;
      }
    }
  }
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return { stop() { stopped = true; clearInterval(timer); }, tick, intervalMs };
}
