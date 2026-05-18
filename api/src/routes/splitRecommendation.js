import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, safeString } from "../utils/validate.js";
import { defaultSplitForProgram } from "../utils/splitRecommender.js";

export const splitRecommendationRouter = express.Router();
splitRecommendationRouter.use(requireAuth);

splitRecommendationRouter.get("/split-recommendation", async (req, res) => {
  const { request_id } = req;
  try {
    const userId = safeString(req.auth?.user_id);
    if (!userId) throw new RequestValidationError("No user ID in token");

    const db = req.app?.locals?.pool ?? pool;
    const result = await db.query(
      `
      SELECT cp.preferred_split_json, cp.preferred_days, cp.program_type_slug
      FROM client_profile cp
      JOIN app_user au ON au.id = cp.user_id
      WHERE au.subject_id = $1
      ORDER BY cp.created_at DESC
      LIMIT 1
      `,
      [userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, request_id, code: "not_found", error: "No profile found" });
    }

    const profile = result.rows[0];
    const preferredDays = Array.isArray(profile.preferred_days) ? profile.preferred_days : [];
    const daysPerWeek = preferredDays.length || 3;
    const programType = safeString(profile.program_type_slug) || "hypertrophy";
    const recommendation = defaultSplitForProgram(programType, daysPerWeek);
    const existingSplit = profile.preferred_split_json && typeof profile.preferred_split_json === "object"
      ? profile.preferred_split_json
      : null;

    return res.status(200).json({
      ok: true,
      request_id,
      programType,
      daysPerWeek,
      recommendation,
      existingPreference: Array.isArray(existingSplit?.day_focuses) ? existingSplit.day_focuses : null,
      existingModifiedByUser: existingSplit?.modified_by_user === true,
    });
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return res.status(400).json({ ok: false, request_id, code: "validation_error", error: err.message });
    }
    return res.status(500).json({ ok: false, request_id, code: "internal_error", error: publicInternalError(err) });
  }
});
