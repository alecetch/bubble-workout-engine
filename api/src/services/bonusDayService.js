import { runPipeline } from "../../engine/runPipeline.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { buildInputsFromProfile } from "./buildInputsFromProfile.js";
import { parseEmitterRows } from "./importEmitterService.js";
import { programCalendarDayHasUserIdColumn } from "./programCalendarDaySchema.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function serviceError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
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

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function toIsoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function toAnchorDayMs(dateString) {
  return new Date(`${toIsoDate(dateString)}T00:00:00.000Z`).getTime();
}

function weekdayForDate(dateString) {
  const parsed = new Date(`${String(dateString).slice(0, 10)}T00:00:00.000Z`);
  return WEEKDAY_CODES[parsed.getUTCDay()] ?? "";
}

export function daysBetween(startDate, targetDate) {
  return Math.floor((toAnchorDayMs(targetDate) - toAnchorDayMs(startDate)) / DAY_MS);
}

function rowToProfile(row, preferredDays) {
  return {
    id: row.id,
    userId: row.user_id,
    goals: row.main_goals_slugs ?? [],
    fitnessLevel: row.fitness_level_slug ?? null,
    injuryFlags: row.injury_flags ?? [],
    goalNotes: row.goal_notes ?? "",
    equipmentPreset: row.equipment_preset_slug ?? "",
    equipmentItemCodes: normalizeTextArray(row.equipment_items_slugs),
    preferredDays,
    scheduleConstraints: row.schedule_constraints ?? "",
    heightCm: row.height_cm ?? null,
    weightKg: row.weight_kg ?? null,
    minutesPerSession: row.minutes_per_session ?? null,
    sex: row.sex ?? null,
    ageRange: row.age_range ?? null,
    onboardingStepCompleted: row.onboarding_step_completed ?? 0,
    onboardingCompletedAt: row.onboarding_completed_at ?? null,
    programType: row.program_type_slug ?? null,
    preferredUnit: row.preferred_unit ?? "kg",
    preferredHeightUnit: row.preferred_height_unit ?? "cm",
  };
}

async function resolveTargetDates(db, { programId, scope, targetDate, weekday }) {
  if (scope === "today") return [targetDate];

  const recurringR = await db.query(
    `SELECT scheduled_date::text
     FROM program_calendar_day
     WHERE program_id = $1
       AND is_training_day = FALSE
       AND scheduled_weekday = $2
       AND scheduled_date >= $3::date
     ORDER BY scheduled_date`,
    [programId, weekday, targetDate],
  );

  return recurringR.rows.map((row) => toIsoDate(row.scheduled_date)).filter(Boolean);
}

async function findOrCreateProgramWeek(client, { programId, startDate, targetDate }) {
  const existingR = await client.query(
    `SELECT pw.id, pw.week_number
     FROM program_week pw
     JOIN program p ON p.id = pw.program_id
     WHERE pw.program_id = $1
       AND p.start_date + ((pw.week_number - 1) * 7) <= $2::date
       AND p.start_date + (pw.week_number * 7) > $2::date
     LIMIT 1`,
    [programId, targetDate],
  );
  if (existingR.rowCount > 0) return existingR.rows[0];

  const weekNumber = Math.max(1, Math.ceil((daysBetween(startDate, targetDate) + 1) / 7));
  const byNumberR = await client.query(
    `SELECT id, week_number
     FROM program_week
     WHERE program_id = $1 AND week_number = $2
     LIMIT 1`,
    [programId, weekNumber],
  );
  if (byNumberR.rowCount > 0) return byNumberR.rows[0];

  const insertR = await client.query(
    `INSERT INTO program_week (program_id, week_number, focus, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING id, week_number`,
    [programId, weekNumber, "Bonus", ""],
  );
  return insertR.rows[0];
}

async function insertTemplateForDate(client, {
  programId,
  userId,
  startDate,
  targetDate,
  templateDay,
  templateSegs,
  templateExs,
  programType,
  focusType,
  hasProgramCalendarDayUserId,
}) {
  const date = toIsoDate(targetDate);
  const programDayKey = `bonus:${programId}:${date}`;
  const week = await findOrCreateProgramWeek(client, { programId, startDate, targetDate: date });
  const scheduledWeekday = weekdayForDate(date);
  const scheduledOffsetDays = daysBetween(startDate, date);

  const nextGlobalR = await client.query(
    `SELECT COALESCE(MAX(global_day_index), 0) + 1 AS next_index
     FROM program_day
     WHERE program_id = $1`,
    [programId],
  );
  const nextDayNumberR = await client.query(
    `SELECT COALESCE(MAX(day_number), 0) + 1 AS next_day
     FROM program_day
     WHERE program_id = $1 AND week_number = $2`,
    [programId, week.week_number],
  );
  const globalDayIndex = Number(nextGlobalR.rows[0]?.next_index ?? 1);
  const dayNumber = Number(nextDayNumberR.rows[0]?.next_day ?? 1);

  await client.query(
    `DELETE FROM program_calendar_day
     WHERE program_id = $1
       AND scheduled_date = $2::date
       AND is_training_day = FALSE`,
    [programId, date],
  );

  const dayR = await client.query(
    `INSERT INTO program_day (
       program_id, program_week_id, week_number, day_number, global_day_index,
       program_day_key, day_label, day_type, focus_type,
       session_duration_mins, day_format_text,
       block_format_main_text, block_format_secondary_text, block_format_finisher_text,
       scheduled_offset_days, scheduled_weekday, scheduled_date,
       is_bonus
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::date,true)
     RETURNING id`,
    [
      programId,
      week.id,
      week.week_number,
      dayNumber,
      globalDayIndex,
      programDayKey,
      templateDay.day_label || "Bonus Workout",
      templateDay.day_type || programType,
      focusType || templateDay.day_focus || null,
      templateDay.session_duration_mins || 50,
      templateDay.day_format_text || "",
      templateDay.block_format_main_text || "",
      templateDay.block_format_secondary_text || "",
      templateDay.block_format_finisher_text || "",
      scheduledOffsetDays,
      scheduledWeekday,
      date,
    ],
  );
  const programDayId = dayR.rows[0].id;

  const calendarColumns = hasProgramCalendarDayUserId
    ? `program_id, user_id, program_week_id, program_day_id, week_number, scheduled_offset_days,
       scheduled_weekday, scheduled_date, global_day_index, is_training_day, program_day_key`
    : `program_id, program_week_id, program_day_id, week_number, scheduled_offset_days,
       scheduled_weekday, scheduled_date, global_day_index, is_training_day, program_day_key`;
  const calendarValues = hasProgramCalendarDayUserId
    ? `($1,$2,$3,$4,$5,$6,$7,$8::date,$9,true,$10)`
    : `($1,$2,$3,$4,$5,$6,$7::date,$8,true,$9)`;
  const calendarParams = hasProgramCalendarDayUserId
    ? [programId, userId, week.id, programDayId, week.week_number, scheduledOffsetDays, scheduledWeekday, date, globalDayIndex, programDayKey]
    : [programId, week.id, programDayId, week.week_number, scheduledOffsetDays, scheduledWeekday, date, globalDayIndex, programDayKey];

  await client.query(
    `INSERT INTO program_calendar_day (${calendarColumns}) VALUES ${calendarValues}`,
    calendarParams,
  );

  const segmentIdByKey = new Map();
  for (const seg of templateSegs) {
    const segR = await client.query(
      `INSERT INTO workout_segment (
         program_id, program_day_id, program_day_key, segment_key, block_key, block_order,
         segment_order_in_block, segment_type, purpose, purpose_label, segment_title,
         segment_notes, rounds, score_type, primary_score_label, secondary_score_label,
         segment_scheme_json, segment_duration_seconds, segment_duration_mmss, post_segment_rest_sec
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20)
       RETURNING id`,
      [
        programId,
        programDayId,
        programDayKey,
        seg.segment_key,
        seg.block_key,
        seg.block_order,
        seg.segment_order_in_block,
        seg.segment_type,
        seg.purpose,
        seg.purpose_label,
        seg.segment_title,
        seg.segment_notes,
        seg.rounds,
        seg.score_type || "none",
        seg.primary_score_label,
        seg.secondary_score_label,
        JSON.stringify(seg.segment_scheme_json || {}),
        seg.segment_duration_seconds,
        seg.segment_duration_mmss,
        seg.post_segment_rest_sec,
      ],
    );
    segmentIdByKey.set(seg.segment_key, segR.rows[0].id);
  }

  for (const ex of templateExs) {
    const workoutSegmentId = segmentIdByKey.get(ex.segment_key);
    if (!workoutSegmentId) continue;
    await client.query(
      `INSERT INTO program_exercise (
         program_id, program_day_id, workout_segment_id, program_day_key, segment_key,
         segment_type, exercise_id, order_in_day, block_order, order_in_block, purpose,
         purpose_label, sets_prescribed, reps_prescribed, reps_unit, intensity_prescription,
         tempo, rest_seconds, notes
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        programId,
        programDayId,
        workoutSegmentId,
        programDayKey,
        ex.segment_key,
        ex.segment_type,
        ex.exercise_id,
        ex.order_in_day,
        ex.block_order,
        ex.order_in_block,
        ex.purpose,
        ex.purpose_label,
        ex.sets_prescribed,
        ex.reps_prescribed,
        ex.reps_unit,
        ex.intensity_prescription,
        ex.tempo,
        ex.rest_seconds,
        ex.notes,
      ],
    );
  }

  await client.query(
    `UPDATE program_exercise pe
     SET
       exercise_name = ec.name,
       is_loadable = ec.is_loadable,
       equipment_items_slugs_csv = array_to_string(ec.equipment_items_slugs, ','),
       coaching_cues_json = ec.coaching_cues_json,
       load_hint = coalesce(ec.load_guidance, ''),
       log_prompt = coalesce(ec.logging_guidance, ''),
       notes = ''
     FROM exercise_catalogue ec
     WHERE pe.exercise_id = ec.exercise_id
       AND pe.program_day_id = $1`,
    [programDayId],
  );

  return programDayId;
}

export async function addBonusDay(db, {
  programId,
  userId,
  programType,
  focusType = null,
  targetDate,
  scope,
  weekday = null,
}) {
  const ownershipR = await db.query(
    `SELECT id, user_id, program_type, start_date, preferred_days_sorted_json
     FROM program
     WHERE id = $1 AND user_id = $2`,
    [programId, userId],
  );
  if (ownershipR.rowCount === 0) {
    throw serviceError(403, "Program not found");
  }
  const program = ownershipR.rows[0];

  const profileR = await db.query(
    `SELECT cp.*
     FROM client_profile cp
     JOIN program p ON p.user_id = cp.user_id
     WHERE p.id = $1
     ORDER BY cp.updated_at DESC
     LIMIT 1`,
    [programId],
  );
  if (profileR.rowCount === 0) {
    throw serviceError(400, "Client profile not found for program");
  }
  const profileRow = profileR.rows[0];

  const exerciseCatalogueR = await db.query(
    `SELECT
       exercise_id, name, movement_class, movement_pattern_primary,
       is_loadable, strength_equivalent, min_fitness_rank, complexity_rank,
       density_rating, equipment_json, coaching_cues_json, load_guidance,
       logging_guidance, preferred_in_json, swap_group_id_1, swap_group_id_2,
       target_regions_json, warmup_hooks, accepts_distance_unit
     FROM exercise_catalogue
     WHERE is_archived = false
     ORDER BY exercise_id`,
  );

  const targetDates = await resolveTargetDates(db, {
    programId,
    scope,
    targetDate,
    weekday,
  });
  if (targetDates.length === 0) {
    throw serviceError(400, "No matching rest days found");
  }

  const conflictsR = await db.query(
    `SELECT scheduled_date::text
     FROM program_calendar_day
     WHERE program_id = $1
       AND scheduled_date = ANY($2::date[])
       AND is_training_day = TRUE
     LIMIT 1`,
    [programId, targetDates],
  );
  if (conflictsR.rowCount > 0) {
    throw serviceError(409, "You already have a workout scheduled for that day");
  }

  const targetWeekday = weekdayForDate(targetDate);
  const preferredDays = [targetWeekday].filter(Boolean);
  const profile = rowToProfile(profileRow, preferredDays);
  const inputs = buildInputsFromProfile(profile, exerciseCatalogueR.rows);
  if (focusType) {
    inputs.preferredSplitJson = { day_focuses: [toSlug(focusType)] };
  }

  const allowedIds = await getAllowedExerciseIds(db, {
    fitness_rank: mapFitnessRank(profileRow.fitness_level_slug),
    injury_flags_slugs: normalizeTextArray(profileRow.injury_flags),
    equipment_items_slugs: normalizeTextArray(profileRow.equipment_items_slugs),
  });
  if (allowedIds.length === 0) {
    throw serviceError(400, "No exercises are eligible for the selected equipment profile.");
  }
  inputs.allowed_exercise_ids = allowedIds;

  const anchorDayMs = toAnchorDayMs(targetDate);
  const resolvedProgramType = String(programType || program.program_type || profileRow.program_type_slug || "hypertrophy").trim();
  const pipelineOut = await runPipeline({
    db,
    userId,
    programType: resolvedProgramType,
    inputs,
    request: {
      anchor_day_ms: anchorDayMs,
      anchor_date_ms: anchorDayMs,
      preferred_days_json: targetWeekday,
      duration_mins: Number(profileRow.minutes_per_session ?? 50),
      days_per_week: 1,
      fitness_rank: mapFitnessRank(profileRow.fitness_level_slug),
      program_length: 1,
    },
  });

  const parsed = parseEmitterRows(pipelineOut.rows ?? []);
  const templateDay = parsed.days[0];
  if (!templateDay) {
    throw serviceError(400, "Could not generate a bonus workout");
  }
  const templateSegs = parsed.segs.filter((seg) => seg.program_day_key === templateDay.program_day_key);
  const templateExs = parsed.exs.filter((ex) => ex.program_day_key === templateDay.program_day_key);

  const client = await db.connect();
  const hasProgramCalendarDayUserId = await programCalendarDayHasUserIdColumn(client);
  const insertedDayIds = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [`bonus:${programId}`]);

    for (const date of targetDates) {
      const insertedId = await insertTemplateForDate(client, {
        programId,
        userId,
        startDate: program.start_date,
        targetDate: date,
        templateDay,
        templateSegs,
        templateExs,
        programType: resolvedProgramType,
        focusType,
        hasProgramCalendarDayUserId,
      });
      insertedDayIds.push(insertedId);
    }

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }

  return {
    programDayId: insertedDayIds[0],
    daysCreated: targetDates.length,
  };
}
