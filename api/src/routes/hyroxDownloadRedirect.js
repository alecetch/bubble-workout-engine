import express from "express";
import { safeLogCalculatorEvent } from "../hyrox/sharePack/eventLogger.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createHyroxDownloadRedirectRouter(db, deps = {}) {
  const router = express.Router();
  const logCalculatorEvent = deps.logCalculatorEvent ?? ((event) => safeLogCalculatorEvent(db, event));

  router.get("/:submissionId", async (req, res) => {
    const { submissionId } = req.params;
    if (UUID_RE.test(submissionId)) {
      await logCalculatorEvent({
        sessionId: `email-${submissionId}`,
        submissionId,
        eventName: "app_download_clicked",
        metadata: { touchpoint: "email" },
      }).catch((err) => {
        req.log?.warn?.({ event: "hyrox.download_redirect_event_failed", err: err?.message }, "HYROX download redirect event logging failed");
      });
    }
    return res.redirect(302, "/download");
  });

  return router;
}
