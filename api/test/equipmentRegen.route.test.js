import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../src/db.js";
import { equipmentRegenRouter } from "../src/routes/equipmentRegen.js";
import { makeRequireAuth } from "../src/middleware/requireAuth.js";

const JWT_SECRET = "ci-test-jwt-secret-at-least-32-chars-long";
const JWT_ISSUER = "workout-engine-ci";

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

function signToken(userId) {
  return jwt.sign({ sub: userId, iss: JWT_ISSUER }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.request_id = "equipment-regen-route-test";
    req.log = { info() {}, warn() {}, error() {}, debug() {} };
    next();
  });
  app.use("/api", makeRequireAuth(JWT_SECRET, JWT_ISSUER), equipmentRegenRouter);
  return app;
}

async function withServer(run) {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    await run(server);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function ensureDb(t) {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    t.skip(`Postgres unavailable for route test: ${error?.code || error?.message}`);
    return false;
  }
}

async function seedRouteFixture(db) {
  const ownerSubjectId = `equip-route-owner-${Date.now()}-${randomUUID()}`;
  const strangerSubjectId = `equip-route-stranger-${Date.now()}-${randomUUID()}`;

  const ownerR = await db.query(`INSERT INTO app_user (subject_id) VALUES ($1) RETURNING id`, [ownerSubjectId]);
  const strangerR = await db.query(`INSERT INTO app_user (subject_id) VALUES ($1) RETURNING id`, [strangerSubjectId]);
  const ownerUserId = ownerR.rows[0].id;
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
     VALUES ($1, 'beginner', 0, ARRAY['barbell'], 'commercial_gym',
             ARRAY['mon','wed','fri'], 60, ARRAY['strength'])`,
    [ownerUserId],
  );

  const nextMonday = nextWeekday(1);
  const nextWednesday = new Date(nextMonday);
  nextWednesday.setUTCDate(nextWednesday.getUTCDate() + 2);

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
       is_ready
     )
     VALUES ($1, 'Equipment Route Program', 'Test fixture', 1, 2, '{}'::jsonb,
             $2::date, 0, 'mon', '["mon","wed"]'::jsonb, 'hypertrophy', true)
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

  const dayR = await db.query(
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
       ($1, $2, 1, 1, 1, 'PD_W1_D1', 'Day 1', 'hypertrophy', 60, 0, 'Mon', $3::date, false),
       ($1, $2, 1, 2, 2, 'PD_W1_D2', 'Day 2', 'hypertrophy', 60, 2, 'Wed', $4::date, false)
     RETURNING id, program_day_key`,
    [programId, programWeekId, isoDate(nextMonday), isoDate(nextWednesday)],
  );
  const dayIds = dayR.rows.map((row) => row.id);

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
       ($1, $2, 'PD_W1_D1', 'main_1', 'block_a', 1, 1, 'single', 'main', 'Main', 'Main Work', '', 1, 'none', '', '', '{}'::jsonb, 0, ''),
       ($1, $3, 'PD_W1_D2', 'main_1', 'block_a', 1, 1, 'single', 'main', 'Main', 'Main Work', '', 1, 'none', '', '', '{}'::jsonb, 0, '')
     RETURNING id, program_day_id`,
    [programId, dayIds[0], dayIds[1]],
  );
  const segmentByDay = Object.fromEntries(segmentsR.rows.map((row) => [row.program_day_id, row.id]));

  const exRows = await db.query(
    `SELECT exercise_id, name
     FROM exercise_catalogue
     WHERE is_archived = false
     ORDER BY exercise_id
     LIMIT 3`,
  );
  assert.ok(exRows.rows.length >= 3, "Expected exercise_catalogue seed data");

  for (const [dayIndex, dayId] of dayIds.entries()) {
    let orderInDay = 1;
    for (const exercise of exRows.rows) {
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
          segmentByDay[dayId],
          `PD_W1_D${dayIndex + 1}`,
          exercise.exercise_id,
          exercise.name,
          orderInDay,
          orderInDay,
        ],
      );
      orderInDay += 1;
    }
  }

  return {
    ownerUserId,
    strangerUserId,
    ownerSubjectId,
    strangerSubjectId,
    programId,
    dayIds,
  };
}

async function cleanupFixture(db, fixture) {
  if (!fixture) return;
  await db.query(`DELETE FROM segment_exercise_log WHERE program_id = $1`, [fixture.programId]);
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

test("GET /api/program/:id/equipment returns profile defaults and future days for owner", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedRouteFixture(pool);

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/program/${fixture.programId}/equipment`, {
        headers: { Authorization: `Bearer ${signToken(fixture.ownerUserId)}` },
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body.profileDefault, {
        equipmentPresetSlug: "commercial_gym",
        equipmentItemSlugs: ["barbell"],
      });
      assert.ok(Array.isArray(body.futureDays));
      assert.ok(body.futureDays.length >= 2);
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("GET /api/program/:id/equipment returns 401 without auth", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedRouteFixture(pool);

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/program/${fixture.programId}/equipment`);
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.equal(body.code, "unauthorized");
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("GET /api/program/:id/equipment returns 404 for a program not owned by the caller", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedRouteFixture(pool);

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/program/${fixture.programId}/equipment`, {
        headers: { Authorization: `Bearer ${signToken(fixture.strangerUserId)}` },
      });

      assert.equal(response.status, 404);
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("POST /api/program/:id/regenerate-days returns counts for a valid owner request", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedRouteFixture(pool);

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/program/${fixture.programId}/regenerate-days`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signToken(fixture.ownerUserId)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dayIds: [fixture.dayIds[0]],
          equipmentPresetSlug: "commercial_gym",
          equipmentItemSlugs: ["barbell"],
        }),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(typeof body.regenerated, "number");
      assert.equal(typeof body.skipped, "number");
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("POST /api/program/:id/regenerate-days returns 400 for empty dayIds", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedRouteFixture(pool);

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/program/${fixture.programId}/regenerate-days`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signToken(fixture.ownerUserId)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dayIds: [],
          equipmentPresetSlug: "commercial_gym",
          equipmentItemSlugs: ["barbell"],
        }),
      });

      assert.equal(response.status, 400);
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("POST /api/program/:id/regenerate-days returns 400 when dayIds are not part of the program", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedRouteFixture(pool);

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/program/${fixture.programId}/regenerate-days`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signToken(fixture.ownerUserId)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dayIds: [randomUUID()],
          equipmentPresetSlug: "commercial_gym",
          equipmentItemSlugs: ["barbell"],
        }),
      });

      assert.equal(response.status, 400);
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("POST /api/program/:id/regenerate-days returns 401 without auth", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedRouteFixture(pool);

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/program/${fixture.programId}/regenerate-days`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayIds: [fixture.dayIds[0]],
          equipmentPresetSlug: "commercial_gym",
          equipmentItemSlugs: ["barbell"],
        }),
      });

      assert.equal(response.status, 401);
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});

test("POST /api/program/:id/regenerate-days returns 404 for a program not owned by the caller", async (t) => {
  if (!await ensureDb(t)) return;
  const fixture = await seedRouteFixture(pool);

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/program/${fixture.programId}/regenerate-days`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signToken(fixture.strangerUserId)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dayIds: [fixture.dayIds[0]],
          equipmentPresetSlug: "commercial_gym",
          equipmentItemSlugs: ["barbell"],
        }),
      });

      assert.equal(response.status, 404);
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});
