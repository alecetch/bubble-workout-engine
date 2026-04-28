import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { regenerateDaysWithEquipment } from "../src/services/partialDayRegenService.js";

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function nextWeekday(targetDow) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const diff = (targetDow - date.getUTCDay() + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

async function ensureDb(t) {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    t.skip(`Postgres unavailable for integration test: ${error?.code || error?.message}`);
    return false;
  }
}

async function seedProgramFixture(db) {
  const ownerSubjectId = `feature18-owner-${Date.now()}-${randomUUID()}`;
  const strangerSubjectId = `feature18-stranger-${Date.now()}-${randomUUID()}`;

  const ownerR = await db.query(
    `INSERT INTO app_user (subject_id)
     VALUES ($1)
     RETURNING id`,
    [ownerSubjectId],
  );
  const ownerUserId = ownerR.rows[0].id;

  const strangerR = await db.query(
    `INSERT INTO app_user (subject_id)
     VALUES ($1)
     RETURNING id`,
    [strangerSubjectId],
  );
  const strangerUserId = strangerR.rows[0].id;

  await db.query(
    `INSERT INTO client_profile (
       user_id,
       fitness_level_slug,
       fitness_rank,
       equipment_items_slugs,
       equipment_preset_slug,
       preferred_days,
       minutes_per_session,
       main_goals_slugs
     )
     VALUES ($1, 'beginner', 0, ARRAY['barbell','dumbbells','cable'], 'commercial_gym',
             ARRAY['mon','wed','fri'], 60, ARRAY['strength'])`,
    [ownerUserId],
  );

  const nextMonday = nextWeekday(1);
  const nextWednesday = new Date(nextMonday);
  nextWednesday.setUTCDate(nextWednesday.getUTCDate() + 2);
  const nextFriday = new Date(nextMonday);
  nextFriday.setUTCDate(nextFriday.getUTCDate() + 4);

  const programR = await db.query(
    `INSERT INTO program (
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
       program_type,
       is_ready,
       is_primary
     )
     VALUES ($1, 'Feature 18 Test Program', 'Equipment regen test fixture', 1, 3, '{}'::jsonb,
             $2::date, 0, 'mon', '["mon","wed","fri"]'::jsonb, 'hypertrophy', true, true)
     RETURNING id`,
    [ownerUserId, isoDate(nextMonday)],
  );
  const programId = programR.rows[0].id;

  const weekR = await db.query(
    `INSERT INTO program_week (program_id, week_number, focus, notes)
     VALUES ($1, 1, 'Hypertrophy', '')
     RETURNING id`,
    [programId],
  );
  const programWeekId = weekR.rows[0].id;

  const dayRows = await db.query(
    `INSERT INTO program_day (
       program_id,
       program_week_id,
       week_number,
       day_number,
       global_day_index,
       program_day_key,
       day_label,
       day_type,
       session_duration_mins,
       scheduled_offset_days,
       scheduled_weekday,
       scheduled_date,
       is_completed
     )
     VALUES
       ($1, $2, 1, 1, 1, 'PD_W1_D1', 'Day 1', 'hypertrophy', 60, 0, 'Mon', $3::date, true),
       ($1, $2, 1, 2, 2, 'PD_W1_D2', 'Day 2', 'hypertrophy', 60, 2, 'Wed', $4::date, false),
       ($1, $2, 1, 3, 3, 'PD_W1_D3', 'Day 3', 'hypertrophy', 60, 4, 'Fri', $5::date, false)
     RETURNING id, program_day_key`,
    [programId, programWeekId, isoDate(nextMonday), isoDate(nextWednesday), isoDate(nextFriday)],
  );
  const dayByKey = Object.fromEntries(dayRows.rows.map((row) => [row.program_day_key, row.id]));

  const segmentsR = await db.query(
    `INSERT INTO workout_segment (
       program_id,
       program_day_id,
       program_day_key,
       segment_key,
       block_key,
       block_order,
       segment_order_in_block,
       segment_type,
       purpose,
       purpose_label,
       segment_title,
       segment_notes,
       rounds,
       score_type,
       primary_score_label,
       secondary_score_label,
       segment_scheme_json,
       segment_duration_seconds,
       segment_duration_mmss
     )
     VALUES
       ($1, $2, 'PD_W1_D1', 'B1_S1', 'B1', 1, 1, 'single', 'main', 'Main', 'Main Work', '', 1, 'none', '', '', '{}'::jsonb, 0, ''),
       ($1, $3, 'PD_W1_D2', 'B1_S1', 'B1', 1, 1, 'single', 'main', 'Main', 'Main Work', '', 1, 'none', '', '', '{}'::jsonb, 0, ''),
       ($1, $4, 'PD_W1_D3', 'B1_S1', 'B1', 1, 1, 'single', 'main', 'Main', 'Main Work', '', 1, 'none', '', '', '{}'::jsonb, 0, '')
     RETURNING id, program_day_id`,
    [programId, dayByKey.PD_W1_D1, dayByKey.PD_W1_D2, dayByKey.PD_W1_D3],
  );
  const segmentByDayId = Object.fromEntries(segmentsR.rows.map((row) => [row.program_day_id, row.id]));

  const exerciseIdsR = await db.query(
    `SELECT exercise_id, name
     FROM exercise_catalogue
     WHERE is_archived = false
     ORDER BY exercise_id
     LIMIT 5`,
  );
  assert.ok(exerciseIdsR.rows.length >= 5, "Expected seeded exercise_catalogue rows for integration tests");
  const catalogueExercises = exerciseIdsR.rows;

  let orderInDay = 1;
  for (const dayId of [dayByKey.PD_W1_D1, dayByKey.PD_W1_D2, dayByKey.PD_W1_D3]) {
    for (const exercise of catalogueExercises.slice(0, 3)) {
      await db.query(
        `INSERT INTO program_exercise (
           program_id,
           program_day_id,
           workout_segment_id,
           program_day_key,
           segment_key,
           segment_type,
           exercise_id,
           exercise_name,
           is_loadable,
           equipment_items_slugs_csv,
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
         VALUES ($1, $2, $3, $4, 'main_1', 'single', $5, $6, false, '', $7, 1, $8, 'main', 'Main', 3, '8', 'reps', '', '', 90, '')`,
        [
          programId,
          dayId,
          segmentByDayId[dayId],
          Object.entries(dayByKey).find(([, id]) => id === dayId)?.[0],
          exercise.exercise_id,
          exercise.name,
          orderInDay,
          orderInDay,
        ],
      );
      orderInDay += 1;
    }
    orderInDay = 1;
  }

  await db.query(
    `INSERT INTO segment_exercise_log (
       user_id,
       program_id,
       program_day_id,
       workout_segment_id,
       program_exercise_id,
       order_index,
       is_draft,
       weight_kg,
       reps_completed,
       rir_actual
     )
     VALUES
       ($1, $2, $3, $4, (
         SELECT id FROM program_exercise
         WHERE program_day_id = $3
         ORDER BY order_in_day
         LIMIT 1
       ), 1, false, 50, 8, 2)`,
    [ownerUserId, programId, dayByKey.PD_W1_D2, segmentByDayId[dayByKey.PD_W1_D2]],
  );

  return {
    ownerUserId,
    strangerUserId,
    programId,
    dayIds: {
      completed: dayByKey.PD_W1_D1,
      partiallyLogged: dayByKey.PD_W1_D2,
      pending: dayByKey.PD_W1_D3,
    },
    ownerSubjectId,
    strangerSubjectId,
  };
}

async function cleanupFixture(db, fixture) {
  if (!fixture) return;
  await db.query(
    `DELETE FROM segment_exercise_log
     WHERE program_id = $1
        OR user_id IN (
          SELECT id FROM app_user WHERE subject_id = ANY($2::text[])
        )`,
    [fixture.programId, [fixture.ownerSubjectId, fixture.strangerSubjectId]],
  );
  await db.query(`DELETE FROM program_exercise WHERE program_id = $1`, [fixture.programId]);
  await db.query(`DELETE FROM workout_segment WHERE program_id = $1`, [fixture.programId]);
  await db.query(`DELETE FROM program_day WHERE program_id = $1`, [fixture.programId]);
  await db.query(`DELETE FROM program_week WHERE program_id = $1`, [fixture.programId]);
  await db.query(`DELETE FROM program WHERE id = $1`, [fixture.programId]);
  await db.query(
    `DELETE FROM client_profile
     WHERE user_id IN (
       SELECT id FROM app_user WHERE subject_id = ANY($1::text[])
     )`,
    [[fixture.ownerSubjectId, fixture.strangerSubjectId]],
  );
  await db.query(`DELETE FROM app_user WHERE subject_id = ANY($1::text[])`, [
    [fixture.ownerSubjectId, fixture.strangerSubjectId],
  ]);
}

async function getDayExercises(db, dayId) {
  const result = await db.query(
    `SELECT exercise_id, order_in_day
     FROM program_exercise
     WHERE program_day_id = $1
     ORDER BY order_in_day`,
    [dayId],
  );
  return result.rows.map((row) => `${row.order_in_day}:${row.exercise_id}`);
}

test("regenerateDaysWithEquipment skips completed days without changing exercises", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);

  try {
    const before = await getDayExercises(pool, fixture.dayIds.completed);
    const result = await regenerateDaysWithEquipment(pool, {
      programId: fixture.programId,
      userId: fixture.ownerUserId,
      dayIds: [fixture.dayIds.completed],
      equipmentPresetSlug: "commercial_gym",
      equipmentItemSlugs: ["barbell"],
    });
    const after = await getDayExercises(pool, fixture.dayIds.completed);

    assert.deepEqual(after, before);
    assert.ok(result.skipped >= 1);
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("regenerateDaysWithEquipment skips partially logged days without changing exercises", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);

  try {
    const before = await getDayExercises(pool, fixture.dayIds.partiallyLogged);
    const result = await regenerateDaysWithEquipment(pool, {
      programId: fixture.programId,
      userId: fixture.ownerUserId,
      dayIds: [fixture.dayIds.partiallyLogged],
      equipmentPresetSlug: "commercial_gym",
      equipmentItemSlugs: ["barbell"],
    });
    const after = await getDayExercises(pool, fixture.dayIds.partiallyLogged);

    assert.deepEqual(after, before);
    assert.ok(result.partiallyLogged >= 1);
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("regenerateDaysWithEquipment applies bodyweight-only filtering when equipmentItemSlugs is empty", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);

  try {
    const result = await regenerateDaysWithEquipment(pool, {
      programId: fixture.programId,
      userId: fixture.ownerUserId,
      dayIds: [fixture.dayIds.pending],
      equipmentPresetSlug: "bodyweight",
      equipmentItemSlugs: [],
    });

    assert.equal(result.regenerated, 1);

    const exercisesR = await pool.query(
      `SELECT pe.exercise_id, pe.equipment_items_slugs_csv
       FROM program_exercise pe
       WHERE pe.program_day_id = $1`,
      [fixture.dayIds.pending],
    );

    assert.ok(exercisesR.rows.length > 0, "Expected regenerated exercises for pending day");
    assert.ok(
      exercisesR.rows.every((row) => !row.equipment_items_slugs_csv || row.equipment_items_slugs_csv === ""),
      "Expected only bodyweight exercises after empty-equipment regeneration",
    );
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("regenerateDaysWithEquipment writes equipment override columns to program_day", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);

  try {
    await regenerateDaysWithEquipment(pool, {
      programId: fixture.programId,
      userId: fixture.ownerUserId,
      dayIds: [fixture.dayIds.pending],
      equipmentPresetSlug: "commercial_gym",
      equipmentItemSlugs: ["barbell"],
    });

    const overrideR = await pool.query(
      `SELECT equipment_override_preset_slug, equipment_override_items_slugs
       FROM program_day
       WHERE id = $1`,
      [fixture.dayIds.pending],
    );

    assert.equal(overrideR.rows[0]?.equipment_override_preset_slug, "commercial_gym");
    assert.deepEqual(overrideR.rows[0]?.equipment_override_items_slugs, ["barbell"]);
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("regenerateDaysWithEquipment rejects access for the wrong user", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);

  try {
    await assert.rejects(
      regenerateDaysWithEquipment(pool, {
        programId: fixture.programId,
        userId: fixture.strangerUserId,
        dayIds: [fixture.dayIds.pending],
        equipmentPresetSlug: "commercial_gym",
        equipmentItemSlugs: ["barbell"],
      }),
      (error) => {
        assert.equal(error?.status, 403);
        return true;
      },
    );
  } finally {
    await cleanupFixture(pool, fixture);
  }
});
