import { sendEmail } from "../services/emailService.js";

export async function createPredictorEmailLogEntry(predictorSubmissionId, db) {
  const result = await db.query(
    "INSERT INTO hyrox_predictor_email_log (predictor_submission_id, status) VALUES ($1, 'queued') RETURNING id",
    [predictorSubmissionId],
  );
  return result.rows[0]?.id ?? null;
}

export async function sendPredictorEmail(predictorSubmission, emailContent, db, log = console, existingLogId = null, sender = sendEmail) {
  const logId = existingLogId;
  try {
    await sender({ to: predictorSubmission.email, subject: emailContent.subject, html: emailContent.html, text: emailContent.text });
    if (logId) await db.query("UPDATE hyrox_predictor_email_log SET status = 'sent', sent_at = now() WHERE id = $1", [logId]);
    return { status: "sent", logId };
  } catch (err) {
    if (logId) {
      await db.query(
        "UPDATE hyrox_predictor_email_log SET status = 'failed', error_message = $2 WHERE id = $1",
        [logId, err?.message ?? "Email failed"],
      ).catch((dbErr) => log.warn?.({ event: "hyrox_predictor.email_log_update_failed", err: dbErr?.message }, "Failed to update HYROX predictor email log"));
    }
    log.warn?.({ event: "hyrox_predictor.email_failed", submissionId: predictorSubmission.id, err: err?.message }, "HYROX predictor email failed");
    return { status: "failed", error: err?.message ?? "Email failed", logId };
  }
}
