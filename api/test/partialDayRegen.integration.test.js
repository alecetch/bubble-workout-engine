import { runPipeline } from "../engine/runPipeline.js";
import { parseEmitterRows } from "../src/services/importEmitterService.js";
import { makeWeeklyInputs } from "./helpers/weeklyProgression.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { regenerateDaysWithEquipment } from "../src/services/partialDayRegenService.js";
import { addBonusDay } from "../src/services/bonusDayService.js";

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
  await db.query(`DELETE FROM program_calendar_day WHERE program_id = $1`, [fixture.programId]);
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

test("regenerateDaysWithEquipment accepts empty equipmentItemSlugs and processes the pending day", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);

  try {
    // Verifies that getAllowedExerciseIds returns > 0 bodyweight exercises (otherwise the
    // service throws before returning), and that the pending day is counted as regenerated.
    const result = await regenerateDaysWithEquipment(pool, {
      programId: fixture.programId,
      userId: fixture.ownerUserId,
      dayIds: [fixture.dayIds.pending],
      equipmentPresetSlug: "bodyweight",
      equipmentItemSlugs: [],
    });

    assert.equal(result.regenerated, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.partiallyLogged, 0);

    // Confirm the equipment override was persisted to program_day
    const overrideR = await pool.query(
      `SELECT equipment_override_preset_slug, equipment_override_items_slugs
       FROM program_day
       WHERE id = $1`,
      [fixture.dayIds.pending],
    );
    assert.equal(overrideR.rows[0]?.equipment_override_preset_slug, "bodyweight");
    assert.deepEqual(overrideR.rows[0]?.equipment_override_items_slugs, []);
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

test("regenerateDaysWithEquipment regenerates a bonus day whose key is not in the regenerated program", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);

  try {
    // Tuesday of the fixture week: a rest day, so no training-day conflict.
    const bonusDate = isoDate(new Date(nextWeekday(1).getTime() + 24 * 60 * 60 * 1000));
    const { programDayId } = await addBonusDay(pool, {
      programId: fixture.programId,
      userId: fixture.ownerUserId,
      programType: "hypertrophy",
      targetDate: bonusDate,
      scope: "today",
    });

    const dayR = await pool.query(`SELECT program_day_key, is_bonus FROM program_day WHERE id = $1`, [programDayId]);
    assert.equal(dayR.rows[0].is_bonus, true);
    const bonusKey = dayR.rows[0].program_day_key;
    assert.match(bonusKey, /^bonus:/);

    const result = await regenerateDaysWithEquipment(pool, {
      programId: fixture.programId,
      userId: fixture.ownerUserId,
      dayIds: [programDayId],
      equipmentPresetSlug: "bodyweight",
      equipmentItemSlugs: [],
    });

    assert.equal(result.regenerated, 1);
    assert.deepEqual(result.dayIds, [programDayId]);

    const exR = await pool.query(
      `SELECT program_day_key, equipment_items_slugs_csv
       FROM program_exercise
       WHERE program_day_id = $1`,
      [programDayId],
    );
    assert.ok(exR.rowCount > 0, "bonus day should have regenerated exercises");
    assert.ok(exR.rows.every((row) => row.program_day_key === bonusKey), "exercises keep the bonus day key");

    const overrideR = await pool.query(
      `SELECT equipment_override_preset_slug FROM program_day WHERE id = $1`,
      [programDayId],
    );
    assert.equal(overrideR.rows[0].equipment_override_preset_slug, "bodyweight");
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

for (const mode of ["bonus", "partial"]) test(`${mode} filters stored Wrist / Elbow labels`, async t => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);
  try {
    await pool.query("UPDATE client_profile SET injury_flags = ARRAY['Wrist / Elbow'] WHERE user_id=$1", [fixture.ownerUserId]);
    let dayId = fixture.dayIds.pending;
    if (mode === "bonus") {
      const result = await addBonusDay(pool, {
        programId: fixture.programId, userId: fixture.ownerUserId, programType: "hypertrophy",
        targetDate: isoDate(new Date(nextWeekday(1).getTime() + 86400000)), scope: "today",
      });
      dayId = result.programDayId;
    } else {
      const result = await regenerateDaysWithEquipment(pool, {
        programId: fixture.programId, userId: fixture.ownerUserId, dayIds: [dayId],
        equipmentPresetSlug: "bodyweight", equipmentItemSlugs: [],
      });
      assert.equal(result.regenerated, 1);
    }
    const { rows } = await pool.query(`SELECT pe.exercise_id,
      CASE WHEN pe.segment_type='warmup' THEN we.contraindications_slugs
           WHEN pe.segment_type='cooldown' THEN ce.contraindications_slugs
           ELSE ec.contraindications_slugs END AS flags
      FROM program_exercise pe
      LEFT JOIN exercise_catalogue ec ON ec.exercise_id=pe.exercise_id
      LEFT JOIN warmup_exercise we ON we.warmup_exercise_id=pe.exercise_id
      LEFT JOIN cooldown_exercise ce ON ce.cooldown_exercise_id=pe.exercise_id
      WHERE pe.program_day_id=$1`, [dayId]);
    assert.ok(rows.length > 0);
    assert.deepEqual(rows.filter(r => r.flags?.includes("wrist_elbow")), []);
  } finally { await cleanupFixture(pool, fixture); }
});

test("regenerating the final week delivers fewer sets than the matching week-one day", async t => {
  if (!await ensureDb(t)) return;
  const fixture = await seedProgramFixture(pool);
  try {
    await pool.query("UPDATE program SET weeks_count=4 WHERE id=$1", [fixture.programId]);
    const week = (await pool.query("INSERT INTO program_week(program_id,week_number,focus,notes) VALUES ($1,4,'Deload','') RETURNING id", [fixture.programId])).rows[0];
    const day = (await pool.query(`INSERT INTO program_day(program_id,program_week_id,week_number,day_number,global_day_index,
      program_day_key,day_label,day_type,session_duration_mins,scheduled_offset_days,scheduled_weekday,scheduled_date,is_completed)
      SELECT program_id,$2,4,day_number,12,'PD_W4_D3','Deload',day_type,session_duration_mins,scheduled_offset_days+21,
      scheduled_weekday,scheduled_date+21,false FROM program_day WHERE id=$1 RETURNING id`, [fixture.dayIds.pending, week.id])).rows[0];
    const equipment = (await pool.query("SELECT exercise_slug FROM equipment_items")).rows.map(row => row.exercise_slug);
    // Use real segment keys: narration inserts bookends ahead of the main work,
    // so the old minimal B1-only fixture would regenerate warm-ups only.
    const plan = parseEmitterRows((await runPipeline({ db: pool, userId: null, programType: "hypertrophy",
      inputs: await makeWeeklyInputs(pool, "hypertrophy", "beginner"), request: { fitness_rank: 0 } })).rows);
    const dayIds = [fixture.dayIds.pending, day.id];
    await pool.query("DELETE FROM program_exercise WHERE program_day_id=ANY($1::uuid[])", [dayIds]);
    await pool.query("DELETE FROM workout_segment WHERE program_day_id=ANY($1::uuid[])", [dayIds]);
    for (const [index, dayId] of dayIds.entries()) {
      const key = `PD_W${index === 0 ? 1 : 4}_D3`;
      for (const seg of plan.segs.filter(seg => seg.program_day_key === key)) {
        await pool.query(`INSERT INTO workout_segment(program_id,program_day_id,program_day_key,segment_key,block_key,block_order,
          segment_order_in_block,segment_type,purpose,purpose_label,segment_title,segment_notes,rounds,score_type,primary_score_label,
          secondary_score_label,segment_scheme_json,segment_duration_seconds,segment_duration_mmss)
          VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,'','',$10,'none','','','{}'::jsonb,0,'')`,
          [fixture.programId, dayId, key, seg.segment_key, seg.block_key, seg.block_order, seg.segment_type, seg.purpose, seg.purpose_label, seg.rounds]);
      }
    }
    const result = await regenerateDaysWithEquipment(pool, { programId: fixture.programId, userId: fixture.ownerUserId,
      dayIds: [fixture.dayIds.pending, day.id], equipmentPresetSlug: "commercial_gym", equipmentItemSlugs: equipment });
    assert.equal(result.regenerated, 2);
    const totals = (await pool.query("SELECT program_day_id,sum(sets_prescribed)::int AS sets FROM program_exercise WHERE program_day_id=ANY($1::uuid[]) GROUP BY program_day_id", [[fixture.dayIds.pending, day.id]])).rows;
    const first = totals.find(row => row.program_day_id === fixture.dayIds.pending)?.sets;
    const final = totals.find(row => row.program_day_id === day.id)?.sets;
    assert.ok(first > 0 && final > 0 && final < first, JSON.stringify(totals));
  } finally { await cleanupFixture(pool, fixture); }
});
