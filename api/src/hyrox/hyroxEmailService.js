import { sendEmail } from "../services/emailService.js";

export async function createEmailLogEntry(submissionId, db) {
  const result = await db.query(
    "INSERT INTO hyrox_email_log (submission_id, status) VALUES ($1, 'queued') RETURNING id",
    [submissionId],
  );
  return result.rows[0]?.id ?? null;
}

export async function sendHyroxEmail(submission, emailReport, db, log = console, existingLogId = null) {
  const logId = existingLogId;
  try {
    await sendEmail({
      to: submission.email,
      subject: emailReport.emailSubject,
      html: emailReport.emailHtml,
      text: emailReport.emailText,
    });

    if (logId) {
      await db.query(
        "UPDATE hyrox_email_log SET status = 'sent', sent_at = now() WHERE id = $1",
        [logId],
      );
    }
    return { status: "sent", logId };
  } catch (err) {
    if (logId) {
      await db.query(
        "UPDATE hyrox_email_log SET status = 'failed', error_message = $2 WHERE id = $1",
        [logId, err?.message ?? "Email failed"],
      ).catch((dbErr) => log.warn?.({ event: "hyrox.email_log_update_failed", err: dbErr?.message }, "Failed to update HYROX email log"));
    }
    log.warn?.({ event: "hyrox.email_failed", submissionId: submission.id, err: err?.message }, "HYROX email failed");
    return { status: "failed", error: err?.message ?? "Email failed", logId };
  }
}
