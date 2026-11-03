import { firstValidTimezone, isValidTimezone } from "../utils/timezone.js";
import { localDateInZone, offsetLocalDate } from "./trainingYear.js";
import { detectAndRecordMilestones } from "./yearMilestones.js";

export class ValidationError extends Error {
  constructor(message = "local_date must be today or yesterday in your timezone.") {
    super(message);
    this.name = "ValidationError";
    this.code = "invalid_local_date";
    this.status = 400;
  }
}

export function resolveLocalDate({ requestedLocalDate, requestedTimeZone, fallbackTimeZone, now = new Date() }) {
  const timeZone = firstValidTimezone(requestedTimeZone, fallbackTimeZone);
  const today = localDateInZone(now, timeZone);
  if (requestedLocalDate !== undefined && (
    typeof requestedLocalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(requestedLocalDate)
    || ![today, offsetLocalDate(today, -1)].includes(requestedLocalDate)
  )) throw new ValidationError();
  return { localDate: requestedLocalDate ?? today, timeZone };
}

export async function recordProgramDaySession(db, { userId, programDayId, localDate }) {
  await db.query("SELECT id FROM app_user WHERE id = $1 FOR UPDATE", [userId]);
  const result = await db.query(`INSERT INTO training_session (user_id, program_day_id, local_date, source)
    SELECT p.user_id, pd.id, $3::date, 'program_day'
    FROM program_day pd JOIN program p ON p.id = pd.program_id
    WHERE pd.id = $2 AND p.user_id = $1
      AND (pd.is_completed OR EXISTS (SELECT 1 FROM segment_exercise_log sel
        WHERE sel.program_day_id = pd.id AND sel.user_id = $1 AND sel.is_draft = false))
    ON CONFLICT (program_day_id) WHERE program_day_id IS NOT NULL DO NOTHING RETURNING id, local_date::text`, [userId, programDayId, localDate]);
  result.newMilestones = result.rows?.length ? await detectAndRecordMilestones(db, { userId, localDate }) : [];
  return result;
}

export async function removeProgramDaySessionIfUnqualified(db, { userId, programDayId }) {
  return db.query(`DELETE FROM training_session ts USING program_day pd, program p
    WHERE ts.user_id = $1 AND ts.program_day_id = $2 AND pd.id = ts.program_day_id
      AND p.id = pd.program_id AND p.user_id = $1 AND NOT pd.is_completed
      AND NOT EXISTS (SELECT 1 FROM segment_exercise_log sel
        WHERE sel.program_day_id = pd.id AND sel.user_id = $1 AND sel.is_draft = false)`, [userId, programDayId]);
}

export async function rememberTimezone(db, userId, timeZone) {
  if (isValidTimezone(timeZone)) {
    await db.query("UPDATE app_user SET timezone = $2 WHERE id = $1 AND timezone IS DISTINCT FROM $2", [userId, timeZone]);
  }
}

export async function userTrainingContext(db, userId) {
  return (await db.query(`SELECT cp.onboarding_completed_at, u.created_at, u.timezone, np.reminder_timezone
    FROM app_user u LEFT JOIN LATERAL (SELECT MIN(onboarding_completed_at) AS onboarding_completed_at
      FROM client_profile WHERE user_id = u.id) cp ON true
    LEFT JOIN notification_preference np ON np.user_id = u.id WHERE u.id = $1`, [userId])).rows[0];
}
