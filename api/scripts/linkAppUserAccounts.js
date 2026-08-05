import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

async function linkRowsForTable(db, tableName) {
  const candidates = await db.query(
    `SELECT id, email FROM ${tableName}
     WHERE app_link_consent = true
       AND linked_app_user_id IS NULL`,
  );
  let linkedCount = 0;

  for (const row of candidates.rows ?? []) {
    const match = await db.query(
      `SELECT id FROM app_user
       WHERE email IS NOT NULL
         AND lower(email) = lower($1)
       LIMIT 1`,
      [row.email],
    );
    const appUserId = match.rows?.[0]?.id;
    if (!appUserId) continue;

    const updated = await db.query(
      `UPDATE ${tableName}
       SET linked_app_user_id = $1
       WHERE id = $2
         AND linked_app_user_id IS NULL`,
      [appUserId, row.id],
    );
    linkedCount += updated.rowCount ?? 0;
  }

  return linkedCount;
}

export async function linkAppUserAccounts(db = pool, log = console) {
  const submissionsLinked = await linkRowsForTable(db, "hyrox_submissions");
  const predictorSubmissionsLinked = await linkRowsForTable(db, "hyrox_predictor_submissions");
  log.info?.(
    {
      event: "hyrox_app_identity.link_complete",
      submissionsLinked,
      predictorSubmissionsLinked,
    },
    `Linked ${submissionsLinked} HYROX submissions and ${predictorSubmissionsLinked} HYROX predictor submissions to app users`,
  );
  return { submissionsLinked, predictorSubmissionsLinked };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  linkAppUserAccounts()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exitCode = 1;
    });
}
