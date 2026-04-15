import { sendEmail } from "./emailService.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NON_RETRIABLE_EXPO_ERRORS = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
]);

export function makeNotificationService(db) {
  async function send({ userId, title, body, data, emailSubject, emailText, emailHtml }) {
    try {
      const userR = await db.query(
        `SELECT device_push_token, email FROM app_user WHERE id = $1`,
        [userId],
      );
      const user = userR.rows[0];
      if (!user) return;

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
        }).catch((emailErr) => {
          console.warn("[notificationService] Email fallback error:", emailErr?.message);
        });
      }
    } catch (err) {
      console.warn("[notificationService] send() error:", err?.message);
    }
  }

  return { send };
}
