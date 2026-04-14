import express from "express";
import { pool } from "../db.js";
import { runPipeline } from "../../engine/runPipeline.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { buildInputsFromProfile } from "../services/buildInputsFromProfile.js";
import { getProfileById, getProfileByUserId } from "../services/clientProfileService.js";
import { publicInternalError } from "../utils/publicError.js";
import {
  buildDecision,
  loadProgressionConfig,
  rankKey,
  resolveProfileName,
} from "../services/progressionDecisionService.js";

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

export const CSV_COLUMNS = [
  "program_type",
  "config_key",
  "fitness_level",
  "fitness_rank",
  "equipment_preset",
  "days_per_week",
  "duration_mins",
  "allowed_exercise_count",
  "week_number",
  "week_phase",
  "day_number",
  "day_focus",
  "day_duration_mins",
  "segment_purpose",
  "segment_type",
  "segment_rounds",
  "exercise_order",
  "exercise_id",
  "exercise_name",
  "slot",
  "sets",
  "reps_prescribed",
  "reps_unit",
  "tempo",
  "rir_target",
  "rest_after_set_sec",
  "rep_rule_id",
];

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

function toSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_/-]/g, "")
    .replace(/^_+|_+$/g, "");
}

function toPreferredDayCode(value) {
  const raw = toSlug(value);
  const compressed = raw.replace(/_/g, "");
  const map = {
    mon: "mon",
    monday: "mon",
    tue: "tue",
    tues: "tue",
    tuesday: "tue",
    wed: "wed",
    weds: "wed",
    wednesday: "wed",
    thu: "thu",
    thur: "thu",
    thurs: "thu",
    thursday: "thu",
    fri: "fri",
    friday: "fri",
    sat: "sat",
    saturday: "sat",
    sun: "sun",
    sunday: "sun",
  };
  return map[compressed] || map[raw] || null;
}

function mapFitnessRankFromLevel(fitnessLevel) {
  const v = toSlug(fitnessLevel);
  if (v === "intermediate") return 1;
  if (v === "advanced") return 2;
  if (v === "elite") return 3;
  return 0;
}

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function validateArrayField(value, name) {
  if (value == null) return null;
  if (!Array.isArray(value)) {
    return `${name} must be an array`;
  }
  return null;
}

function findSlotDebug(step1StatsJson, dayIndex, slot) {
  const slotDebug = Array.isArray(step1StatsJson?.slot_debug) ? step1StatsJson.slot_debug : [];
  return slotDebug.find((entry) =>
    String(entry?.day_index ?? "") === String(dayIndex) &&
    String(entry?.slot ?? "") === String(slot),
  ) ?? null;
}

export async function buildPreviewInputs(
  db,
  getAllowed,
  buildInputs,
  {
    fitnessRank,
    equipmentPreset,
    daysPerWeek,
    durationMins,
    profile = null,
  },
) {
  const usingRealProfile = !!profile;
  const resolvedFitnessRank = usingRealProfile
    ? mapFitnessRankFromLevel(profile?.fitnessLevel)
    : fitnessRank;
  const resolvedEquipmentPreset = usingRealProfile
    ? String(profile?.equipmentPreset ?? equipmentPreset ?? "commercial_gym")
    : equipmentPreset;
  const resolvedEquipmentSlugs = usingRealProfile
    ? (Array.isArray(profile?.equipmentItemCodes) ? profile.equipmentItemCodes.map((x) => toSlug(x)).filter(Boolean) : [])
    : null;
  const resolvedPreferredDays = usingRealProfile
    ? (Array.isArray(profile?.preferredDays) ? profile.preferredDays.map((day) => toPreferredDayCode(day)).filter(Boolean) : [])
    : resolvePreferredDays(daysPerWeek);
  const resolvedDaysPerWeek = usingRealProfile
    ? (resolvedPreferredDays.length || clampNumber(profile?.preferredDays?.length, 3, 1, 7))
    : daysPerWeek;
  const resolvedDurationMins = usingRealProfile
    ? clampNumber(profile?.minutesPerSession, durationMins, 20, 120)
    : durationMins;

  let client;
  let equipmentSlugs;
  let allowedIds;
  let exerciseRows;
  let repRuleRows;
  try {
    client = await db.connect();

    if (resolvedEquipmentSlugs) {
      equipmentSlugs = resolvedEquipmentSlugs;
    } else {
      const eqR = await client.query(
        `SELECT exercise_slug FROM equipment_items WHERE ${resolvedEquipmentPreset} = true ORDER BY exercise_slug`,
      );
      equipmentSlugs = eqR.rows.map((r) => r.exercise_slug);
    }

    allowedIds = await getAllowed(client, {
      fitness_rank: resolvedFitnessRank,
      injury_flags_slugs: Array.isArray(profile?.injuryFlags) ? profile.injuryFlags.map((x) => toSlug(x)).filter(Boolean) : [],
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

  const exerciseNameMap = Object.fromEntries(
    exerciseRows.map((r) => [String(r.exercise_id), r.name]),
  );
  const estimationFamilyByExerciseId = Object.fromEntries(
    exerciseRows
      .filter((r) => r.load_estimation_metadata?.estimation_family)
      .map((r) => [String(r.exercise_id), String(r.load_estimation_metadata.estimation_family)]),
  );
  const repRuleMap = Object.fromEntries(
    (repRuleRows ?? []).map((r) => [String(r.rule_id), r]),
  );

  const synthProfile = usingRealProfile
    ? {
        ...profile,
        equipmentPreset: resolvedEquipmentPreset,
        equipmentItemCodes: equipmentSlugs,
        preferredDays: resolvedPreferredDays,
        minutesPerSession: resolvedDurationMins,
        fitnessLevel: profile?.fitnessLevel ?? RANK_TO_LEVEL[resolvedFitnessRank] ?? "intermediate",
      }
    : buildSynthProfile({
        fitnessRank: resolvedFitnessRank,
        equipmentSlugs,
        daysPerWeek: resolvedDaysPerWeek,
        durationMins: resolvedDurationMins,
        equipmentPreset: resolvedEquipmentPreset,
      });
  const inputs = {
    ...buildInputs(synthProfile, exerciseRows),
    allowed_exercise_ids: (allowedIds ?? []).map((id) => String(id)),
  };
  const pipelineRequest = {
    anchor_date_ms: Date.now(),
    allowed_ids_csv: (allowedIds ?? []).join(","),
    preferred_days_json: resolvedPreferredDays.join(","),
    duration_mins: resolvedDurationMins,
    days_per_week: resolvedDaysPerWeek,
    fitness_rank: resolvedFitnessRank,
  };

  return {
    equipmentSlugs,
    allowedIds: allowedIds ?? [],
    exerciseRows,
    repRuleRows,
    exerciseNameMap,
    estimationFamilyByExerciseId,
    repRuleMap,
    synthProfile,
    inputs,
    pipelineRequest,
  };
}

export function shapeToCsvRows(programType, preview, meta, fieldSet = "core") {
  if (fieldSet !== "core") return [];
  if (!preview?.ok) return [];

  const weeks = Array.isArray(preview?.program?.weeks) ? preview.program.weeks : [];
  if (!weeks.length) return [];

  const configKey = preview?.debug?.step1?.config_key ?? "";
  const weekNarration = Array.isArray(preview?.program?.narration?.weeks)
    ? preview.program.narration.weeks
    : [];
  const exerciseNameMap = meta?.exercise_name_map ?? {};
  const rows = [];

  for (const week of weeks) {
    const days = Array.isArray(week?.days) ? week.days : [];
    const weekIndex = String(week?.week_index ?? "");
    const phaseLabel = weekNarration[(Number(week?.week_index) || 0) - 1]?.phase_label ?? "";
    for (const day of days) {
      const segments = Array.isArray(day?.segments) ? day.segments : [];
      const dayIndex = String(day?.day_index ?? "");
      const dayFocus = day?.day_focus_slug ?? "";
      const dayDurationMins = String(day?.duration_mins ?? "");
      for (const seg of segments) {
        const items = Array.isArray(seg?.items) ? seg.items : [];
        const segmentPurpose = seg?.purpose ?? "";
        const segmentType = seg?.segment_type ?? "";
        const segmentRounds = String(seg?.rounds ?? "");
        items.forEach((item, index) => {
          const exerciseId = String(item?.ex_id ?? "");
          rows.push({
            program_type: String(programType ?? ""),
            config_key: String(configKey),
            fitness_level: String(meta?.fitness_level ?? ""),
            fitness_rank: String(meta?.fitness_rank ?? ""),
            equipment_preset: String(meta?.equipment_preset ?? ""),
            days_per_week: String(meta?.days_per_week ?? ""),
            duration_mins: String(meta?.duration_mins ?? ""),
            allowed_exercise_count: String(meta?.allowed_exercise_count ?? ""),
            week_number: weekIndex,
            week_phase: String(phaseLabel),
            day_number: dayIndex,
            day_focus: String(dayFocus),
            day_duration_mins: dayDurationMins,
            segment_purpose: String(segmentPurpose),
            segment_type: String(segmentType),
            segment_rounds: segmentRounds,
            exercise_order: String(index + 1),
            exercise_id: exerciseId,
            exercise_name: String(exerciseNameMap?.[exerciseId] ?? ""),
            slot: String(item?.slot ?? ""),
            sets: String(item?.sets ?? ""),
            reps_prescribed: String(item?.reps_prescribed ?? ""),
            reps_unit: String(item?.reps_unit ?? ""),
            tempo: String(item?.tempo_prescribed ?? ""),
            rir_target: item?.rir_target != null ? String(item.rir_target) : "",
            rest_after_set_sec: String(item?.rest_after_set_sec ?? ""),
            rep_rule_id: String(item?.rep_rule_id ?? ""),
          });
        });
      }
    }
  }

  return rows;
}

export function rowsToCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  const columns = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const stringValue = String(value ?? "");
    if (/[",\n\r]/.test(stringValue)) {
      return `"${stringValue.replaceAll('"', '""')}"`;
    }
    return stringValue;
  };

  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(",")),
  ];

  return `${lines.join("\r\n")}\r\n`;
}

function buildPreviewMeta(fitnessRank, equipmentPreset, daysPerWeek, durationMins, cached) {
  return {
    fitness_rank: fitnessRank,
    fitness_level: RANK_TO_LEVEL[fitnessRank],
    equipment_preset: equipmentPreset,
    equipment_slugs: cached.equipmentSlugs,
    days_per_week: daysPerWeek,
    duration_mins: durationMins,
    allowed_exercise_count: cached.allowedIds.length,
    exercise_name_map: cached.exerciseNameMap,
    rep_rule_map: cached.repRuleMap,
  };
}

export function createPreviewHandler({
  db = pool,
  pipeline = runPipeline,
  getAllowed = getAllowedExerciseIds,
  buildInputs = buildInputsFromProfile,
  getProfileByUser = getProfileByUserId,
  getProfile = getProfileById,
} = {}) {
  return async function previewHandler(req, res) {
    const clientProfileId = String(req.body?.client_profile_id ?? req.body?.clientProfileId ?? "").trim();
    const userId = String(req.body?.user_id ?? req.body?.bubble_user_id ?? "").trim();
    const realProfile = clientProfileId
      ? await getProfile(clientProfileId)
      : userId
        ? await getProfileByUser(userId)
        : null;
    if ((clientProfileId || userId) && !realProfile) {
      return res.status(404).json({ ok: false, error: "Client profile not found" });
    }
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
    const daysPerWeek = clampNumber(req.body?.days_per_week, 3, 1, 7);
    const durationMins = clampNumber(req.body?.duration_mins, 50, 20, 120);
    const requestedTypes = Array.isArray(req.body?.program_types)
      ? req.body.program_types
      : ALL_PROGRAM_TYPES;
    const anchorLifts = Array.isArray(req.body?.anchor_lifts) ? req.body.anchor_lifts : [];
    const programTypes = requestedTypes.filter((t) => ALL_PROGRAM_TYPES.includes(t));
    if (programTypes.length === 0) {
      return res.status(400).json({ ok: false, error: "No valid program_types specified" });
    }

    const cached = await buildPreviewInputs(db, getAllowed, buildInputs, {
      fitnessRank,
      equipmentPreset,
      daysPerWeek,
      durationMins,
      profile: realProfile,
    });

    const results = await Promise.allSettled(
      programTypes.map((programType) =>
        pipeline({ db, inputs: cached.inputs, programType, request: cached.pipelineRequest }),
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

    const progressionPreviews = {};

    if (anchorLifts.length > 0) {
      const anchorByFamily = Object.fromEntries(
        anchorLifts
          .filter((a) => a.estimationFamily && a.loadKg != null && a.reps != null)
          .map((a) => [String(a.estimationFamily), a]),
      );

      for (const programType of programTypes) {
        const preview = previews[programType];
        if (!preview?.ok) continue;

        const { config, rankOverrides } = await loadProgressionConfig(db, programType);
        const rankOverride = rankOverrides?.[rankKey(fitnessRank)] ?? {};
        const week1 = (preview.program?.weeks ?? []).find((w) => w.week_index === 1);
        if (!week1) continue;

        const decisions = [];
        for (const day of (week1.days ?? [])) {
          for (const seg of (day.segments ?? [])) {
            for (const item of (seg.items ?? [])) {
              const exerciseId = String(item.ex_id ?? "");
              const family = cached.estimationFamilyByExerciseId?.[exerciseId];
              const anchor = family ? anchorByFamily[family] : null;

              if (!anchor) {
                decisions.push({
                  exercise_id: exerciseId,
                  exercise_name: cached.exerciseNameMap[exerciseId] ?? exerciseId,
                  day: day.day_index,
                  family: family ?? null,
                  anchor_load_kg: null,
                  outcome: null,
                  skipped_reason: family ? "no anchor provided for this family" : "no estimation family on exercise",
                });
                continue;
              }

              const syntheticHistory = [
                { log_id: "synthetic-1", weight_kg: anchor.loadKg, reps_completed: anchor.reps, rir_actual: anchor.rir ?? 2 },
                { log_id: "synthetic-2", weight_kg: anchor.loadKg, reps_completed: anchor.reps, rir_actual: anchor.rir ?? 2 },
              ];

              const exerciseRow = cached.exerciseRows.find((r) => String(r.exercise_id) === exerciseId) ?? {};
              const row = {
                exercise_id: exerciseId,
                purpose: seg.purpose ?? "main",
                reps_prescribed: item.reps_prescribed ?? "",
                intensity_prescription: item.intensity ?? item.intensity_prescription ?? (item.rir_target != null ? `${item.rir_target} RIR` : ""),
                is_loadable: exerciseRow.is_loadable ?? true,
                equipment_items_slugs: exerciseRow.equipment_items_slugs ?? [],
              };

              const profileName = resolveProfileName(config, programType, row.purpose);
              const profile = config.lever_profiles?.[profileName] ?? {};
              const decision = buildDecision({
                row,
                programType,
                profileName,
                profile,
                rankOverride,
                history: syntheticHistory,
                config,
              });

              decisions.push({
                exercise_id: exerciseId,
                exercise_name: cached.exerciseNameMap[exerciseId] ?? exerciseId,
                day: day.day_index,
                family,
                prescribed_reps: item.reps_prescribed ?? "",
                anchor_load_kg: anchor.loadKg,
                outcome: decision?.outcome ?? "not_applicable",
                primary_lever: decision?.primary_lever ?? null,
                recommended_load_kg: decision?.recommended_load_kg ?? null,
                recommended_reps_target: decision?.recommended_reps_target ?? null,
                confidence: decision?.confidence ?? null,
                reasons: decision?.reasons ?? [],
              });
            }
          }
        }

        progressionPreviews[programType] = decisions;
      }
    }

    const previewContext = {
      mode: realProfile ? "real_profile" : "synthetic",
      profile_id: realProfile?.id ?? null,
      requested_client_profile_id: clientProfileId || null,
      requested_user_id: userId || null,
    };

    return res.json({
      ok: true,
      meta: buildPreviewMeta(fitnessRank, equipmentPreset, daysPerWeek, durationMins, cached),
      preview_context: previewContext,
      previews,
      progression_preview: progressionPreviews,
    });
  };
}

export function createExportHandler({
  db = pool,
  pipeline = runPipeline,
  getAllowed = getAllowedExerciseIds,
  buildInputs = buildInputsFromProfile,
} = {}) {
  return async function exportHandler(req, res) {
    const fitnessRanksErr = validateArrayField(req.body?.fitness_ranks, "fitness_ranks");
    if (fitnessRanksErr) return res.status(400).json({ ok: false, error: fitnessRanksErr });
    const presetsErr = validateArrayField(req.body?.equipment_presets, "equipment_presets");
    if (presetsErr) return res.status(400).json({ ok: false, error: presetsErr });
    const typesErr = validateArrayField(req.body?.program_types, "program_types");
    if (typesErr) return res.status(400).json({ ok: false, error: typesErr });

    const fieldSet = String(req.body?.field_set ?? "core");
    if (fieldSet !== "core") {
      return res.status(400).json({ ok: false, error: "field_set must be core" });
    }

    const fitnessRanks = req.body?.fitness_ranks ?? [1];
    if (!fitnessRanks.every((rank) => [0, 1, 2, 3].includes(Number(rank)))) {
      return res.status(400).json({ ok: false, error: "fitness_ranks must only contain 0, 1, 2, or 3" });
    }

    const equipmentPresets = req.body?.equipment_presets ?? ["commercial_gym"];
    if (!equipmentPresets.every((preset) => VALID_PRESETS.includes(String(preset)))) {
      return res.status(400).json({
        ok: false,
        error: `equipment_presets must only contain: ${VALID_PRESETS.join(", ")}`,
      });
    }

    const programTypes = req.body?.program_types ?? ALL_PROGRAM_TYPES;
    if (!programTypes.every((type) => ALL_PROGRAM_TYPES.includes(String(type)))) {
      return res.status(400).json({
        ok: false,
        error: `program_types must only contain: ${ALL_PROGRAM_TYPES.join(", ")}`,
      });
    }

    const normalizedProgramTypes = programTypes.map((type) => String(type));
    const normalizedFitnessRanks = fitnessRanks.map((rank) => Number(rank));
    const normalizedEquipmentPresets = equipmentPresets.map((preset) => String(preset));
    const daysPerWeek = clampNumber(req.body?.days_per_week, 3, 1, 7);
    const durationMins = clampNumber(req.body?.duration_mins, 50, 20, 120);

    const cachedByPair = new Map();
    for (const fitnessRank of normalizedFitnessRanks) {
      for (const equipmentPreset of normalizedEquipmentPresets) {
        const key = `${fitnessRank}|${equipmentPreset}`;
        if (cachedByPair.has(key)) continue;
        const cached = await buildPreviewInputs(db, getAllowed, buildInputs, {
          fitnessRank,
          equipmentPreset,
          daysPerWeek,
          durationMins,
        });
        cachedByPair.set(key, cached);
      }
    }

    const allRows = [];
    for (const fitnessRank of normalizedFitnessRanks) {
      for (const equipmentPreset of normalizedEquipmentPresets) {
        const cached = cachedByPair.get(`${fitnessRank}|${equipmentPreset}`);
        const meta = buildPreviewMeta(fitnessRank, equipmentPreset, daysPerWeek, durationMins, cached);
        for (const programType of normalizedProgramTypes) {
          try {
            const result = await pipeline({
              db,
              inputs: cached.inputs,
              programType,
              request: cached.pipelineRequest,
            });
            const rows = shapeToCsvRows(
              programType,
              { ok: true, program: result.program, debug: result.debug },
              meta,
              fieldSet,
            );
            allRows.push(...rows);
          } catch {
            // Keep export resilient: a failed combination contributes no rows.
          }
        }
      }
    }

    const csv = allRows.length > 0
      ? rowsToCsv(allRows)
      : `${CSV_COLUMNS.join(",")}\r\n`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="preview-export-${Date.now()}.csv"`,
    );
    return res.send(csv);
  };
}

export function createLiveSlotDebugHandler({
  db = pool,
} = {}) {
  return async function liveSlotDebugHandler(req, res) {
    const programId = String(req.query?.program_id ?? "").trim();
    const dayIndex = String(req.query?.day_index ?? "1").trim() || "1";
    const slot = String(req.query?.slot ?? "A:squat").trim() || "A:squat";

    if (!programId) {
      return res.status(400).json({ ok: false, error: "program_id is required" });
    }

    try {
      const result = await db.query(
        `
        SELECT id, program_id, created_at, status, last_stage, step1_stats_json
        FROM generation_run
        WHERE program_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [programId],
      );
      const row = result.rows?.[0] ?? null;
      if (!row) {
        return res.status(404).json({ ok: false, error: "No generation_run found for program_id" });
      }

      const step1 = row.step1_stats_json ?? {};
      const slotDebug = findSlotDebug(step1, dayIndex, slot);

      return res.json({
        ok: true,
        run_id: row.id,
        program_id: row.program_id,
        created_at: row.created_at,
        status: row.status,
        last_stage: row.last_stage,
        day_index: Number(dayIndex),
        slot,
        equipment_profile: step1?.equipment_profile ?? null,
        fill_failed: step1?.fill_failed ?? null,
        slot_debug: slotDebug,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  };
}

adminPreviewRouter.post("/preview/generate", createPreviewHandler());
adminPreviewRouter.post("/preview/export-csv", createExportHandler());
adminPreviewRouter.get("/preview/live-slot-debug", createLiveSlotDebugHandler());
