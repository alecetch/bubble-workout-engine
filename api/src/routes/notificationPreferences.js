import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, safeString } from "../utils/validate.js";

export const notificationPreferencesRouter = express.Router();
notificationPreferencesRouter.use(requireAuth);

export const PUSH_TOKEN_RE = /^ExponentPushToken\[.+\]$/;
export const HHMM_RE = /^\d{2}:\d{2}$/;

function resolveUserId(req) {
  const userId = safeString(req.auth?.user_id);
  if (!userId) throw new RequestValidationError("Missing authenticated user context");
  return userId;
}

function mapError(err) {
  if (err instanceof RequestValidationError) {
    return { status: 400, code: "validation_error", message: err.message };
  }
  return { status: 500, code: "internal_error", message: publicInternalError(err) };
}

export function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidHhmm(value) {
  if (!HHMM_RE.test(value)) return false;
  const [hh, mm] = value.split(":").map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

async function ensurePreferenceRow(db, userId) {
  await db.query(
    `INSERT INTO notification_preference (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

function mapPrefRow(row) {
  if (!row) {
    return {
      reminderEnabled: true,
      reminderTimeLocalHhmm: "08:00",
      reminderTimezone: "UTC",
      prNotificationEnabled: true,
      deloadNotificationEnabled: true,
    };
  }

  return {
    reminderEnabled: Boolean(row.reminder_enabled),
    reminderTimeLocalHhmm: row.reminder_time_local_hhmm ?? "08:00",
    reminderTimezone: row.reminder_timezone ?? "UTC",
    prNotificationEnabled: Boolean(row.pr_notification_enabled),
    deloadNotificationEnabled: Boolean(row.deload_notification_enabled),
  };
}

notificationPreferencesRouter.patch("/users/me/push-token", async (req, res) => {
  const { request_id } = req;
  try {
    const userId = resolveUserId(req);
    const rawToken = req.body?.push_token;

    if (rawToken !== null && rawToken !== undefined) {
      const token = safeString(rawToken);
      if (!token || !PUSH_TOKEN_RE.test(token)) {
        throw new RequestValidationError(
          "push_token must match ExponentPushToken[...] format or be null",
        );
      }
    }

    const tokenValue = rawToken === null ? null : safeString(rawToken);

    await pool.query(
      `UPDATE app_user
       SET device_push_token = $2,
           device_push_token_updated_at = now()
       WHERE id = $1`,
      [userId, tokenValue],
    );

    await ensurePreferenceRow(pool, userId);

    return res.json({ ok: true });
  } catch (err) {
    const mapped = mapError(err);
    return res.status(mapped.status).json({
      ok: false,
      request_id,
      code: mapped.code,
      error: mapped.message,
    });
  }
});

notificationPreferencesRouter.get("/users/me/notification-preferences", async (req, res) => {
  const { request_id } = req;
  try {
    const userId = resolveUserId(req);
    const result = await pool.query(
      `SELECT * FROM notification_preference WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return res.json(mapPrefRow(result.rows[0] ?? null));
  } catch (err) {
    const mapped = mapError(err);
    return res.status(mapped.status).json({
      ok: false,
      request_id,
      code: mapped.code,
      error: mapped.message,
    });
  }
});

notificationPreferencesRouter.patch("/users/me/notification-preferences", async (req, res) => {
  const { request_id } = req;
  try {
    const userId = resolveUserId(req);
    const body = req.body ?? {};

    if (body.reminderTimeLocalHhmm !== undefined) {
      const value = safeString(body.reminderTimeLocalHhmm);
      if (!value || !isValidHhmm(value)) {
        throw new RequestValidationError(
          "reminderTimeLocalHhmm must be a valid HH:MM time (00:00-23:59)",
        );
      }
    }

    if (body.reminderTimezone !== undefined) {
      const value = safeString(body.reminderTimezone);
      if (!value || !isValidTimezone(value)) {
        throw new RequestValidationError("reminderTimezone must be a valid IANA timezone string");
      }
    }

    await ensurePreferenceRow(pool, userId);

    const sets = [];
    const values = [userId];
    const boolFields = {
      reminderEnabled: "reminder_enabled",
      prNotificationEnabled: "pr_notification_enabled",
      deloadNotificationEnabled: "deload_notification_enabled",
    };
    const textFields = {
      reminderTimeLocalHhmm: "reminder_time_local_hhmm",
      reminderTimezone: "reminder_timezone",
    };

    for (const [jsKey, dbCol] of Object.entries(boolFields)) {
      if (body[jsKey] !== undefined) {
        values.push(Boolean(body[jsKey]));
        sets.push(`${dbCol} = $${values.length}`);
      }
    }

    for (const [jsKey, dbCol] of Object.entries(textFields)) {
      if (body[jsKey] !== undefined) {
        values.push(safeString(body[jsKey]));
        sets.push(`${dbCol} = $${values.length}`);
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = now()");
      await pool.query(
        `UPDATE notification_preference
         SET ${sets.join(", ")}
         WHERE user_id = $1`,
        values,
      );
    }

    const result = await pool.query(
      `SELECT * FROM notification_preference WHERE user_id = $1 LIMIT 1`,
      [userId],
    );

    return res.json({ ok: true, preferences: mapPrefRow(result.rows[0] ?? null) });
  } catch (err) {
    const mapped = mapError(err);
    return res.status(mapped.status).json({
      ok: false,
      request_id,
      code: mapped.code,
      error: mapped.message,
    });
  }
});
