import express from "express";
import { pool } from "../db.js";
import {
  buildDecision,
  loadProgressionConfig,
  rankKey,
  resolveProfileName,
} from "../services/progressionDecisionService.js";

export const adminProgressionSandboxRouter = express.Router();

const VALID_PROGRAM_TYPES = new Set(["hypertrophy", "strength", "conditioning", "hyrox"]);
const VALID_PURPOSES = new Set(["main", "secondary", "accessory"]);

function toText(value) {
  return String(value ?? "").trim();
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function invalid(res, error) {
  return res.status(400).json({ ok: false, error });
}

function shapeHistory(history) {
  return history.map((entry, index) => {
    const weightKg = toFiniteNumber(entry?.weight_kg ?? entry?.weightKg);
    if (weightKg == null) {
      return { error: `history[${index}].weight_kg must be a finite number` };
    }

    const repsCompleted = toPositiveInt(entry?.reps_completed ?? entry?.repsCompleted);
    if (repsCompleted == null) {
      return { error: `history[${index}].reps_completed must be a positive integer` };
    }

    const rirRaw = entry?.rir_actual ?? entry?.rirActual;
    const rirActual = rirRaw == null || String(rirRaw).trim() === "" ? null : toFiniteNumber(rirRaw);
    if (rirRaw != null && String(rirRaw).trim() !== "" && rirActual == null) {
      return { error: `history[${index}].rir_actual must be a finite number when provided` };
    }

    return {
      log_id: toText(entry?.log_id ?? entry?.logId) || `sandbox-${index + 1}`,
      weight_kg: weightKg,
      reps_completed: repsCompleted,
      rir_actual: rirActual,
    };
  });
}

export function createProgressionSandboxHandler(db = pool) {
  return async function progressionSandboxHandler(req, res) {
    try {
      const programType = toText(req.body?.program_type ?? req.body?.programType).toLowerCase();
      if (!VALID_PROGRAM_TYPES.has(programType)) {
        return invalid(res, "program_type must be one of: hypertrophy, strength, conditioning, hyrox");
      }

      const fitnessRank = Number(req.body?.fitness_rank);
      if (![0, 1, 2, 3].includes(fitnessRank)) {
        return invalid(res, "fitness_rank must be 0, 1, 2, or 3");
      }

      const purpose = toText(req.body?.purpose || "main").toLowerCase();
      if (!VALID_PURPOSES.has(purpose)) {
        return invalid(res, "purpose must be one of: main, secondary, accessory");
      }

      const repsPrescribed = toText(req.body?.reps_prescribed ?? req.body?.repsPrescribed);
      if (!repsPrescribed) {
        return invalid(res, "reps_prescribed is required");
      }

      const intensityPrescription = toText(req.body?.intensity_prescription ?? req.body?.intensityPrescription);
      if (!intensityPrescription) {
        return invalid(res, "intensity_prescription is required");
      }

      const rawHistory = req.body?.history;
      if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
        return invalid(res, "history must be a non-empty array");
      }

      const history = shapeHistory(rawHistory);
      const historyErr = history.find((entry) => entry?.error);
      if (historyErr) {
        return invalid(res, historyErr.error);
      }

      const exerciseId = toText(req.body?.exercise_id ?? req.body?.exerciseId) || "sandbox_exercise";
      let equipmentItemsSlugs = Array.isArray(req.body?.equipment_items_slugs)
        ? req.body.equipment_items_slugs.map((value) => toText(value)).filter(Boolean)
        : [];
      let isLoadable = true;

      if (toText(req.body?.exercise_id ?? req.body?.exerciseId)) {
        const exerciseResult = await db.query(
          `
          SELECT is_loadable, equipment_items_slugs
          FROM exercise_catalogue
          WHERE exercise_id = $1
          LIMIT 1
          `,
          [exerciseId],
        );
        const row = exerciseResult.rows?.[0] ?? null;
        if (row) {
          isLoadable = row.is_loadable !== false;
          if (Array.isArray(row.equipment_items_slugs) && row.equipment_items_slugs.length > 0) {
            equipmentItemsSlugs = row.equipment_items_slugs;
          }
        }
      }

      const { config, rankOverrides } = await loadProgressionConfig(db, programType);
      const resolvedRankKey = rankKey(fitnessRank);
      const rankOverride = rankOverrides?.[resolvedRankKey] ?? {};
      const profileName = resolveProfileName(config, programType, purpose);
      const profile = config.lever_profiles?.[profileName] ?? {};

      const row = {
        exercise_id: exerciseId,
        purpose,
        reps_prescribed: repsPrescribed,
        intensity_prescription: intensityPrescription,
        is_loadable: isLoadable,
        equipment_items_slugs: equipmentItemsSlugs,
      };

      const decision = buildDecision({
        row,
        programType,
        profileName,
        profile,
        rankOverride,
        history,
        config,
      });

      if (!decision) {
        return res.json({
          ok: true,
          outcome: "not_applicable",
          reason: "exercise_not_loadable or program_type_not_supported",
          config_used: {
            profile_name: profileName,
            rank_key: resolvedRankKey,
          },
        });
      }

      return res.json({
        ok: true,
        outcome: decision.outcome,
        primary_lever: decision.primary_lever,
        recommended_load_kg: decision.recommended_load_kg,
        recommended_reps_target: decision.recommended_reps_target,
        confidence: decision.confidence,
        confidence_score: decision.confidence_score,
        reasons: decision.reasons,
        evidence: decision.evidence,
        config_used: {
          profile_name: profileName,
          rank_key: resolvedRankKey,
        },
      });
    } catch (_err) {
      return res.status(500).json({ ok: false, error: "Internal error" });
    }
  };
}

adminProgressionSandboxRouter.post(
  "/progression-sandbox/evaluate",
  createProgressionSandboxHandler(pool),
);
