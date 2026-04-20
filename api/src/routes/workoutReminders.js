import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";
import { makeNotificationService } from "../services/notificationService.js";

export const workoutRemindersRouter = express.Router();

export function createWorkoutRemindersHandler(
  db = pool,
  notificationService = makeNotificationService(db),
) {
  return async function workoutRemindersHandler(req, res) {
    const { request_id } = req;
    try {
      const eligibleR = await db.query(
        `
        SELECT
          au.id AS user_id,
          pd.day_label,
          pd.id AS program_day_id
        FROM program_calendar_day pcd
        JOIN program p
          ON p.id = pcd.program_id
        JOIN app_user au
          ON au.id = p.user_id
        LEFT JOIN notification_preference np
          ON np.user_id = au.id
        LEFT JOIN program_day pd
          ON pd.id = pcd.program_day_id
        WHERE pcd.scheduled_date = CURRENT_DATE
          AND pcd.is_training_day = TRUE
          AND pd.is_completed = FALSE
          AND (np.reminder_enabled IS NULL OR np.reminder_enabled = TRUE)
          AND (au.device_push_token IS NOT NULL OR au.email IS NOT NULL)
          AND (np.last_reminder_sent_date IS NULL OR np.last_reminder_sent_date <> CURRENT_DATE)
        ORDER BY au.id
        `,
      );

      let sent = 0;
      let failed = 0;

      for (const row of eligibleR.rows) {
        try {
          const dayLabel = row.day_label || "workout";
          await notificationService.send({
            userId: row.user_id,
            title: "Time to train",
            body: `Your ${dayLabel} session is ready. Get it done.`,
            data: { event: "reminder", programDayId: row.program_day_id },
            emailSubject: row.day_label ? `Your ${row.day_label} workout is ready` : "Your workout is ready",
            emailText: [
              `Time to train.`,
              ``,
              `Your ${dayLabel} session is ready. Get it done.`,
            ].join("\n"),
          });

          await db.query(
            `
            INSERT INTO notification_preference (user_id, last_reminder_sent_date)
            VALUES ($1, CURRENT_DATE)
            ON CONFLICT (user_id)
            DO UPDATE SET
              last_reminder_sent_date = CURRENT_DATE,
              updated_at = now()
            `,
            [row.user_id],
          );

          sent += 1;
        } catch (err) {
          failed += 1;
          req.log?.warn?.(
            { event: "notification.reminder.error", err: err?.message, user_id: row.user_id },
            "Workout reminder send failed",
          );
        }
      }

      return res.json({
        ok: true,
        eligible: eligibleR.rows.length,
        sent,
        failed,
      });
    } catch (err) {
      req.log?.error?.(
        { event: "notification.reminder.route.error", err: err?.message },
        "Workout reminders route failed",
      );
      return res.status(500).json({
        ok: false,
        request_id,
        code: "internal_error",
        error: "Failed to send workout reminders",
      });
    }
  };
}

const handler = createWorkoutRemindersHandler(pool);
workoutRemindersRouter.post("/internal/send-workout-reminders", requireInternalToken, handler);
