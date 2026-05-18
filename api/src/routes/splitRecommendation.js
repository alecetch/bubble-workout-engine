import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, safeString } from "../utils/validate.js";
import { defaultSplitForProgram } from "../utils/splitRecommender.js";

const GOAL_TO_PROGRAM_TYPE = {
  strength: "strength",
  hypertrophy: "hypertrophy",
  conditioning: "conditioning",
  endurance: "conditioning",
  hyrox: "hyrox",
  hyrox_workout: "hyrox",
};

export function createSplitRecommendationHandlers(db) {
  async function getSplitRecommendation(req, res) {
    const { request_id } = req;
    try {
      const userId = safeString(req.auth?.user_id);
      if (!userId) throw new RequestValidationError("No user ID in token");

      // Join through app_user to resolve subject_id → profile.
      // preferred_days is text[] — its length is daysPerWeek.
      // program_type_slug is the persisted program type.
      // main_goals_slugs is used to derive programType if program_type_slug is absent.
      const result = await db.query(
        `SELECT
           cp.preferred_split_json,
           cp.preferred_days,
           cp.program_type_slug,
           cp.main_goals_slugs
         FROM client_profile cp
         JOIN app_user au ON cp.user_id = au.id
         WHERE au.subject_id = $1
         LIMIT 1`,
        [userId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          ok: false,
          request_id,
          code: "not_found",
          error: "No profile found",
        });
      }

      const profile = result.rows[0];

      // Derive daysPerWeek from preferred_days array length.
      const preferredDays = Array.isArray(profile.preferred_days) ? profile.preferred_days : [];
      const daysPerWeek = preferredDays.length || 3;

      // Derive programType from program_type_slug or goals (same logic as generateProgramV2.js).
      const goalSlugs = Array.isArray(profile.main_goals_slugs) ? profile.main_goals_slugs : [];
      const goalDerivedType = goalSlugs.map((g) => GOAL_TO_PROGRAM_TYPE[g]).find(Boolean) ?? null;
      const programType = safeString(profile.program_type_slug) || goalDerivedType || "hypertrophy";

      const recommendation = defaultSplitForProgram(programType, daysPerWeek);

      const existingSplit = profile.preferred_split_json ?? null;

      return res.status(200).json({
        ok: true,
        request_id,
        programType,
        daysPerWeek,
        recommendation,
        existingPreference: existingSplit?.day_focuses ?? null,
        existingModifiedByUser: existingSplit?.modified_by_user ?? false,
      });
    } catch (err) {
      if (err instanceof RequestValidationError) {
        return res.status(400).json({
          ok: false,
          request_id,
          code: "validation_error",
          error: err.message,
        });
      }
      return res.status(500).json({
        ok: false,
        request_id,
        code: "internal_error",
        error: publicInternalError(err),
      });
    }
  }

  return { getSplitRecommendation };
}

export const splitRecommendationRouter = express.Router();
splitRecommendationRouter.use(requireAuth);

const defaultHandlers = createSplitRecommendationHandlers(pool);

// GET /api/split-recommendation
// Returns the engine's recommended split for the current user's profile.
splitRecommendationRouter.get("/split-recommendation", (req, res) => defaultHandlers.getSplitRecommendation(req, res));
