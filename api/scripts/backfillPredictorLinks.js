import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

export async function backfillPredictorLinks(db = pool, log = console) {
  const submissions = await db.query("SELECT id, email, created_at FROM hyrox_submissions WHERE linked_predictor_submission_id IS NULL");
  let linkedCount = 0;
  for (const submission of submissions.rows ?? []) {
    const match = await db.query(
      `SELECT id FROM hyrox_predictor_submissions
       WHERE email = $1
         AND research_consent = true
         AND created_at < $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [submission.email, submission.created_at],
    );
    const predictorSubmissionId = match.rows?.[0]?.id;
    if (!predictorSubmissionId) continue;
    const updated = await db.query(
      `UPDATE hyrox_submissions
       SET linked_predictor_submission_id = $1
       WHERE id = $2
         AND linked_predictor_submission_id IS NULL`,
      [predictorSubmissionId, submission.id],
    );
    linkedCount += updated.rowCount ?? 0;
  }
  log.info?.({ event: "hyrox_predictor.backfill_links_complete", linkedCount }, `Linked ${linkedCount} HYROX submissions to predictor submissions`);
  return { scannedCount: submissions.rows?.length ?? 0, linkedCount };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  backfillPredictorLinks()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exitCode = 1;
    });
}
