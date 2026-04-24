import { pool } from "../db.js";
import { makeNotificationService } from "./notificationService.js";

export async function maybeSendPhysiqueNudge(db, userId) {
  const notifier = makeNotificationService(db ?? pool);

  try {
    const r = await (db ?? pool).query(
      `
      WITH last_check_in AS (
        SELECT submitted_at
        FROM physique_check_in
        WHERE user_id = $1
        ORDER BY submitted_at DESC
        LIMIT 1
      ),
      sessions_since AS (
        SELECT COUNT(*) AS cnt
        FROM program_calendar_day pcd
        JOIN program p ON p.id = pcd.program_id
        JOIN program_day pd ON pd.id = pcd.program_day_id
        WHERE p.user_id = $1
          AND pd.is_completed = TRUE
          AND pd.updated_at > COALESCE(
            (SELECT submitted_at FROM last_check_in),
            now() - INTERVAL '90 days'
          )
      )
      SELECT
        (SELECT submitted_at FROM last_check_in) AS last_check_in_at,
        (SELECT cnt FROM sessions_since) AS sessions_since_last,
        u.physique_consent_at
      FROM app_user u
      WHERE u.id = $1
      `,
      [userId],
    );

    const row = r.rows[0];
    if (!row) return;
    if (!row.physique_consent_at) return;
    if (
      row.last_check_in_at &&
      new Date(row.last_check_in_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ) return;
    if (Number(row.sessions_since_last) < 2) return;

    await notifier.send({
      userId,
      title: "How are you looking? \ud83d\udcf7",
      body: "Your weekly physique check-in is ready. See how your training is paying off.",
      data: { screen: "PhysiqueCheckIn" },
      emailSubject: "Weekly physique check-in ready",
      emailText: "Log in to Formai to take your weekly physique check-in and see your AI-powered progress assessment.",
    });
  } catch {
    // Non-fatal
  }
}
