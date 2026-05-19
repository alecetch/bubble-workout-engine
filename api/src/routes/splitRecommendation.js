import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, safeString } from "../utils/validate.js";
import { defaultSplitForProgram } from "../utils/splitRecommender.js";

export const splitRecommendationRouter = express.Router();
splitRecommendationRouter.use(requireAuth);

const TEMPLATE_FOCUS_TO_SLUG = {
  lower: "lower_body",
  posterior: "lower_body",
  lower_strength: "lower_body",
  posterior_strength: "lower_body",
  upper: "upper_body",
  upper_strength: "upper_body",
  full: "full_body",
  push: "push",
  pull: "pull",
  legs: "legs",
};

function asJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function deriveSplitFromConfig(configJson, daysPerWeek) {
  const cfg = asJsonObject(configJson);
  const builder = cfg?.builder && typeof cfg.builder === "object" ? cfg.builder : null;
  const dpwKeys = builder?.day_templates_by_dpw?.[String(daysPerWeek)] ?? null;
  const dayTemplates = Array.isArray(builder?.day_templates) ? builder.day_templates : [];
  if (!Array.isArray(dpwKeys) || dpwKeys.length === 0 || dayTemplates.length === 0) {
    return null;
  }

  const templateIndex = Object.fromEntries(
    dayTemplates.map((template) => [safeString(template?.day_key), template]),
  );
  const recommendation = [];
  for (const key of dpwKeys) {
    const focus = safeString(templateIndex[safeString(key)]?.focus).toLowerCase();
    const slug = TEMPLATE_FOCUS_TO_SLUG[focus];
    if (!slug) return { recommendation: [], splitNotApplicable: true };
    recommendation.push(slug);
  }

  return { recommendation, splitNotApplicable: false };
}

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

    const qDays = parseInt(req.query.daysPerWeek, 10);
    const qType = safeString(req.query.programType);

    let daysPerWeek;
    let programType;

    if (result.rowCount === 0) {
      daysPerWeek = Number.isFinite(qDays) && qDays >= 1 && qDays <= 7 ? qDays : 3;
      programType = qType || "hypertrophy";
    } else {
      const profile = result.rows[0];
      const preferredDays = Array.isArray(profile.preferred_days) ? profile.preferred_days : [];
      daysPerWeek = preferredDays.length || (Number.isFinite(qDays) && qDays >= 1 ? qDays : 3);
      programType = safeString(profile.program_type_slug) || qType || "hypertrophy";
    }

    let recommendation = [];
    let splitNotApplicable = false;
    const configResult = await db.query(
      `
      SELECT program_generation_config_json
      FROM program_generation_config
      WHERE program_type = $1 AND is_active = TRUE
      ORDER BY schema_version DESC, updated_at DESC
      LIMIT 1
      `,
      [programType],
    );
    if (configResult.rowCount > 0) {
      const derived = deriveSplitFromConfig(configResult.rows[0]?.program_generation_config_json, daysPerWeek);
      if (derived) {
        recommendation = derived.recommendation;
        splitNotApplicable = derived.splitNotApplicable;
      }
    }
    if (recommendation.length === 0 && !splitNotApplicable && configResult.rowCount === 0) {
      recommendation = defaultSplitForProgram(programType, daysPerWeek);
    }

    const rawSplit = result.rows[0]?.preferred_split_json;
    const existingSplit = rawSplit && typeof rawSplit === "object" ? rawSplit : null;

    return res.status(200).json({
      ok: true,
      request_id,
      programType,
      daysPerWeek,
      recommendation,
      splitNotApplicable,
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
