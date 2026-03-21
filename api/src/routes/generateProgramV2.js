import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";
import { runPipeline } from "../../engine/runPipeline.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { importEmitterPayload } from "../services/importEmitterService.js";
import { buildInputsFromDevProfile } from "../services/buildInputsFromDevProfile.js";
import { ensureProgramCalendarCoverage } from "../services/calendarCoverage.js";
import { getProfileByBubbleUserId } from "../services/clientProfileService.js";
import { publicInternalError } from "../utils/publicError.js";

export const generateProgramV2Router = express.Router();

let cachedInjuryColumn = null;

function s(v) {
  return (v ?? "").toString().trim();
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

function mapFitnessRank(fitnessLevel) {
  const v = s(fitnessLevel).toLowerCase();
  if (v === "intermediate") return 1;
  if (v === "advanced") return 2;
  if (v === "elite") return 3;
  return 0;
}

function ensureArray(value, mapFn) {
  if (!Array.isArray(value)) return [];
  return value.map(mapFn).filter(Boolean);
}

/** Returns YYYY-MM-DD for the UTC day containing the given ms timestamp. */
function utcDateString(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function resolveInjuryColumn(client) {
  if (cachedInjuryColumn) return cachedInjuryColumn;

  const r = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_profile'
      AND column_name IN ('injury_flags_slugs', 'injury_flags')
    `,
  );

  const cols = new Set(r.rows.map((x) => x.column_name));
  if (cols.has("injury_flags_slugs")) {
    cachedInjuryColumn = "injury_flags_slugs";
    return cachedInjuryColumn;
  }
  if (cols.has("injury_flags")) {
    cachedInjuryColumn = "injury_flags";
    return cachedInjuryColumn;
  }

  throw new Error("client_profile missing injury flags column (injury_flags_slugs or injury_flags)");
}

generateProgramV2Router.post("/generate-plan-v2", requireInternalToken, async (req, res) => {
  const request_id = req.request_id;
  const bubble_user_id = s(req.body?.bubble_user_id);
  const programTypeInput = s(req.body?.programType);
  const anchorInput = req.body?.anchor_date_ms;
  const anchor_date_ms = anchorInput == null ? Date.now() : Number(anchorInput);

  if (!bubble_user_id) {
    return res.status(400).json({ ok: false, code: "validation_error", error: "Missing bubble_user_id" });
  }
  if (!Number.isFinite(anchor_date_ms)) {
    return res.status(400).json({ ok: false, code: "validation_error", error: "anchor_date_ms must be a finite number" });
  }

  const devProfile = await getProfileByBubbleUserId(bubble_user_id);
  if (!devProfile) {
    return res.status(404).json({ ok: false, code: "not_found", error: "Client profile not found for bubble_user_id" });
  }

  const GOAL_TO_PROGRAM_TYPE = {
    strength: "strength",
    hypertrophy: "hypertrophy",
    conditioning: "conditioning",
    endurance: "conditioning",
    Hyrox: "hyrox",
    hyrox: "hyrox",
    HYROX: "hyrox",
    hyrox_workout: "hyrox",
  };
  const goalSlugs = ensureArray(devProfile.goals, toSlug);
  const goalDerivedType = goalSlugs.map((g) => GOAL_TO_PROGRAM_TYPE[g]).find(Boolean) ?? null;
  const explicitType = programTypeInput && programTypeInput !== "default" ? programTypeInput : null;
  const programType = explicitType || goalDerivedType || s(devProfile.programType) || "hypertrophy";

  req.log.debug({ event: "pipeline.type_resolution",
    rawGoals: devProfile.goals,
    goalSlugs,
    goalDerivedType,
    explicitType,
    profileProgramType: devProfile.programType,
    resolvedProgramType: programType,
  }, "program-type resolution");

  const mappedFitnessRank = mapFitnessRank(devProfile.fitnessLevel);
  const mappedEquipmentSlugs = ensureArray(devProfile.equipmentItemCodes, toSlug);
  const mappedInjuryFlags = ensureArray(devProfile.injuryFlags, toSlug);
  const mappedPreferredDays = ensureArray(devProfile.preferredDays, toPreferredDayCode);
  const mappedGoals = ensureArray(devProfile.goals, toSlug);
  const mappedMinutesPerSession = Number.isFinite(Number(devProfile.minutesPerSession))
    ? Number(devProfile.minutesPerSession)
    : null;
  const mappedHeightCm = Number.isFinite(Number(devProfile.heightCm)) ? Number(devProfile.heightCm) : null;
  const mappedWeightKg = Number.isFinite(Number(devProfile.weightKg)) ? Number(devProfile.weightKg) : null;
  const mappedEquipmentPreset = s(devProfile.equipmentPreset);
  const mappedGoalNotes = s(devProfile.goalNotes) || null;
  const mappedScheduleConstraints = s(devProfile.scheduleConstraints) || null;

  const daysPerWeek = mappedPreferredDays.length || 3;
  const anchorDate = utcDateString(anchor_date_ms);

  // ── Phase 1 + 2: Setup (DB work before pipeline) ─────────────────────────
  // Upsert user + profile, fetch exercise catalogue, pre-create program +
  // generation_run rows. All in a single transaction so we get program_id
  // before the (slow) pipeline runs.

  let pg_user_id;
  let created_program_id;
  let generation_run_id;
  let allowedIds = [];
  let exerciseRows = [];

  const setupClient = await pool.connect();
  try {
    await setupClient.query("BEGIN");

    // Phase 1a: Upsert app_user
    const userR = await setupClient.query(
      `
      INSERT INTO app_user (bubble_user_id)
      VALUES ($1)
      ON CONFLICT (bubble_user_id)
      DO UPDATE SET updated_at = now()
      RETURNING id
      `,
      [bubble_user_id],
    );
    pg_user_id = userR.rows[0].id;

    // Phase 1b: Upsert client_profile
    const injuryColumn = await resolveInjuryColumn(setupClient);
    const profileSql = `
      INSERT INTO client_profile (
        user_id,
        bubble_client_profile_id,
        fitness_rank,
        equipment_items_slugs,
        ${injuryColumn},
        preferred_days,
        main_goals_slugs,
        minutes_per_session,
        height_cm,
        weight_kg,
        equipment_preset_slug,
        goal_notes,
        schedule_constraints,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4::text[],$5::text[],$6::text[],$7::text[],$8,$9,$10,$11,$12,$13,now()
      )
      ON CONFLICT (bubble_client_profile_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        fitness_rank = EXCLUDED.fitness_rank,
        equipment_items_slugs = EXCLUDED.equipment_items_slugs,
        ${injuryColumn} = EXCLUDED.${injuryColumn},
        preferred_days = EXCLUDED.preferred_days,
        main_goals_slugs = EXCLUDED.main_goals_slugs,
        minutes_per_session = EXCLUDED.minutes_per_session,
        height_cm = EXCLUDED.height_cm,
        weight_kg = EXCLUDED.weight_kg,
        equipment_preset_slug = EXCLUDED.equipment_preset_slug,
        goal_notes = EXCLUDED.goal_notes,
        schedule_constraints = EXCLUDED.schedule_constraints,
        updated_at = now()
      RETURNING id
    `;

    await setupClient.query(profileSql, [
      pg_user_id,
      bubble_user_id,
      mappedFitnessRank,
      mappedEquipmentSlugs,
      mappedInjuryFlags,
      mappedPreferredDays,
      mappedGoals,
      mappedMinutesPerSession,
      mappedHeightCm,
      mappedWeightKg,
      mappedEquipmentPreset || null,
      mappedGoalNotes,
      mappedScheduleConstraints,
    ]);

    // Phase 1c: Allowed exercise IDs + exercise catalogue
    allowedIds = await getAllowedExerciseIds(setupClient, {
      fitness_rank: mappedFitnessRank,
      injury_flags_slugs: mappedInjuryFlags,
      equipment_items_slugs: mappedEquipmentSlugs,
    });

    const exercisesR = await setupClient.query(
      `
      SELECT
        exercise_id,
        name,
        movement_class,
        movement_pattern_primary,
        is_loadable,
        complexity_rank,
        density_rating,
        equipment_json,
        preferred_in_json,
        swap_group_id_1,
        swap_group_id_2,
        target_regions_json,
        warmup_hooks
      FROM exercise_catalogue
      WHERE is_archived = false
      ORDER BY exercise_id
      `,
    );
    exerciseRows = exercisesR.rows;

    // Phase 2: Pre-create program row (placeholder values; real values written post-import)
    // Constraints: weeks_count >= 1, days_per_week 1-7, is_ready default false.
    const programR = await setupClient.query(
      `
      INSERT INTO program (
        user_id,
        program_title,
        program_summary,
        weeks_count,
        days_per_week,
        program_outline_json,
        start_date,
        start_offset_days,
        start_weekday,
        preferred_days_sorted_json,
        status,
        is_ready
      )
      VALUES ($1,'Generating...','Generating...',$2,$3,'{}'::jsonb,$4::date,0,'','[]'::jsonb,'generating',false)
      RETURNING id
      `,
      [pg_user_id, 1, daysPerWeek, anchorDate],
    );
    created_program_id = programR.rows[0].id;

    // Phase 2b: Pre-create generation_run
    const runR = await setupClient.query(
      `
      INSERT INTO generation_run (
        program_id,
        status,
        last_stage,
        program_type,
        days_per_week,
        anchor_date_ms,
        allowed_exercise_count
      )
      VALUES ($1,'started','pre_create',$2,$3,$4,$5)
      RETURNING id
      `,
      [created_program_id, programType, daysPerWeek, anchor_date_ms, allowedIds.length],
    );
    generation_run_id = runR.rows[0].id;

    await setupClient.query("COMMIT");
  } catch (err) {
    try { await setupClient.query("ROLLBACK"); } catch (_) { /* ignore */ }
    req.log.error({ event: "pipeline.setup.error", err: err?.message, stack: err?.stack }, "generate-plan-v2 setup error");
    return res.status(500).json({
      ok: false,
      request_id,
      code: "internal_error",
      error: publicInternalError(err),
    });
  } finally {
    setupClient.release();
  }

  // ── Phase 3–6: Pipeline + import (program_id is now stable) ──────────────
  // On any error: mark generation_run + program as failed (best-effort, no delete).

  async function markFailed(message) {
    await pool
      .query(
        `UPDATE generation_run SET status='failed', last_stage='error', failed_at=now(), error_message=$1, updated_at=now() WHERE id=$2`,
        [message, generation_run_id],
      )
      .catch((e) => req.log.error({ event: "pipeline.mark_failed.error", err: e?.message }, "markFailed gen_run error"));
    await pool
      .query(`UPDATE program SET status='failed', updated_at=now() WHERE id=$1`, [created_program_id])
      .catch((e) => req.log.error({ event: "pipeline.mark_failed.error", err: e?.message }, "markFailed program error"));
  }

  try {
    // Phase 3: Run pipeline
    await pool.query(
      `UPDATE generation_run SET last_stage='pipeline', updated_at=now() WHERE id=$1`,
      [generation_run_id],
    );

    const inputs = buildInputsFromDevProfile(devProfile, exerciseRows);
    const allowed_ids_csv = allowedIds.join(",");

    req.log.info({
      event: "pipeline.run.start",
      program_type: programType,
      days_per_week: daysPerWeek,
      duration_mins: mappedMinutesPerSession ?? 50,
      fitness_rank: mappedFitnessRank,
      allowed_exercise_count: allowedIds.length,
      generation_run_id,
    }, "Pipeline starting");

    const pipelineOut = await runPipeline({
      db: pool,
      inputs,
      programType,
      request: {
        anchor_date_ms,
        allowed_ids_csv,
        preferred_days_json: mappedPreferredDays.join(","),
        duration_mins: mappedMinutesPerSession ?? 50,
        days_per_week: daysPerWeek,
        fitness_rank: mappedFitnessRank,
      },
    });

    const rows = Array.isArray(pipelineOut?.rows)
      ? pipelineOut.rows
      : Array.isArray(pipelineOut?.plan?.rows)
        ? pipelineOut.plan.rows
        : null;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Pipeline did not produce emitter rows");
    }

    req.log.info({
      event: "pipeline.run.finish",
      program_type: programType,
      config_key: pipelineOut?.debug?.step1?.config_key ?? pipelineOut?.plan?.debug?.step1?.config_key ?? null,
      equipment_profile: pipelineOut?.debug?.step1?.equipment_profile ?? pipelineOut?.plan?.debug?.step1?.equipment_profile ?? null,
      fill_failed: pipelineOut?.debug?.step1?.fill_failed ?? pipelineOut?.plan?.debug?.step1?.fill_failed ?? null,
      emitter_rows: rows.length,
      generation_run_id,
    }, "Pipeline completed");

    // Phase 3b: Persist pipeline debug to generation_run (best-effort — never throws).
    try {
      const step1Debug = pipelineOut?.debug?.step1 ?? pipelineOut?.plan?.debug?.step1 ?? {};
      const step5Debug = pipelineOut?.debug?.step5 ?? pipelineOut?.plan?.debug?.step5 ?? {};
      const step6Debug = pipelineOut?.debug?.step6 ?? pipelineOut?.plan?.debug?.step6 ?? {};
      const step1Json = JSON.stringify(step1Debug);
      const step5Json = JSON.stringify(step5Debug);
      const step6Json = JSON.stringify(step6Debug);
      await pool.query(
        `UPDATE generation_run SET
           config_key       = $1,
           fitness_rank     = $2,
           duration_mins    = $3,
           step1_stats_json = $4::jsonb,
           step5_debug_json = $5::jsonb,
           step6_debug_json = $6::jsonb,
           updated_at       = now()
         WHERE id = $7`,
        [
          step1Debug.config_key ?? null,
          mappedFitnessRank ?? null,
          step1Debug.duration_mins ?? null,
          step1Json.length > 65536 ? null : step1Json,
          step5Json.length > 65536 ? null : step5Json,
          step6Json.length > 65536 ? null : step6Json,
          generation_run_id,
        ],
      );
    } catch (debugErr) {
      req.log.warn({ event: "pipeline.debug_persist.error", err: debugErr?.message }, "generation_run debug persist failed (non-fatal)");
    }

    // Phase 4: Import child rows into the pre-created program
    await pool.query(
      `UPDATE generation_run SET last_stage='importing', updated_at=now() WHERE id=$1`,
      [generation_run_id],
    );

    const importResult = await importEmitterPayload({
      poolOrClient: pool,
      payload: {
        user_id: pg_user_id,
        anchor_date_ms,
        rows,
        program_id: created_program_id,
      },
      request_id,
    });

    // Phase 5: UPDATE program with real values from parsed PRG row
    const prgData = importResult.prg_data ?? {};
    const programTitle = prgData.program_title
      || `${programType.charAt(0).toUpperCase() + programType.slice(1)} Program`;
    const programSummary = prgData.program_summary
      || `Auto-generated ${programType} program.`;

    await pool.query(
      `
      UPDATE program SET
        program_title = $1,
        program_summary = $2,
        weeks_count = $3,
        days_per_week = $4,
        program_outline_json = $5::jsonb,
        start_date = $6::date,
        start_offset_days = $7,
        start_weekday = $8,
        preferred_days_sorted_json = $9::jsonb,
        hero_media_id = $10,
        status = 'active',
        is_ready = true,
        updated_at = now()
      WHERE id = $11
      `,
      [
        programTitle,
        programSummary,
        prgData.weeks_count ?? 1,
        prgData.days_per_week ?? daysPerWeek,
        JSON.stringify(prgData.program_outline_json ?? {}),
        prgData.start_date ?? anchorDate,
        prgData.start_offset_days ?? 0,
        prgData.start_weekday ?? "",
        JSON.stringify(prgData.preferred_days_sorted_json ?? []),
        pipelineOut?.program?.hero_media_id ?? null,
        created_program_id,
      ],
    );

    // Phase 5c: day hero_media_id
    // Match on (program_id, week_number, day_number) — same keys the emitter wrote.
    const dayHeroUpdates = [];
    for (const wk of pipelineOut?.program?.weeks ?? []) {
      for (const day of wk.days ?? []) {
        if (day.hero_media_id) {
          dayHeroUpdates.push([
            day.hero_media_id,
            created_program_id,
            wk.week_index,
            day.day_index,
          ]);
        }
      }
    }
    for (const [heroId, progId, weekNum, dayNum] of dayHeroUpdates) {
      await pool.query(
        `UPDATE program_day
            SET hero_media_id = $1
          WHERE program_id = $2
            AND week_number = $3
            AND day_number  = $4`,
        [heroId, progId, weekNum, dayNum],
      );
    }

    // Phase 5b: Fill recovery (rest) days into program_calendar_day.
    // Must run after the program row has its final start_date + weeks_count
    // and after importEmitterPayload has committed the training-day rows.
    await pool.query(
      `UPDATE generation_run SET last_stage='calendar_coverage', updated_at=now() WHERE id=$1`,
      [generation_run_id],
    );
    await ensureProgramCalendarCoverage(pool, created_program_id);

    // Phase 6: Mark generation_run complete
    await pool.query(
      `
      UPDATE generation_run SET
        status = 'complete',
        last_stage = 'done',
        completed_at = now(),
        total_days_expected = $1,
        emitter_rows_count = $2,
        updated_at = now()
      WHERE id = $3
      `,
      [importResult.counts?.days ?? 0, rows.length, generation_run_id],
    );

    return res.json({
      ok: true,
      program_id: created_program_id,
      generation_run_id,
      program_type: programType,
      counts: importResult.counts,
      idempotent: importResult.idempotent,
    });
  } catch (err) {
    req.log.error({ event: "pipeline.error", err: err?.message, stack: err?.stack }, "generate-plan-v2 pipeline/import error");
    await markFailed(err?.message || "unknown error");
    return res.status(500).json({
      ok: false,
      request_id,
      code: "internal_error",
      error: publicInternalError(err),
      program_id: created_program_id,
      generation_run_id,
    });
  }
});
