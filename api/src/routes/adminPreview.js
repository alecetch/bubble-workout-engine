import express from "express";
import { pool } from "../db.js";
import { runPipeline } from "../../engine/runPipeline.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { buildInputsFromProfile } from "../services/buildInputsFromProfile.js";

export const adminPreviewRouter = express.Router();

export const RANK_TO_LEVEL = { 0: "beginner", 1: "intermediate", 2: "advanced", 3: "elite" };

export const VALID_PRESETS = [
  "no_equipment",
  "minimal_equipment",
  "decent_home_gym",
  "commercial_gym",
  "crossfit_hyrox_gym",
];

export const ALL_PROGRAM_TYPES = ["hypertrophy", "strength", "conditioning", "hyrox"];

const PREFERRED_DAYS_BY_DPW = {
  1: ["wed"],
  2: ["mon", "thu"],
  3: ["mon", "wed", "fri"],
  4: ["mon", "tue", "thu", "fri"],
  5: ["mon", "tue", "wed", "thu", "fri"],
  6: ["mon", "tue", "wed", "thu", "fri", "sat"],
  7: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
};

export function resolvePreferredDays(daysPerWeek) {
  return PREFERRED_DAYS_BY_DPW[daysPerWeek] ?? PREFERRED_DAYS_BY_DPW[3];
}

export function buildSynthProfile({ fitnessRank, equipmentSlugs, daysPerWeek, durationMins, equipmentPreset }) {
  return {
    fitnessLevel: RANK_TO_LEVEL[fitnessRank] ?? "intermediate",
    equipmentItemCodes: equipmentSlugs,
    injuryFlags: [],
    preferredDays: resolvePreferredDays(daysPerWeek),
    goals: [],
    minutesPerSession: durationMins,
    equipmentPreset,
  };
}

export function createPreviewHandler({
  db = pool,
  pipeline = runPipeline,
  getAllowed = getAllowedExerciseIds,
  buildInputs = buildInputsFromProfile,
} = {}) {
  return async function previewHandler(req, res) {
    const fitnessRank = Number(req.body?.fitness_rank ?? 1);
    if (![0, 1, 2, 3].includes(fitnessRank)) {
      return res.status(400).json({ ok: false, error: "fitness_rank must be 0, 1, 2, or 3" });
    }
    const equipmentPreset = String(req.body?.equipment_preset ?? "commercial_gym");
    if (!VALID_PRESETS.includes(equipmentPreset)) {
      return res.status(400).json({
        ok: false,
        error: `Unknown equipment_preset: ${equipmentPreset}. Valid: ${VALID_PRESETS.join(", ")}`,
      });
    }
    const daysPerWeek = Math.min(7, Math.max(1, Number(req.body?.days_per_week ?? 3)));
    const durationMins = Math.min(120, Math.max(20, Number(req.body?.duration_mins ?? 50)));
    const requestedTypes = Array.isArray(req.body?.program_types)
      ? req.body.program_types
      : ALL_PROGRAM_TYPES;
    const programTypes = requestedTypes.filter((t) => ALL_PROGRAM_TYPES.includes(t));
    if (programTypes.length === 0) {
      return res.status(400).json({ ok: false, error: "No valid program_types specified" });
    }

    const preferredDays = resolvePreferredDays(daysPerWeek);

    let client;
    let equipmentSlugs, allowedIds, exerciseRows, repRuleRows;
    try {
      client = await db.connect();

      const eqR = await client.query(
        `SELECT exercise_slug FROM equipment_items WHERE ${equipmentPreset} = true ORDER BY exercise_slug`,
      );
      equipmentSlugs = eqR.rows.map((r) => r.exercise_slug);

      allowedIds = await getAllowed(client, {
        fitness_rank: fitnessRank,
        injury_flags_slugs: [],
        equipment_items_slugs: equipmentSlugs,
      });

      const exR = await client.query(
        `SELECT * FROM exercise_catalogue WHERE is_archived = false ORDER BY exercise_id`,
      );
      exerciseRows = exR.rows;

      const repRuleR = await client.query(
        `SELECT
           rule_id,
           program_type,
           day_type,
           purpose,
           segment_type,
           movement_pattern,
           swap_group_id_1,
           swap_group_id_2,
           equipment_slug,
           rep_low,
           rep_high,
           reps_unit,
           rir_target,
           rir_min,
           rir_max,
           tempo_eccentric,
           tempo_pause_bottom,
           tempo_concentric,
           tempo_pause_top,
           rest_after_set_sec,
           rest_after_round_sec,
           priority
         FROM public.program_rep_rule
         WHERE is_active = true
         ORDER BY rule_id ASC`,
      );
      repRuleRows = repRuleR.rows;
    } finally {
      client?.release();
    }

    // Exercise name map — passed to UI as display aid, not baked into program tree.
    const exerciseNameMap = Object.fromEntries(
      exerciseRows.map((r) => [String(r.exercise_id), r.name]),
    );
    const repRuleMap = Object.fromEntries(
      (repRuleRows ?? []).map((r) => [String(r.rule_id), r]),
    );

    const synthProfile = buildSynthProfile({
      fitnessRank,
      equipmentSlugs,
      daysPerWeek,
      durationMins,
      equipmentPreset,
    });
    // Filter to allowed exercises only so the pipeline respects rank + equipment gates
    const allowedIdSet = new Set(allowedIds);
    const allowedExerciseRows = exerciseRows.filter((r) => allowedIdSet.has(r.exercise_id));
    const inputs = buildInputs(synthProfile, allowedExerciseRows);
    const pipelineRequest = {
      anchor_date_ms: Date.now(),
      allowed_ids_csv: allowedIds.join(","),
      preferred_days_json: preferredDays.join(","),
      duration_mins: durationMins,
      days_per_week: daysPerWeek,
      fitness_rank: fitnessRank,
    };

    // Run all program types in parallel — each gets the same inputs/allowed set.
    const results = await Promise.allSettled(
      programTypes.map((programType) =>
        pipeline({ db, inputs, programType, request: pipelineRequest }),
      ),
    );

    const previews = {};
    for (let i = 0; i < programTypes.length; i++) {
      const r = results[i];
      const t = programTypes[i];
      if (r.status === "fulfilled") {
        previews[t] = { ok: true, program: r.value.program, debug: r.value.debug };
      } else {
        previews[t] = { ok: false, error: r.reason?.message ?? String(r.reason) };
      }
    }

    return res.json({
      ok: true,
      meta: {
        fitness_rank: fitnessRank,
        fitness_level: RANK_TO_LEVEL[fitnessRank],
        equipment_preset: equipmentPreset,
        equipment_slugs: equipmentSlugs,
        days_per_week: daysPerWeek,
        duration_mins: durationMins,
        allowed_exercise_count: allowedIds.length,
        exercise_name_map: exerciseNameMap,
        rep_rule_map: repRuleMap,
      },
      previews,
    });
  };
}

adminPreviewRouter.post("/preview/generate", createPreviewHandler());
