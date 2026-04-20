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
  const rangeMatch = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return Math.round((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2);
  }
  const single = Number.parseInt(raw, 10);
  return Number.isFinite(single) ? single : 8;
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
    const weeks = clampInt(req.body?.weeks, 12, 4, 24);
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

      await db.query(
        `DELETE FROM program WHERE user_id = $1 AND program_type = 'strength_seed'`,
        [pgUserId],
      );

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

      const fitnessRank = mapFitnessRank(profile.fitnessLevel);
      const allowedIds = await getAllowed(db, {
        fitness_rank: fitnessRank,
        injury_flags_slugs: (profile.injuryFlags ?? []).map(toSlug),
        equipment_items_slugs: (profile.equipmentItemCodes ?? []).map(toSlug),
      });

      const anchorMs = Date.now() - weeks * 7 * DAY_MS;
      const anchorDate = new Date(anchorMs).toISOString().slice(0, 10);

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
        [pgUserId, 1, daysPerWeek, anchorDate],
      );
      const programId = programR.rows[0].id;

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
          preferred_days_json: (profile.preferredDays ?? []).slice(0, daysPerWeek).join(","),
          duration_mins: profile.minutesPerSession ?? 60,
          days_per_week: daysPerWeek,
          fitness_rank: fitnessRank,
        },
      });

      const rows = Array.isArray(pipelineOut?.rows)
        ? pipelineOut.rows
        : Array.isArray(pipelineOut?.plan?.rows)
          ? pipelineOut.plan.rows
          : null;
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
        SET program_title = 'Seed History (Strength)',
            program_summary = $2,
            status = 'active',
            program_type = 'strength_seed',
            is_ready = TRUE,
            updated_at = now()
        WHERE id = $1
        `,
        [programId, `Synthetic ${weeks}-week history generated for testing.`],
      );

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

      const totalDayIds = new Set();
      for (let index = 0; index < orderedWeekNumbers.length; index += 1) {
        const weekNumber = orderedWeekNumbers[index];
        const weekExercises = weeksMap.get(weekNumber) ?? [];
        const rir = rirForWeek(index, orderedWeekNumbers.length);
        const dayExerciseCounts = new Map();

        for (const pe of weekExercises) {
          totalDayIds.add(pe.program_day_id);
          dayExerciseCounts.set(pe.program_day_id, (dayExerciseCounts.get(pe.program_day_id) ?? 0) + 1);

          const weightKg = weekWeight(pe.strength_primary_region, index, orderedWeekNumbers.length);
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

      await db.query(
        `UPDATE program SET status = 'completed', updated_at = now() WHERE id = $1`,
        [programId],
      );

      const logsR = await db.query(
        `SELECT COUNT(*) AS count FROM segment_exercise_log WHERE program_id = $1`,
        [programId],
      );
      const decisionsR = await db.query(
        `SELECT COUNT(*) AS count FROM exercise_progression_decision WHERE program_id = $1`,
        [programId],
      );

      return res.json({
        ok: true,
        programId,
        userId: pgUserId,
        userEmail: resolvedUserEmail,
        weeksGenerated: weeks,
        daysCompleted: totalDayIds.size,
        logsInserted: Number(logsR.rows[0]?.count ?? 0),
        decisionsWritten: Number(decisionsR.rows[0]?.count ?? 0),
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
