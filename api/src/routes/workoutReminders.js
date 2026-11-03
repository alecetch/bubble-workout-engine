import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";
import { makeNotificationService } from "../services/notificationService.js";
import { choosePaceMessage, dailyReminderBody } from "../services/paceMessages.js";
import { reminderCalendar, reminderYearProgress } from "../services/reminderYearProgress.js";
import { offsetLocalDate } from "../services/trainingYear.js";

export const workoutRemindersRouter = express.Router();
const userColumns = `au.id AS user_id, au.created_at, au.timezone, np.reminder_timezone,
  cp.onboarding_completed_at, np.last_reminder_sent_date::text, np.last_pace_message_sent_on::text`;
const userJoins = `LEFT JOIN notification_preference np ON np.user_id = au.id
  LEFT JOIN LATERAL (SELECT MIN(onboarding_completed_at) AS onboarding_completed_at
    FROM client_profile WHERE user_id = au.id) cp ON true`;

export function createWorkoutRemindersHandler(db = pool, notificationService = makeNotificationService(db), { now = () => new Date() } = {}) {
  return async function workoutRemindersHandler(req, res) {
    try {
      // Scheduled-day selection intentionally uses the server date. Local scheduling is a separate change.
      const training = await db.query(`/* reminder_training_candidates */
        SELECT DISTINCT ON (au.id) ${userColumns}, pd.day_label, pd.id AS program_day_id
        FROM program_calendar_day pcd JOIN program p ON p.id = pcd.program_id
        JOIN app_user au ON au.id = p.user_id ${userJoins}
        JOIN program_day pd ON pd.id = pcd.program_day_id
        WHERE pcd.scheduled_date = CURRENT_DATE AND pcd.is_training_day = TRUE
          AND pd.is_completed = FALSE
          AND COALESCE(np.reminder_enabled, TRUE)
          AND (au.device_push_token IS NOT NULL OR au.email IS NOT NULL)
        ORDER BY au.id, pd.id`);
      const rest = await db.query(`/* reminder_rest_candidates */
        SELECT ${userColumns} FROM app_user au ${userJoins}
        WHERE COALESCE(np.reminder_enabled, TRUE)
          AND (au.device_push_token IS NOT NULL OR au.email IS NOT NULL)
          AND EXISTS (SELECT 1 FROM program p WHERE p.user_id = au.id AND p.status = 'active')
          AND NOT EXISTS (SELECT 1 FROM program_calendar_day pcd JOIN program p ON p.id = pcd.program_id
            WHERE p.user_id = au.id AND pcd.scheduled_date = CURRENT_DATE AND pcd.is_training_day = TRUE)`);
      const instant = now();
      const candidates = [...new Map([...rest.rows, ...training.rows].map(row => [row.user_id, row])).values()]
        .filter(row => {
          const today = reminderCalendar(row, instant).todayLocal;
          return !row.last_reminder_sent_date || row.last_reminder_sent_date < today;
        });
      const progress = await reminderYearProgress(db, candidates, instant);
      const trainingIds = new Set(training.rows.map(row => row.user_id));
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
            emailSubject: title, emailText: title === body ? body : `${title}\n\n${body}`,
            isReminder: true, isPaceMessage: Boolean(pace),
          });
          // The shared service atomically reserves both dates before delivery, across all notification kinds.
          if (result?.sent === false) { if (result.reason === "delivery_failed") failed++; continue; }
          sent++;
          if (pace) paceSent++;
        } catch (err) {
          failed++;
          req.log?.warn?.({ event: "notification.reminder.error", err: err?.message, user_id: row.user_id }, "Workout reminder send failed");
        }
      }
      return res.json({ ok: true, eligible, sent, failed, pace_sent: paceSent });
    } catch (err) {
      req.log?.error?.({ event: "notification.reminder.route.error", err: err?.message }, "Workout reminders route failed");
      return res.status(500).json({ ok: false, request_id: req.request_id, code: "internal_error", error: "Failed to send workout reminders" });
    }
  };
}

workoutRemindersRouter.post("/internal/send-workout-reminders", requireInternalToken, createWorkoutRemindersHandler(pool));
