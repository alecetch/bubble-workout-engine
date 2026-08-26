import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = "ci-test-jwt-secret-at-least-32-chars-long";
const JWT_ISSUER = "workout-engine-ci";

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_ISSUER = JWT_ISSUER;

const [{ pool }, { createGenerateProgramV2Router }] = await Promise.all([
  import("../src/db.js"),
  import("../src/routes/generateProgramV2.js"),
]);

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
    req.request_id = "generate-program-v2-authz-route-test";
    req.log = { info() {}, warn() {}, error() {}, debug() {} };
    next();
  });
  app.use(createGenerateProgramV2Router({
    getAllowed: async () => [],
    buildInputs: () => ({ stub: true }),
    pipeline: async () => ({
      rows: [{
        row_type: "PRG",
        program_title: "Authz Test Program",
        program_summary: "Stubbed generation output",
        weeks_count: 1,
        days_per_week: 3,
        program_outline_json: {},
        start_date: "2026-08-26",
        start_offset_days: 0,
        start_weekday: "wed",
        preferred_days_sorted_json: ["mon", "wed", "fri"],
      }],
      program: { weeks: [], hero_media_id: null },
      debug: { step1: {}, step5: {}, step6: {} },
    }),
    emitPayload: async ({ payload }) => ({
      counts: { days: 0 },
      idempotent: false,
      prg_data: {
        program_title: "Authz Test Program",
        program_summary: "Stubbed generation output",
        weeks_count: 1,
        days_per_week: 3,
        program_outline_json: {},
        start_date: "2026-08-26",
        start_offset_days: 0,
        start_weekday: "wed",
        preferred_days_sorted_json: ["mon", "wed", "fri"],
      },
      payload,
    }),
    ensureCalendar: async () => {},
    progressionService: { async applyProgressionRecommendations() { return null; } },
  }));
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

async function seedUser(db, { status }) {
  const subjectId = `gen-v2-authz-${status}-${Date.now()}-${randomUUID()}`;
  const userR = await db.query(
    `INSERT INTO app_user (subject_id, subscription_status, trial_expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [subjectId, status, status === "trialing" ? new Date(Date.now() + 86400000) : new Date(Date.now() - 86400000)],
  );
  const userId = userR.rows[0].id;

  const profileR = await db.query(
    `INSERT INTO client_profile (
       user_id,
       fitness_level_slug,
       fitness_rank,
       main_goals_slugs,
       equipment_items_slugs,
       injury_flags,
       preferred_days,
       minutes_per_session
     )
     VALUES ($1, 'intermediate', 1, ARRAY['strength'], ARRAY['barbell'],
             ARRAY[]::text[], ARRAY['mon','wed','fri'], 60)
     RETURNING id`,
    [userId],
  );

  return { subjectId, userId, profileId: profileR.rows[0].id };
}

async function countPrograms(db, userIds) {
  const result = await db.query(
    `SELECT count(*)::int AS count FROM program WHERE user_id = ANY($1::uuid[])`,
    [userIds],
  );
  return result.rows[0]?.count ?? 0;
}

async function deleteProgramsForUsers(db, userIds) {
  await db.query(
    `DELETE FROM generation_run
     WHERE program_id IN (SELECT id FROM program WHERE user_id = ANY($1::uuid[]))`,
    [userIds],
  );
  await db.query(`DELETE FROM program WHERE user_id = ANY($1::uuid[])`, [userIds]);
}

async function cleanupFixture(db, fixture) {
  if (!fixture) return;
  const userIds = [fixture.active.userId, fixture.inactive.userId];
  await deleteProgramsForUsers(db, userIds);
  await db.query(`DELETE FROM client_profile WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await db.query(`DELETE FROM app_user WHERE id = ANY($1::uuid[])`, [userIds]);
}

async function postGenerate(server, { token, body, extraHeaders = {} }) {
  const { port } = server.address();
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`http://127.0.0.1:${port}/generate-plan-v2`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const responseBody = await response.json();
  return { response, body: responseBody };
}

test("POST /generate-plan-v2 requires JWT entitlement and uses authenticated user_id", async (t) => {
  if (!await ensureDb(t)) return;

  const fixture = {
    active: await seedUser(pool, { status: "active" }),
    inactive: await seedUser(pool, { status: "expired" }),
  };
  const userIds = [fixture.active.userId, fixture.inactive.userId];

  try {
    await withServer(async (server) => {
      {
        const result = await postGenerate(server, {
          body: { user_id: fixture.active.userId, programType: "strength", anchor_date_ms: Date.now() },
        });

        assert.equal(result.response.status, 401);
        assert.equal(result.body.code, "unauthorized");
        assert.equal(await countPrograms(pool, userIds), 0);
      }

      {
        const result = await postGenerate(server, {
          token: signToken(fixture.inactive.userId),
          body: { user_id: fixture.inactive.userId, programType: "strength", anchor_date_ms: Date.now() },
        });

        assert.equal(result.response.status, 402);
        assert.equal(result.body.code, "subscription_required");
        assert.equal(await countPrograms(pool, userIds), 0);
      }

      {
        const result = await postGenerate(server, {
          token: signToken(fixture.active.userId),
          body: { user_id: fixture.inactive.userId, programType: "strength", anchor_date_ms: Date.now() },
        });

        assert.equal(result.response.status, 200);
        const programR = await pool.query(`SELECT user_id FROM program WHERE id = $1`, [result.body.program_id]);
        assert.equal(programR.rows[0]?.user_id, fixture.active.userId);
        await deleteProgramsForUsers(pool, userIds);
      }

      {
        const result = await postGenerate(server, {
          token: signToken(fixture.active.userId),
          body: { programType: "strength", anchor_date_ms: Date.now() },
        });

        assert.equal(result.response.status, 200);
        const programR = await pool.query(`SELECT user_id FROM program WHERE id = $1`, [result.body.program_id]);
        assert.equal(programR.rows[0]?.user_id, fixture.active.userId);
        await deleteProgramsForUsers(pool, userIds);
      }

      {
        const result = await postGenerate(server, {
          body: { user_id: fixture.active.userId, programType: "strength", anchor_date_ms: Date.now() },
          extraHeaders: { "X-Engine-Key": process.env.ENGINE_KEY ?? "ci-engine-key" },
        });

        assert.equal(result.response.status, 401);
        assert.equal(result.body.code, "unauthorized");
        assert.equal(await countPrograms(pool, userIds), 0);
      }
    });
  } finally {
    await cleanupFixture(pool, fixture);
  }
});
