import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { createGenerateProgramV2Handler } from "../src/routes/generateProgramV2.js";

const TEST_SUBJECT_ID = `smoke-test-user-${Date.now()}`;

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

async function seedTestUser(db) {
  const userResult = await db.query(
    `INSERT INTO app_user (subject_id) VALUES ($1)
     ON CONFLICT (subject_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [TEST_SUBJECT_ID],
  );
  const pgUserId = userResult.rows[0].id;

  await db.query(
    `INSERT INTO client_profile (user_id, fitness_level_slug, main_goals_slugs,
       equipment_items_slugs,
       injury_flags, preferred_days, minutes_per_session)
     VALUES ($1, 'intermediate', ARRAY['strength'], ARRAY['barbell'],
             ARRAY[]::text[], ARRAY['mon','wed','fri'], 60)
     ON CONFLICT (user_id) DO NOTHING`,
    [pgUserId],
  );
}

async function cleanupTestUser(db) {
  await db.query(
    `DELETE FROM generation_run
      WHERE program_id IN (
        SELECT p.id
        FROM program p
        JOIN app_user au ON au.id = p.user_id
        WHERE au.subject_id = $1
      )`,
    [TEST_SUBJECT_ID],
  );
  await db.query(
    `DELETE FROM program
      WHERE user_id IN (
        SELECT id FROM app_user WHERE subject_id = $1
      )`,
    [TEST_SUBJECT_ID],
  );
  await db.query(`DELETE FROM app_user WHERE subject_id = $1`, [TEST_SUBJECT_ID]);
}

test("generate-plan-v2: profile found -> pipeline called -> 200 response with program", async (t) => {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    t.skip(`Postgres unavailable for smoke test: ${error?.code || error?.message}`);
    return;
  }

  await seedTestUser(pool);

  let capturedInputs = null;

  const handler = createGenerateProgramV2Handler({
    db: pool,
    getAllowed: async () => ["barbell_back_squat", "leg_press"],
    buildInputs: () => ({ stub: true }),
    pipeline: async ({ inputs }) => {
      capturedInputs = inputs;
      return ({
      ok: true,
      rows: [
        {
          row_type: "PRG",
          program_title: "Stub Program",
          program_summary: "Stub Summary",
          weeks_count: 1,
          days_per_week: 3,
          program_outline_json: {},
          start_date: "2026-01-01",
          start_offset_days: 0,
          start_weekday: "thu",
          preferred_days_sorted_json: ["mon", "wed", "fri"],
        },
      ],
      program: {
        id: "stub-program-id",
        title: "Stub Program",
        weeks: [],
        days: [],
        days_per_week: 3,
        duration_mins: 60,
        program_type: "strength",
      },
      debug: {
        step1: {},
        step5: {},
        step6: {},
      },
    });
    },
    emitPayload: async ({ payload }) => ({
      counts: { days: 0 },
      idempotent: false,
      prg_data: {
        program_title: "Stub Program",
        program_summary: "Stub Summary",
        weeks_count: 1,
        days_per_week: 3,
        program_outline_json: {},
        start_date: "2026-01-01",
        start_offset_days: 0,
        start_weekday: "thu",
        preferred_days_sorted_json: ["mon", "wed", "fri"],
      },
      payload,
    }),
    ensureCalendar: async () => {},
  });

  const req = {
    request_id: "smoke-test-req",
    body: {
      user_id: TEST_SUBJECT_ID,
      anchor_date_ms: Date.now(),
      programType: "strength",
    },
    log: { info() {}, debug() {}, warn() {}, error() {} },
  };
  const res = mockRes();

  try {
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.program_id);
    assert.ok(res.body.generation_run_id);
    assert.deepEqual(capturedInputs?.allowed_exercise_ids, ["barbell_back_squat", "leg_press"]);

    const persisted = await pool.query(
      `SELECT program_type FROM program WHERE id = $1`,
      [res.body.program_id],
    );
    assert.equal(persisted.rows[0]?.program_type, "strength");
  } finally {
    await cleanupTestUser(pool);
  }
});
