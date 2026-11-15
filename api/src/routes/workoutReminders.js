import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";
import { makeNotificationService } from "../services/notificationService.js";
import { runWorkoutReminders } from "../services/workoutReminderJob.js";

export const workoutRemindersRouter = express.Router();

export function createWorkoutRemindersHandler(db = pool, notificationService = makeNotificationService(db), opts = {}) {
  return async function workoutRemindersHandler(req, res) {
    try {
      const counts = await runWorkoutReminders(db, notificationService, { ...opts,
        log: (...args) => req.log?.warn?.(...args),
      });
      return res.json({ ok: true, ...counts });
    } catch (err) {
      req.log?.error?.({ event: "notification.reminder.route.error", err: err?.message }, "Workout reminders route failed");
      return res.status(500).json({ ok: false, request_id: req.request_id, code: "internal_error", error: "Failed to send workout reminders" });
    }
  };
}

workoutRemindersRouter.post("/internal/send-workout-reminders", requireInternalToken, createWorkoutRemindersHandler(pool));
