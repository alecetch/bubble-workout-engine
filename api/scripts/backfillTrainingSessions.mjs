import { pathToFileURL } from "node:url";
import { pool } from "../src/db.js";
import { firstValidTimezone } from "../src/utils/timezone.js";
import { localDateInZone } from "../src/services/trainingYear.js";

// Keyset pagination keeps memory bounded. Each user's rows and timestamps commit together.
export async function backfillTrainingSessions(db, { dryRun = false, batchSize = 100 } = {}) {
  const totals = { users: 0, sessions: 0, completedTimestamps: 0, dryRun };
  let cursor = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const users = (await db.query(`SELECT u.id, u.timezone, np.reminder_timezone FROM app_user u
      LEFT JOIN notification_preference np ON np.user_id = u.id
      WHERE u.id > $1 ORDER BY u.id LIMIT $2`, [cursor, batchSize])).rows;
    if (!users.length) break;
    for (const user of users) {
      const client = typeof db.connect === "function" ? await db.connect() : db;
      try {
        await client.query("BEGIN");
        const zone = firstValidTimezone(user.timezone, user.reminder_timezone);
        const days = (await client.query(`SELECT pd.id, pd.is_completed, pd.completed_at,
            pd.scheduled_date::text AS scheduled_date, logs.first_log, logs.last_log,
            EXISTS (SELECT 1 FROM training_session ts WHERE ts.user_id = $1 AND ts.program_day_id = pd.id) AS has_session
          FROM program_day pd JOIN program p ON p.id = pd.program_id
          LEFT JOIN LATERAL (SELECT MIN(sel.created_at) AS first_log, MAX(sel.created_at) AS last_log
            FROM segment_exercise_log sel WHERE sel.program_day_id = pd.id AND sel.user_id = $1 AND sel.is_draft = false) logs ON true
          WHERE p.user_id = $1 AND (pd.is_completed OR logs.first_log IS NOT NULL)
          ORDER BY pd.id FOR UPDATE OF pd`, [user.id])).rows;
        if (days.length) totals.users++;
        for (const day of days) {
          const date = day.first_log ? localDateInZone(day.first_log, zone) : day.scheduled_date;
          if (dryRun) {
            totals.sessions += day.has_session ? 0 : 1;
            totals.completedTimestamps += day.is_completed && !day.completed_at && day.last_log ? 1 : 0;
            continue;
          }
          const inserted = await client.query(`INSERT INTO training_session (user_id, program_day_id, local_date, source)
            VALUES ($1, $2, $3, 'program_day')
            ON CONFLICT (program_day_id) WHERE program_day_id IS NOT NULL DO NOTHING`, [user.id, day.id, date]);
          totals.sessions += inserted.rowCount;
          if (day.is_completed && !day.completed_at && day.last_log) {
            const updated = await client.query(`UPDATE program_day pd SET completed_at = $3 FROM program p
              WHERE pd.id = $2 AND pd.program_id = p.id AND p.user_id = $1 AND pd.completed_at IS NULL`, [user.id, day.id, day.last_log]);
            totals.completedTimestamps += updated.rowCount;
          }
        }
        await client.query(dryRun ? "ROLLBACK" : "COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        if (client !== db) client.release();
      }
    }
    cursor = users.at(-1).id;
  }
  return totals;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const unknown = process.argv.slice(2).filter(arg => arg !== "--dry-run");
    if (unknown.length) throw new Error(`Unknown option: ${unknown[0]}`);
    console.log(JSON.stringify(await backfillTrainingSessions(pool, { dryRun: process.argv.includes("--dry-run") })));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
