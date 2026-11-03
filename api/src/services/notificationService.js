import { sendEmail } from "./emailService.js";
import { firstValidTimezone } from "../utils/timezone.js";
import { localDateInZone } from "./trainingYear.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NON_RETRIABLE_EXPO_ERRORS = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
]);

export function makeNotificationService(db, { now = () => new Date() } = {}) {
  async function send({ userId, title, body, data, emailSubject, emailText, emailHtml, isReminder = false, isPaceMessage = false }) {
    try {
      const userR = await db.query(
        `SELECT au.device_push_token, au.email, au.timezone, np.reminder_timezone
         FROM app_user au LEFT JOIN notification_preference np ON np.user_id = au.id WHERE au.id = $1`,
        [userId],
      );
      const user = userR.rows[0];
      if (!user || (!user.device_push_token && !(emailText && user.email))) return { sent: false, reason: "no_channel" };
      const today = localDateInZone(now(), firstValidTimezone(user.timezone, user.reminder_timezone));
      // Reserve before delivery: concurrent jobs and PR/deload/physique alerts share one daily slot.
      // Keep the reservation after failure; retrying an ambiguous push could send twice.
      const claimed = await db.query(`INSERT INTO notification_preference
          (user_id, last_reminder_sent_date, last_pace_message_sent_on)
        VALUES ($1, $2::date, CASE WHEN $3 THEN $2::date ELSE NULL END)
        ON CONFLICT (user_id) DO UPDATE SET last_reminder_sent_date = $2::date,
          last_pace_message_sent_on = CASE WHEN $3 THEN $2::date ELSE notification_preference.last_pace_message_sent_on END,
          updated_at = now()
        WHERE (notification_preference.last_reminder_sent_date IS NULL OR notification_preference.last_reminder_sent_date < $2::date)
          AND (NOT $4 OR notification_preference.reminder_enabled)
          AND (NOT $3 OR notification_preference.last_pace_message_sent_on IS NULL
            OR notification_preference.last_pace_message_sent_on <= $2::date - 7)
        RETURNING user_id`, [userId, today, isPaceMessage, isReminder]);
      if (!claimed.rows.length) return { sent: false, reason: "capped_or_disabled" };

      let pushSucceeded = false;

      if (user.device_push_token) {
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              to: user.device_push_token,
              title,
              body,
              data: data ?? {},
              sound: "default",
            }),
          });

          const json = await res.json().catch(() => ({}));
          const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
          const status = ticket?.status;
          const expoError = ticket?.details?.error ?? ticket?.message ?? null;

          if (status === "ok") {
            pushSucceeded = true;
          } else if (expoError && NON_RETRIABLE_EXPO_ERRORS.has(expoError)) {
            await db.query(
              `UPDATE app_user
               SET device_push_token = NULL,
                   device_push_token_updated_at = now()
               WHERE id = $1`,
              [userId],
            ).catch(() => {});
          }
        } catch (pushErr) {
          console.warn("[notificationService] Expo push error:", pushErr?.message);
        }
      }

      if (!pushSucceeded && emailText && user.email) {
        await sendEmail({
          to: user.email,
          subject: emailSubject ?? title,
          text: emailText,
          html: emailHtml,
        });
        return { sent: true };
      }
      return { sent: pushSucceeded, reason: pushSucceeded ? undefined : "delivery_failed" };
    } catch (err) {
      console.warn("[notificationService] send() error:", err?.message);
      return { sent: false, reason: "delivery_failed" };
    }
  }

  return { send };
}
