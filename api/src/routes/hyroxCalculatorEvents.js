import express from "express";
import { logCalculatorEvent } from "../hyrox/sharePack/eventLogger.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_EVENT_NAMES = new Set([
  "race_card_previewed",
  "asset_downloaded",
  "instagram_pack_generated",
  "instagram_pack_email_sent",
  "instagram_pack_qr_opened",
  "instagram_caption_copied",
  "app_download_clicked",
]);

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function createHyroxCalculatorEventsRouter(db) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const body = req.body ?? {};
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";
    const submissionId = body.submissionId == null ? null : String(body.submissionId).trim();

    if (!sessionId || !eventName || !ALLOWED_EVENT_NAMES.has(eventName)) {
      return res.status(400).json({ error: "invalid_event" });
    }
    if (submissionId && !UUID_RE.test(submissionId)) {
      return res.status(400).json({ error: "invalid_submission_id" });
    }

    try {
      await logCalculatorEvent(db, {
        sessionId,
        submissionId,
        eventName,
        status: typeof body.status === "string" ? body.status : null,
        cacheHit: typeof body.cacheHit === "boolean" ? body.cacheHit : null,
        durationMs: Number.isFinite(Number(body.durationMs)) ? Number(body.durationMs) : null,
        metadata: objectOrEmpty(body.metadata),
      });
      return res.status(204).end();
    } catch (err) {
      req.log?.error?.({ event: "hyrox.calculator_event.error", err: err?.message }, "HYROX calculator event insert failed");
      return res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
