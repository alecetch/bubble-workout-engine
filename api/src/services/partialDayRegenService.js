import { runPipeline } from "../../engine/runPipeline.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { buildInputsFromProfile } from "./buildInputsFromProfile.js";
import { parseEmitterRows } from "./importEmitterService.js";

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
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function toAnchorDayMs(dateValue) {
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00.000Z`);
  return date.getTime();
}

async function loadPhysiqueContext(db, userId) {
  try {
    const premiumR = await db.query(
      `SELECT emphasis_weights_json
       FROM physique_scan
       WHERE user_id = $1
         AND submitted_at > now() - INTERVAL '30 days'
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [userId],
    );
    if (premiumR.rows[0]) {
      return {
        emphasisWeights: premiumR.rows[0].emphasis_weights_json ?? {},
        emphasisSuggestions: Object.keys(premiumR.rows[0].emphasis_weights_json ?? {}),
      };
    }

    const physiqueR = await db.query(
      `SELECT program_emphasis_json
       FROM physique_check_in
       WHERE user_id = $1
         AND submitted_at > now() - INTERVAL '30 days'
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [userId],
    );
    if (physiqueR.rows[0]) {
      return {
        emphasisWeights: null,
        emphasisSuggestions: physiqueR.rows[0].program_emphasis_json ?? [],
      };
    }
  } catch {
    // optional context only
  }
  return null;
}

async function buildRegenerationPlan(db, {
  programType,
  userId,
  startDate,
  profile,
  exerciseRows,
  physiqueContext,
  allowedExerciseIds,
}) {
  const inputs = buildInputsFromProfile(profile, exerciseRows, physiqueContext);
  if (Array.isArray(allowedExerciseIds) && allowedExerciseIds.length > 0) {
    inputs.allowed_exercise_ids = allowedExerciseIds;
  }
  const preferredDays = Array.isArray(profile.preferredDays) ? profile.preferredDays : [];
  const durationMins = Number.isFinite(Number(profile.minutesPerSession))
    ? Number(profile.minutesPerSession)
    : 50;
  const fitnessRank = mapFitnessRank(profile.fitnessLevel);
  const anchorDayMs = toAnchorDayMs(startDate);

  const pipelineOut = await runPipeline({
    db,
    userId,
    programType,
    inputs,
    request: {
      anchor_day_ms: anchorDayMs,
      anchor_date_ms: anchorDayMs,
      preferred_days_json: preferredDays.join(","),
      duration_mins: durationMins,
      days_per_week: preferredDays.length || 3,
      fitness_rank: fitnessRank,
    },
  });

  return parseEmitterRows(pipelineOut.rows ?? []);
}

function buildExerciseRowsByDayKey(parsedRows) {
  const byDayKey = new Map();
  for (const ex of parsedRows.exs ?? []) {
    const dayKey = String(ex.program_day_key ?? "").trim();
    if (!dayKey) continue;
    if (!byDayKey.has(dayKey)) byDayKey.set(dayKey, []);
    byDayKey.get(dayKey).push(ex);
  }
  return byDayKey;
}

export async function regenerateDaysWithEquipment(
  db,
  { programId, userId, dayIds, equipmentPresetSlug, equipmentItemSlugs },
) {
  const ownershipR = await db.query(
    `SELECT p.id, p.user_id, p.program_type, p.start_date
     FROM program p
     WHERE p.id = $1 AND p.user_id = $2`,
    [programId, userId],
  );
  if (ownershipR.rowCount === 0) {
    const err = new Error("Program not found");
    err.status = 403;
    throw err;
  }

  const contextR = await db.query(
    `SELECT cp.*
     FROM client_profile cp
     JOIN program p ON p.user_id = cp.user_id
     WHERE p.id = $1`,
    [programId],
  );
  if (contextR.rowCount === 0) {
    throw new Error("Client profile not found for program");
  }

  const exerciseCatalogueR = await db.query(
    `SELECT
       exercise_id,
       name,
       movement_class,
       movement_pattern_primary,
       is_loadable,
       strength_equivalent,
       min_fitness_rank,
       complexity_rank,
       density_rating,
       equipment_json,
       coaching_cues_json,
       load_guidance,
       logging_guidance,
       preferred_in_json,
       swap_group_id_1,
       swap_group_id_2,
       target_regions_json,
       warmup_hooks,
       accepts_distance_unit
     FROM exercise_catalogue
     WHERE is_archived = false
     ORDER BY exercise_id`,
  );

  const targetDaysR = await db.query(
    `SELECT id, program_day_key, is_completed
     FROM program_day
     WHERE id = ANY($1::uuid[])
       AND program_id = $2`,
    [dayIds, programId],
  );

  const dayMetaById = new Map(targetDaysR.rows.map((row) => [row.id, row]));
  const filteredIds = dayIds.filter((dayId) => dayMetaById.has(dayId));

  let regenerated = 0;
  let skipped = 0;
  let partiallyLogged = 0;
  const successfulDayIds = [];

  const pendingDays = [];
  for (const dayId of filteredIds) {
    const meta = dayMetaById.get(dayId);
    if (meta?.is_completed) {
      skipped += 1;
      continue;
    }
    pendingDays.push({
      dayId,
      dayKey: meta?.program_day_key ?? null,
    });
  }

  if (pendingDays.length === 0) {
    return { regenerated, skipped, partiallyLogged, dayIds: successfulDayIds };
  }

  const overrideProfile = {
    id: contextR.rows[0].id,
    userId: contextR.rows[0].user_id,
    goals: contextR.rows[0].main_goals_slugs ?? [],
    fitnessLevel: contextR.rows[0].fitness_level_slug ?? null,
    injuryFlags: contextR.rows[0].injury_flags ?? [],
    goalNotes: contextR.rows[0].goal_notes ?? "",
    equipmentPreset: equipmentPresetSlug,
    equipmentItemCodes: normalizeTextArray(equipmentItemSlugs),
    preferredDays: contextR.rows[0].preferred_days ?? [],
    scheduleConstraints: contextR.rows[0].schedule_constraints ?? "",
    heightCm: contextR.rows[0].height_cm ?? null,
    weightKg: contextR.rows[0].weight_kg ?? null,
    minutesPerSession: contextR.rows[0].minutes_per_session ?? null,
    sex: contextR.rows[0].sex ?? null,
    ageRange: contextR.rows[0].age_range ?? null,
    onboardingStepCompleted: contextR.rows[0].onboarding_step_completed ?? 0,
    onboardingCompletedAt: contextR.rows[0].onboarding_completed_at ?? null,
    programType: contextR.rows[0].program_type_slug ?? null,
    preferredUnit: contextR.rows[0].preferred_unit ?? "kg",
    preferredHeightUnit: contextR.rows[0].preferred_height_unit ?? "cm",
  };

  const allowedExerciseIds = await getAllowedExerciseIds(db, {
    fitness_rank: mapFitnessRank(overrideProfile.fitnessLevel),
    injury_flags_slugs: Array.isArray(overrideProfile.injuryFlags) ? overrideProfile.injuryFlags : [],
    equipment_items_slugs: normalizeTextArray(equipmentItemSlugs),
  });
  if (allowedExerciseIds.length === 0) {
    throw new Error("No exercises are eligible for the selected equipment profile.");
  }

  const physiqueContext = await loadPhysiqueContext(db, userId);
  const parsedPlan = await buildRegenerationPlan(db, {
    programType: ownershipR.rows[0].program_type || overrideProfile.programType || "hypertrophy",
    userId,
    startDate: ownershipR.rows[0].start_date,
    profile: overrideProfile,
    exerciseRows: exerciseCatalogueR.rows,
    physiqueContext,
    allowedExerciseIds,
  });
  const exercisesByDayKey = buildExerciseRowsByDayKey(parsedPlan);

  for (const pendingDay of pendingDays) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const dayR = await client.query(
        `SELECT id, program_day_key, is_completed
         FROM program_day
         WHERE id = $1
           AND program_id = $2
         FOR UPDATE`,
        [pendingDay.dayId, programId],
      );
      if (dayR.rowCount === 0) {
        await client.query("ROLLBACK");
        continue;
      }
      if (dayR.rows[0].is_completed) {
        skipped += 1;
        await client.query("ROLLBACK");
        continue;
      }

      const segmentsR = await client.query(
        `SELECT id, segment_key, block_key, purpose
         FROM workout_segment
         WHERE program_day_id = $1
         ORDER BY block_order, segment_order_in_block`,
        [pendingDay.dayId],
      );

      const loggedSegmentR = await client.query(
        `SELECT DISTINCT sel.workout_segment_id
         FROM segment_exercise_log sel
         JOIN workout_segment ws ON ws.id = sel.workout_segment_id
         WHERE ws.program_day_id = $1
         LIMIT 1`,
        [pendingDay.dayId],
      );
      if (loggedSegmentR.rowCount > 0) {
        partiallyLogged += 1;
        await client.query("ROLLBACK");
        continue;
      }

      const dayKey = dayR.rows[0].program_day_key;
      const nextExercises = exercisesByDayKey.get(dayKey) ?? [];
      const segmentIdByKey = new Map(
        segmentsR.rows.map((row) => [String(row.segment_key ?? "").trim(), row.id]),
      );

      if (segmentsR.rows.length > 0 && nextExercises.length === 0) {
        console.error(
          `[partialDayRegen] dayKey=${dayKey}, available keys=${[...exercisesByDayKey.keys()].join(", ")}`,
        );
        throw new Error(
          `No regenerated exercises matched program_day_key=${dayKey}. Available: ${[...exercisesByDayKey.keys()].join(", ")}`,
        );
      }

      await client.query(`DELETE FROM program_exercise WHERE program_day_id = $1`, [pendingDay.dayId]);

      for (const ex of nextExercises) {
        const workoutSegmentId = segmentIdByKey.get(String(ex.segment_key ?? "").trim()) ?? null;
        if (!workoutSegmentId) {
          continue;
        }

        await client.query(
          `INSERT INTO program_exercise (
             program_id,
             program_day_id,
             workout_segment_id,
             program_day_key,
             segment_key,
             segment_type,
             exercise_id,
             order_in_day,
             block_order,
             order_in_block,
             purpose,
             purpose_label,
             sets_prescribed,
             reps_prescribed,
             reps_unit,
             intensity_prescription,
             tempo,
             rest_seconds,
             notes
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            programId,
            pendingDay.dayId,
            workoutSegmentId,
            ex.program_day_key,
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
        [pendingDay.dayId],
      );

      await client.query(
        `UPDATE program_day
         SET equipment_override_preset_slug = $1,
             equipment_override_items_slugs = $2::text[],
             updated_at = now()
         WHERE id = $3`,
        [equipmentPresetSlug, normalizeTextArray(equipmentItemSlugs), pendingDay.dayId],
      );

      await client.query("COMMIT");
      regenerated += 1;
      successfulDayIds.push(pendingDay.dayId);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failures
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    regenerated,
    skipped,
    partiallyLogged,
    dayIds: successfulDayIds,
  };
}
