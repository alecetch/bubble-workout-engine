import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { safeString } from "../utils/validate.js";

function anchorLiftEntry(estimationFamily, exerciseId, loadKg, submissionId) {
  if (loadKg == null) return null;
  return {
    estimationFamily,
    exerciseId,
    loadKg,
    reps: 3,
    source: "hyrox_calculator",
    sourceDetailJson: { submissionId },
  };
}

function unavailable() {
  return { available: false, submissionId: null, collectedAt: null, prefill: null };
}

export function createHyroxOnboardingPrefillRouter(db = pool) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const userId = safeString(req.auth?.user_id);
      if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

      const result = await db.query(
        `SELECT id, created_at, sex, athlete_context_json
         FROM hyrox_submissions
         WHERE linked_app_user_id = $1
           AND app_link_consent = true
           AND (
             athlete_context_json->>'bodyweightKg' IS NOT NULL
             OR athlete_context_json->>'heightCm' IS NOT NULL
             OR athlete_context_json->>'backSquat3RMKg' IS NOT NULL
             OR athlete_context_json->>'deadlift3RMKg' IS NOT NULL
           )
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId],
      );

      const row = result.rows[0];
      if (!row) return res.json(unavailable());

      const ctx = row.athlete_context_json ?? {};
      const anchorLifts = [
        anchorLiftEntry("squat", "bb_back_squat", ctx.backSquat3RMKg ?? null, row.id),
        anchorLiftEntry("hinge", "bb_deadlift", ctx.deadlift3RMKg ?? null, row.id),
      ].filter(Boolean);

      return res.json({
        available: true,
        submissionId: row.id,
        collectedAt: row.created_at,
        prefill: {
          heightCm: ctx.heightCm ?? null,
          weightKg: ctx.bodyweightKg ?? null,
          sex: row.sex ?? null,
          anchorLifts,
        },
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  return router;
}
