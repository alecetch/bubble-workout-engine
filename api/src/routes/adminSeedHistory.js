import express from "express";
import { pool } from "../db.js";
import { runPipeline } from "../../engine/runPipeline.js";
import { importEmitterPayload } from "../services/importEmitterService.js";
import { makeProgressionDecisionService } from "../services/progressionDecisionService.js";
import { getProfileByUserId } from "../services/clientProfileService.js";
import { buildInputsFromProfile } from "../services/buildInputsFromProfile.js";
import { getAllowedExerciseIds as getAllowedExercises } from "../../engine/getAllowedExercises.js";
import { publicInternalError } from "../utils/publicError.js";

export const adminSeedHistoryRouter = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONDAY_BASED_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DEFAULT_PROFILE = {
  fitnessLevel: "intermediate",
  equipmentItemCodes: ["barbell", "dumbbell", "cable_machine", "bench", "squat_rack"],
  injuryFlags: [],
  preferredDays: ["mon", "wed", "fri"],
  goals: ["strength"],
  minutesPerSession: 60,
  equipmentPreset: "full_gym",
  goalNotes: "",
  scheduleConstraints: "",
};
const ROBUST_PULL_EXERCISE_ID = "bb_bentover_row";
const ROBUST_REQUIRED_EXERCISES = ["bb_back_squat", "bb_bench_press", ROBUST_PULL_EXERCISE_ID];
const ROBUST_WEEKLY_OUTCOMES = [
  "hold",
  "increase_reps",
  "increase_load",
  "increase_load",
  "hold",
  "hold",
  "deload_local",
  "increase_reps",
  "increase_load",
  "increase_reps",
  "increase_load",
  "hold",
];
const ROBUST_WEEKLY_REPS = [5, 6, 6, 6, 5, 5, 5, 5, 6, 6, 7, 7];
const ROBUST_WEEKLY_LOADS = {
  bb_back_squat: [100, 100, 102.5, 105, 107.5, 110, 110, 95, 100, 102.5, 105, 107.5],
  bb_bench_press: [70, 70, 72.5, 75, 77.5, 80, 80, 67.5, 70, 72.5, 75, 77.5],
  [ROBUST_PULL_EXERCISE_ID]: [80, 80, 82.5, 85, 87.5, 90, 90, 75, 80, 82.5, 85, 87.5],
};
const ROBUST_DAY_TEMPLATES = [
  {
    dayLabel: "Lower + Pull",
    dayType: "strength",
    exercises: [
      { exerciseId: "bb_back_squat", purpose: "main", purposeLabel: "Main Lift", sets: 4, restSeconds: 180 },
      { exerciseId: ROBUST_PULL_EXERCISE_ID, purpose: "secondary", purposeLabel: "Secondary Lift", sets: 4, restSeconds: 120 },
    ],
  },
  {
    dayLabel: "Upper Push",
    dayType: "strength",
    exercises: [
      { exerciseId: "bb_bench_press", purpose: "main", purposeLabel: "Main Lift", sets: 4, restSeconds: 150 },
    ],
  },
  {
    dayLabel: "Upper Pull",
    dayType: "strength",
    exercises: [
      { exerciseId: ROBUST_PULL_EXERCISE_ID, purpose: "main", purposeLabel: "Main Lift", sets: 4, restSeconds: 120 },
    ],
  },
  {
    dayLabel: "Lower Strength",
    dayType: "strength",
    exercises: [
      { exerciseId: "bb_back_squat", purpose: "main", purposeLabel: "Main Lift", sets: 4, restSeconds: 180 },
    ],
  },
  {
    dayLabel: "Upper Bench",
    dayType: "strength",
    exercises: [
      { exerciseId: "bb_bench_press", purpose: "main", purposeLabel: "Main Lift", sets: 4, restSeconds: 150 },
    ],
  },
];

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_/-]/g, "")
    .replace(/^_+|_+$/g, "");
}

function mapFitnessRank(fitnessLevel) {
  const v = String(fitnessLevel ?? "").trim().toLowerCase();
  if (v === "intermediate") return 1;
  if (v === "advanced") return 2;
  if (v === "elite") return 3;
  return 0;
}

function baseWeightKg(region) {
  if (region === "lower") return 100;
  if (region === "upper") return 70;
  if (region === "full") return 80;
  return 60;
}

function utcDateFromMs(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function floorUtcDayMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function getUtcWeekdayIndex(ms) {
  const jsDay = new Date(ms).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function toSessionTimestamp(dateValue) {
  if (dateValue instanceof Date) {
    return `${dateValue.toISOString().slice(0, 10)}T12:00:00.000Z`;
  }

  const raw = String(dateValue ?? "").trim();
  const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}T12:00:00.000Z`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.toISOString().slice(0, 10)}T12:00:00.000Z`;
  }

  throw new Error(`Invalid scheduled date value: ${raw}`);
}

export function weekWeight(region, weekIndex, totalWeeks) {
  const safeTotalWeeks = Number.isFinite(totalWeeks) && totalWeeks > 0 ? totalWeeks : 1;
  const progress = safeTotalWeeks > 1 ? weekIndex / (safeTotalWeeks - 1) : 0;
  const raw = baseWeightKg(region) * (1 + progress * 0.15);
  return Math.round(raw / 2.5) * 2.5;
}

export function rirForWeek(weekIndex, totalWeeks) {
  const safeTotalWeeks = Number.isFinite(totalWeeks) && totalWeeks > 0 ? totalWeeks : 1;
  const pct = weekIndex / safeTotalWeeks;
  if (pct < 0.33) return 3;
  if (pct < 0.67) return 2;
  return 1;
}

export function parseReps(repsPrescribed) {
  if (!repsPrescribed) return 8;
  const raw = String(repsPrescribed).trim();
  const normalizedRangeMatch = raw.match(/(\d+)\s*(?:-|\u2013)\s*(\d+)/);
  if (normalizedRangeMatch) {
    return Math.round((Number(normalizedRangeMatch[1]) + Number(normalizedRangeMatch[2])) / 2);
  }
  const rangeMatch = raw.match(/(\d+)\s*[-â€“]\s*(\d+)/);
  if (rangeMatch) {
    return Math.round((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2);
  }
  const single = Number.parseInt(raw, 10);
  return Number.isFinite(single) ? single : 8;
}

export function normalizeSeedMode(rawValue) {
  const mode = String(rawValue ?? "").trim().toLowerCase();
  return mode === "quick" ? "quick" : "robust";
}

function normalizePreferredDays(preferredDays, daysPerWeek) {
  const seen = new Set();
  const normalized = [];
  for (const raw of Array.isArray(preferredDays) ? preferredDays : []) {
    const slug = toSlug(raw);
    if (!MONDAY_BASED_WEEKDAYS.includes(slug) || seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(slug);
  }
  for (const fallback of DEFAULT_PROFILE.preferredDays.concat(["sat", "sun"])) {
    if (normalized.length >= daysPerWeek) break;
    if (seen.has(fallback)) continue;
    seen.add(fallback);
    normalized.push(fallback);
  }
  return normalized.slice(0, daysPerWeek).sort(
    (a, b) => MONDAY_BASED_WEEKDAYS.indexOf(a) - MONDAY_BASED_WEEKDAYS.indexOf(b),
  );
}

function mondayBasedOffset(daySlug) {
  const index = MONDAY_BASED_WEEKDAYS.indexOf(daySlug);
  return index >= 0 ? index : 0;
}

function getWeekPatternValue(values, weekIndex) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const safeIndex = Math.max(0, Math.min(values.length - 1, weekIndex));
  return values[safeIndex];
}

function getRobustPrescription(exerciseId, weekIndex) {
  const loadPattern = ROBUST_WEEKLY_LOADS[exerciseId] ?? ROBUST_WEEKLY_LOADS.bb_back_squat;
  const outcome = getWeekPatternValue(ROBUST_WEEKLY_OUTCOMES, weekIndex) ?? "hold";
  const reps = getWeekPatternValue(ROBUST_WEEKLY_REPS, weekIndex) ?? 5;
  const loadKg = getWeekPatternValue(loadPattern, weekIndex) ?? loadPattern[loadPattern.length - 1];
  return {
    loadKg,
    reps,
    outcome,
    confidence: outcome === "deload_local" ? "medium" : "high",
    primaryLever:
      outcome === "increase_load"
        ? "load"
        : outcome === "increase_reps"
          ? "reps"
          : outcome === "deload_local"
            ? "load"
            : "hold",
    rir: outcome === "deload_local" ? 4 : outcome === "increase_load" ? 2 : outcome === "increase_reps" ? 3 : 2,
  };
}

function createPrgRow({ title, summary, weeks, daysPerWeek, preferredDays }) {
  return [
    "PRG",
    title,
    summary,
    String(weeks),
    String(daysPerWeek),
    JSON.stringify({ seed_mode: "robust_history" }),
    "0",
    preferredDays[0] ?? "mon",
    JSON.stringify(preferredDays),
  ].join("|");
}

function createWeekRow(weekNumber) {
  return ["WEEK", String(weekNumber), `Week ${weekNumber}`, "Robust seeded history week"].join("|");
}

function createDayRow({
  weekNumber,
  dayNumber,
  globalDayIndex,
  dayLabel,
  dayType,
  scheduledOffsetDays,
  scheduledWeekday,
  programDayKey,
}) {
  return [
    "DAY",
    String(weekNumber),
    String(dayNumber),
    String(globalDayIndex),
    dayLabel,
    dayType,
    "60",
    "Strength",
    "Main work",
    "Secondary work",
    "",
    String(scheduledOffsetDays),
    scheduledWeekday,
    programDayKey,
  ].join("|");
}

function createSegRow({ segmentKey, segmentTitle, programDayKey }) {
  return [
    "SEG",
    segmentKey,
    "strength",
    segmentTitle,
    "none",
    "",
    "",
    "1",
    "",
    JSON.stringify({}),
    "0",
    "00:00",
    `blk_${programDayKey}`,
    "1",
    "1",
    "main",
    "Strength",
    "",
    programDayKey,
    "0",
  ].join("|");
}

function createExRow({ exerciseId, orderInDay, orderInBlock, purpose, purposeLabel, sets, reps, restSeconds, segmentKey, programDayKey }) {
  return [
    "EX",
    exerciseId,
    String(orderInDay),
    "1",
    purpose,
    purposeLabel,
    String(orderInBlock),
    String(sets),
    String(reps),
    "reps",
    "",
    "",
    String(restSeconds),
    "",
    "",
    "",
    "",
    segmentKey,
    "strength",
    "",
    "",
    "",
    "",
    "",
    "",
    programDayKey,
  ].join("|");
}

function getCurrentWeekMondayMs(nowMs) {
  const todayMs = floorUtcDayMs(nowMs);
  const weekdayIndex = getUtcWeekdayIndex(todayMs);
  return todayMs - weekdayIndex * DAY_MS;
}

function computeRobustAnchorMs(weeks, preferredDays, nowMs = Date.now()) {
  const dayOffsets = preferredDays.map(mondayBasedOffset);
  const maxOffset = Math.max(...dayOffsets, 0);
  let latestWeekMondayMs = getCurrentWeekMondayMs(nowMs);
  if (latestWeekMondayMs + maxOffset * DAY_MS >= floorUtcDayMs(nowMs)) {
    latestWeekMondayMs -= 7 * DAY_MS;
  }
  return latestWeekMondayMs - (weeks - 1) * 7 * DAY_MS;
}

function getRobustDayTemplates(daysPerWeek) {
  return ROBUST_DAY_TEMPLATES.slice(0, daysPerWeek);
}

export function buildRobustEmitterRows({ weeks, daysPerWeek, preferredDays }) {
  const normalizedPreferredDays = normalizePreferredDays(preferredDays, daysPerWeek);
  const dayTemplates = getRobustDayTemplates(daysPerWeek);
  const rows = [
    createPrgRow({
      title: "Seed History (Robust)",
      summary: `Deterministic ${weeks}-week seeded history for QA.`,
      weeks,
      daysPerWeek,
      preferredDays: normalizedPreferredDays,
    }),
  ];

  let globalDayIndex = 1;
  for (let weekNumber = 1; weekNumber <= weeks; weekNumber += 1) {
    rows.push(createWeekRow(weekNumber));
    for (let templateIndex = 0; templateIndex < dayTemplates.length; templateIndex += 1) {
      const dayNumber = templateIndex + 1;
      const template = dayTemplates[templateIndex];
      const programDayKey = `seed_w${weekNumber}_d${dayNumber}`;
      const segmentKey = `${programDayKey}_seg_1`;
      const daySlug = normalizedPreferredDays[templateIndex] ?? normalizedPreferredDays[0] ?? "mon";
      const scheduledOffsetDays = (weekNumber - 1) * 7 + mondayBasedOffset(daySlug);

      rows.push(
        createDayRow({
          weekNumber,
          dayNumber,
          globalDayIndex,
          dayLabel: template.dayLabel,
          dayType: template.dayType,
          scheduledOffsetDays,
          scheduledWeekday: daySlug,
          programDayKey,
        }),
      );
      rows.push(createSegRow({ segmentKey, segmentTitle: template.dayLabel, programDayKey }));

      for (let exerciseIndex = 0; exerciseIndex < template.exercises.length; exerciseIndex += 1) {
        const exerciseTemplate = template.exercises[exerciseIndex];
        const prescription = getRobustPrescription(exerciseTemplate.exerciseId, weekNumber - 1);
        rows.push(
          createExRow({
            exerciseId: exerciseTemplate.exerciseId,
            orderInDay: exerciseIndex + 1,
            orderInBlock: exerciseIndex + 1,
            purpose: exerciseTemplate.purpose,
            purposeLabel: exerciseTemplate.purposeLabel,
            sets: exerciseTemplate.sets,
            reps: prescription.reps,
            restSeconds: exerciseTemplate.restSeconds,
            segmentKey,
            programDayKey,
          }),
        );
      }

      globalDayIndex += 1;
    }
  }

  return {
    rows,
    preferredDays: normalizedPreferredDays,
    anchorCoverage: {
      bb_back_squat: weeks,
      bb_bench_press: weeks,
      [ROBUST_PULL_EXERCISE_ID]: weeks,
    },
  };
}

async function getProfileForPgUserId(db, pgUserId, rawUserId) {
  const directProfile = await db.query(
    `
    SELECT cp.*
    FROM client_profile cp
    WHERE cp.user_id = $1
    LIMIT 1
    `,
    [pgUserId],
  );
  if (directProfile.rowCount > 0) {
    const row = directProfile.rows[0];
    return {
      id: row.id,
      userId: row.user_id ?? null,
      goals: row.main_goals_slugs ?? [],
      fitnessLevel: row.fitness_level_slug ?? null,
      injuryFlags: row.injury_flags_slugs ?? row.injury_flags ?? [],
      goalNotes: row.goal_notes ?? "",
      equipmentPreset: row.equipment_preset_slug ?? null,
      equipmentItemCodes: row.equipment_items_slugs ?? [],
      preferredDays: row.preferred_days ?? [],
      scheduleConstraints: row.schedule_constraints ?? "",
      heightCm: row.height_cm ?? null,
      weightKg: row.weight_kg ?? null,
      minutesPerSession: row.minutes_per_session ?? null,
      sex: row.sex ?? null,
      ageRange: row.age_range ?? null,
      onboardingStepCompleted: row.onboarding_step_completed ?? 0,
      onboardingCompletedAt: row.onboarding_completed_at ?? null,
      programType: row.program_type_slug ?? null,
      anchorLiftsSkipped: row.anchor_lifts_skipped ?? false,
      anchorLiftsCollectedAt: row.anchor_lifts_collected_at ?? null,
    };
  }
  return getProfileByUserId(rawUserId);
}

function ensureRobustRequiredExercises(exerciseRows) {
  const availableIds = new Set((exerciseRows ?? []).map((row) => String(row.exercise_id)));
  const missing = ROBUST_REQUIRED_EXERCISES.filter((exerciseId) => !availableIds.has(exerciseId));
  if (missing.length > 0) {
    throw new Error(`Robust seed requires missing exercises: ${missing.join(", ")}`);
  }
}

async function seedQuickHistory({ db, programId, pgUserId, orderedWeekNumbers, weeksMap, totalWeeks, progressionService, fitnessRank }) {
  const totalDayIds = new Set();

  for (let index = 0; index < orderedWeekNumbers.length; index += 1) {
    const weekNumber = orderedWeekNumbers[index];
    const weekExercises = weeksMap.get(weekNumber) ?? [];
    const rir = rirForWeek(index, totalWeeks);
    const dayExerciseCounts = new Map();

    for (const pe of weekExercises) {
      totalDayIds.add(pe.program_day_id);
      dayExerciseCounts.set(pe.program_day_id, (dayExerciseCounts.get(pe.program_day_id) ?? 0) + 1);

      const weightKg = weekWeight(pe.strength_primary_region, index, totalWeeks);
      const reps = parseReps(pe.reps_prescribed);
      const sets = Math.max(1, Number.parseInt(String(pe.sets_prescribed ?? ""), 10) || 3);
      const e1rm = Number((weightKg * (1 + reps / 30)).toFixed(2));
      const sessionTimestamp = toSessionTimestamp(pe.scheduled_date);

      for (let orderIndex = 1; orderIndex <= sets; orderIndex += 1) {
        await db.query(
          `
          INSERT INTO segment_exercise_log (
            id, user_id, program_id, program_day_id,
            workout_segment_id, program_exercise_id,
            order_index, weight_kg, reps_completed,
            rir_actual, estimated_1rm_kg, is_draft,
            created_at, updated_at
          )
          VALUES (
            gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11::timestamptz,$11::timestamptz
          )
          ON CONFLICT (user_id, workout_segment_id, program_exercise_id, order_index)
          DO NOTHING
          `,
          [
            pgUserId,
            programId,
            pe.program_day_id,
            pe.workout_segment_id,
            pe.program_exercise_id,
            orderIndex,
            weightKg,
            reps,
            rir,
            e1rm,
            sessionTimestamp,
          ],
        );
      }
    }

    for (const [programDayId, exerciseCount] of dayExerciseCounts.entries()) {
      await db.query(
        `
        UPDATE program_day
        SET is_completed = TRUE,
            session_duration_mins = $1,
            updated_at = now()
        WHERE id = $2
        `,
        [50 + exerciseCount * 5, programDayId],
      );
    }

    const beforeSeed = new Date();
    await progressionService.applyProgressionRecommendations({
      programId,
      userId: pgUserId,
      programType: "strength",
      fitnessRank,
    });

    const lastDayDate = weekExercises[weekExercises.length - 1]?.scheduled_date;
    if (lastDayDate) {
      await db.query(
        `
        UPDATE exercise_progression_decision
        SET created_at = $1::timestamptz
        WHERE user_id = $2
          AND program_id = $3
          AND created_at >= $4
        `,
        [toSessionTimestamp(lastDayDate), pgUserId, programId, beforeSeed.toISOString()],
      );
    }
  }

  const logsR = await db.query(`SELECT COUNT(*) AS count FROM segment_exercise_log WHERE program_id = $1`, [programId]);
  const decisionsR = await db.query(
    `SELECT COUNT(*) AS count FROM exercise_progression_decision WHERE program_id = $1`,
    [programId],
  );

  return {
    daysCompleted: totalDayIds.size,
    logsInserted: Number(logsR.rows[0]?.count ?? 0),
    decisionsWritten: Number(decisionsR.rows[0]?.count ?? 0),
    anchorCoverage: null,
  };
}

async function seedRobustHistory({ db, programId, pgUserId, weeks }) {
  const exerciseQ = await db.query(
    `
    SELECT
      pd.id AS program_day_id,
      pd.week_number,
      pd.day_number,
      pd.scheduled_date,
      pe.id AS program_exercise_id,
      pe.exercise_id,
      pe.workout_segment_id,
      pe.sets_prescribed,
      pe.purpose
    FROM program_day pd
    JOIN program_exercise pe ON pe.program_day_id = pd.id
    WHERE pd.program_id = $1
      AND pe.is_loadable = TRUE
    ORDER BY pd.week_number ASC, pd.day_number ASC, pe.order_in_day ASC
    `,
    [programId],
  );

  const completedDayIds = new Set();
  let logsInserted = 0;
  let decisionsWritten = 0;

  for (const row of exerciseQ.rows) {
    const weekIndex = Math.max(0, Number(row.week_number) - 1);
    const current = getRobustPrescription(row.exercise_id, weekIndex);
    const next = getRobustPrescription(row.exercise_id, Math.min(weeks - 1, weekIndex + 1));
    const sets = Math.max(1, Number.parseInt(String(row.sets_prescribed ?? ""), 10) || 4);
    const sessionTimestamp = toSessionTimestamp(row.scheduled_date);
    const estimatedE1rmKg = Number((current.loadKg * (1 + current.reps / 30)).toFixed(2));
    let sourceLogId = null;

    for (let orderIndex = 1; orderIndex <= sets; orderIndex += 1) {
      const logInsert = await db.query(
        `
        INSERT INTO segment_exercise_log (
          id, user_id, program_id, program_day_id,
          workout_segment_id, program_exercise_id,
          order_index, weight_kg, reps_completed,
          rir_actual, estimated_1rm_kg, is_draft,
          created_at, updated_at
        )
        VALUES (
          gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11::timestamptz,$11::timestamptz
        )
        RETURNING id
        `,
        [
          pgUserId,
          programId,
          row.program_day_id,
          row.workout_segment_id,
          row.program_exercise_id,
          orderIndex,
          current.loadKg,
          current.reps,
          current.rir,
          estimatedE1rmKg,
          sessionTimestamp,
        ],
      );
      sourceLogId = logInsert.rows[0]?.id ?? sourceLogId;
      logsInserted += 1;
    }

    const recommendedLoadKg = next.loadKg;
    const recommendedRepsTarget = next.reps;
    const recommendedLoadDeltaKg =
      Number.isFinite(recommendedLoadKg) && Number.isFinite(current.loadKg)
        ? Number((recommendedLoadKg - current.loadKg).toFixed(2))
        : null;
    const recommendedRepDelta = Number.isFinite(recommendedRepsTarget) ? recommendedRepsTarget - current.reps : null;

    await db.query(
      `
      UPDATE program_exercise
      SET
        progression_outcome = $2,
        progression_primary_lever = $3,
        progression_confidence = $4,
        progression_source = $5,
        progression_reasoning_json = $6::jsonb,
        recommended_load_kg = $7,
        recommended_reps_target = $8,
        recommended_sets = $9,
        recommended_rest_seconds = $10
      WHERE id = $1
      `,
      [
        row.program_exercise_id,
        current.outcome,
        current.primaryLever,
        current.confidence,
        "seed",
        JSON.stringify({ mode: "robust_seed", week: row.week_number }),
        recommendedLoadKg,
        recommendedRepsTarget,
        sets,
        120,
      ],
    );

    await db.query(
      `
      INSERT INTO exercise_progression_decision (
        user_id,
        program_id,
        program_day_id,
        program_exercise_id,
        source_log_id,
        exercise_id,
        progression_group_key,
        purpose,
        decision_outcome,
        primary_lever,
        confidence,
        recommended_load_delta_kg,
        recommended_rep_delta,
        recommended_set_delta,
        recommended_rest_delta_sec,
        recommended_load_kg,
        recommended_reps_target,
        recommended_sets,
        recommended_rest_seconds,
        evidence_summary_json,
        decision_context_json,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,NULL,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20::timestamptz
      )
      `,
      [
        pgUserId,
        programId,
        row.program_day_id,
        row.program_exercise_id,
        sourceLogId,
        row.exercise_id,
        `${row.exercise_id}::${row.purpose || "main"}`,
        row.purpose || "main",
        current.outcome,
        current.primaryLever,
        current.confidence,
        recommendedLoadDeltaKg,
        recommendedRepDelta,
        recommendedLoadKg,
        recommendedRepsTarget,
        sets,
        120,
        JSON.stringify({
          latest_weight_kg: current.loadKg,
          latest_reps_completed: current.reps,
          latest_rir: current.rir,
        }),
        JSON.stringify({ mode: "robust_seed", week: row.week_number }),
        sessionTimestamp,
      ],
    );
    decisionsWritten += 1;

    if (!completedDayIds.has(row.program_day_id)) {
      completedDayIds.add(row.program_day_id);
      await db.query(
        `
        UPDATE program_day
        SET is_completed = TRUE,
            session_duration_mins = 55,
            updated_at = $2::timestamptz
        WHERE id = $1
        `,
        [row.program_day_id, sessionTimestamp],
      );
    }
  }

  return {
    daysCompleted: completedDayIds.size,
    logsInserted,
    decisionsWritten,
    anchorCoverage: {
      bb_back_squat: weeks,
      bb_bench_press: weeks,
      [ROBUST_PULL_EXERCISE_ID]: weeks,
    },
  };
}

export function createAdminSeedHistoryHandler({
  db = pool,
  pipeline = runPipeline,
  emitPayload = importEmitterPayload,
  progressionService = makeProgressionDecisionService(db),
  buildInputs = buildInputsFromProfile,
  getAllowed = getAllowedExercises,
} = {}) {
  return async function adminSeedHistoryHandler(req, res) {
    const startTime = Date.now();
    const rawUserIdentifier = String(req.body?.userId ?? req.body?.userEmail ?? req.body?.userIdentifier ?? "").trim();
    const mode = normalizeSeedMode(req.body?.mode);
    const weeks = clampInt(req.body?.weeks, 12, mode === "quick" ? 4 : 8, 24);
    const daysPerWeek = clampInt(req.body?.daysPerWeek, 3, 2, 5);

    if (!rawUserIdentifier) {
      return res.status(400).json({ ok: false, code: "missing_user_id" });
    }

    try {
      await db.query(`ALTER TABLE program ADD COLUMN IF NOT EXISTS program_type TEXT NULL`).catch(() => {});

      const isUuidIdentifier = UUID_RE.test(rawUserIdentifier);
      const userR = await db.query(
        isUuidIdentifier
          ? `SELECT id, email FROM app_user WHERE id = $1`
          : `SELECT id, email FROM app_user WHERE lower(email) = lower($1)`,
        [rawUserIdentifier],
      );
      if (userR.rowCount === 0) {
        return res.status(404).json({ ok: false, code: "user_not_found" });
      }
      const pgUserId = userR.rows[0].id;
      const resolvedUserEmail = userR.rows[0].email ?? null;

      await db.query(`DELETE FROM program WHERE user_id = $1 AND program_type = 'strength_seed'`, [pgUserId]);

      const resolvedProfile = await getProfileForPgUserId(db, pgUserId, pgUserId);
      const profile = resolvedProfile
        ? {
            ...DEFAULT_PROFILE,
            ...resolvedProfile,
            preferredDays:
              Array.isArray(resolvedProfile.preferredDays) && resolvedProfile.preferredDays.length > 0
                ? resolvedProfile.preferredDays
                : DEFAULT_PROFILE.preferredDays.slice(0, daysPerWeek),
          }
        : {
            ...DEFAULT_PROFILE,
            preferredDays: DEFAULT_PROFILE.preferredDays.slice(0, daysPerWeek),
          };

      const exercisesR = await db.query(`
        SELECT
          exercise_id, name, movement_class, movement_pattern_primary, is_loadable,
          strength_equivalent, min_fitness_rank, complexity_rank, density_rating,
          equipment_json, coaching_cues_json, load_guidance, logging_guidance,
          preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json,
          warmup_hooks, accepts_distance_unit, strength_primary_region
        FROM exercise_catalogue
        WHERE is_archived = false
        ORDER BY exercise_id
      `);
      const exerciseRows = exercisesR.rows;

      if (mode === "robust") {
        ensureRobustRequiredExercises(exerciseRows);
      }

      const fitnessRank = mapFitnessRank(profile.fitnessLevel);
      const allowedIds = await getAllowed(db, {
        fitness_rank: fitnessRank,
        injury_flags_slugs: (profile.injuryFlags ?? []).map(toSlug),
        equipment_items_slugs: (profile.equipmentItemCodes ?? []).map(toSlug),
      });

      const preferredDays = normalizePreferredDays(profile.preferredDays, daysPerWeek);
      const anchorMs = mode === "robust" ? computeRobustAnchorMs(weeks, preferredDays) : Date.now() - weeks * 7 * DAY_MS;
      const anchorDate = utcDateFromMs(anchorMs);

      const programR = await db.query(
        `
        INSERT INTO program (
          user_id, program_title, program_summary, weeks_count, days_per_week,
          program_outline_json, start_date, start_offset_days, start_weekday,
          preferred_days_sorted_json, status, is_ready, program_type
        )
        VALUES ($1,'Generating...','Generating...',$2,$3,'{}'::jsonb,$4::date,0,'','[]'::jsonb,'generating',false,'strength_seed')
        RETURNING id
        `,
        [pgUserId, weeks, daysPerWeek, anchorDate],
      );
      const programId = programR.rows[0].id;

      let rows = null;
      let anchorCoverage = null;

      if (mode === "robust") {
        const robustRows = buildRobustEmitterRows({ weeks, daysPerWeek, preferredDays });
        rows = robustRows.rows;
        anchorCoverage = robustRows.anchorCoverage;
      } else {
        const inputs = {
          ...buildInputs(profile, exerciseRows),
          allowed_exercise_ids: allowedIds.map(String),
        };

        const pipelineOut = await pipeline({
          db,
          inputs,
          programType: "strength",
          userId: pgUserId,
          request: {
            anchor_date_ms: anchorMs,
            allowed_ids_csv: allowedIds.join(","),
            preferred_days_json: preferredDays.join(","),
            duration_mins: profile.minutesPerSession ?? 60,
            days_per_week: daysPerWeek,
            fitness_rank: fitnessRank,
          },
        });

        rows = Array.isArray(pipelineOut?.rows)
          ? pipelineOut.rows
          : Array.isArray(pipelineOut?.plan?.rows)
            ? pipelineOut.plan.rows
            : null;
      }

      if (!rows?.length) {
        throw new Error("Pipeline produced no emitter rows");
      }

      await emitPayload({
        poolOrClient: db,
        payload: {
          user_id: pgUserId,
          anchor_date_ms: anchorMs,
          rows,
          program_id: programId,
        },
        request_id: req.request_id ?? "seed-history",
      });

      await db.query(
        `
        UPDATE program
        SET program_title = $2,
            program_summary = $3,
            status = 'active',
            program_type = 'strength_seed',
            is_ready = TRUE,
            updated_at = now()
        WHERE id = $1
        `,
        [
          programId,
          mode === "robust" ? "Seed History (Robust)" : "Seed History (Strength)",
          mode === "robust"
            ? `Deterministic ${weeks}-week robust history generated for testing.`
            : `Synthetic ${weeks}-week history generated for testing.`,
        ],
      );

      let result;
      if (mode === "robust") {
        result = await seedRobustHistory({ db, programId, pgUserId, weeks });
      } else {
        const exerciseQ = await db.query(
          `
          SELECT
            pd.id AS program_day_id,
            pd.scheduled_date,
            pd.week_number,
            pe.id AS program_exercise_id,
            pe.exercise_id,
            pe.workout_segment_id,
            pe.sets_prescribed,
            pe.reps_prescribed,
            pe.is_loadable,
            pe.purpose,
            pe.order_in_day,
            ec.strength_primary_region
          FROM program_day pd
          JOIN program_exercise pe ON pe.program_day_id = pd.id
          LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
          WHERE pd.program_id = $1
            AND pe.is_loadable = TRUE
            AND pe.purpose IN ('main', 'secondary')
          ORDER BY pd.scheduled_date ASC, pe.order_in_day ASC
          `,
          [programId],
        );

        const weeksMap = new Map();
        for (const row of exerciseQ.rows) {
          const weekNumber = Number(row.week_number);
          if (!weeksMap.has(weekNumber)) weeksMap.set(weekNumber, []);
          weeksMap.get(weekNumber).push(row);
        }
        const orderedWeekNumbers = [...weeksMap.keys()].sort((a, b) => a - b);
        result = await seedQuickHistory({
          db,
          programId,
          pgUserId,
          orderedWeekNumbers,
          weeksMap,
          totalWeeks: orderedWeekNumbers.length,
          progressionService,
          fitnessRank,
        });
      }

      await db.query(`UPDATE program SET status = 'completed', updated_at = now() WHERE id = $1`, [programId]);

      return res.json({
        ok: true,
        mode,
        programId,
        userId: pgUserId,
        userEmail: resolvedUserEmail,
        weeksGenerated: weeks,
        daysCompleted: result.daysCompleted,
        logsInserted: result.logsInserted,
        decisionsWritten: result.decisionsWritten,
        anchorExerciseCoverage: result.anchorCoverage ?? anchorCoverage,
        runtimeMs: Date.now() - startTime,
      });
    } catch (err) {
      req.log?.error?.(
        { event: "admin.seed_history.error", err: err?.message, stack: err?.stack },
        "Synthetic history seeding failed",
      );
      return res.status(500).json({
        ok: false,
        code: "seed_failed",
        error: publicInternalError(err),
      });
    }
  };
}

adminSeedHistoryRouter.post("/seed-history", createAdminSeedHistoryHandler());
