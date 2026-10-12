import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAdminWarmupExercisesRouter } from "../src/routes/adminWarmupExercises.js";
import { createAdminCooldownExercisesRouter } from "../src/routes/adminCooldownExercises.js";

const TOKEN = "test-internal-token";
const PROD_BASE = "https://prod.example.test";

// Warm-up and cool-down routers are structurally identical, so every case runs against both.
const KINDS = [
  { kind: "warmup", createRouter: createAdminWarmupExercisesRouter },
  { kind: "cooldown", createRouter: createAdminCooldownExercisesRouter },
];

function createDb(kind) {
  const idCol = `${kind}_exercise_id`;
  const state = { exercises: new Map(), media: new Map(), queries: [] };

  function joined({ id = null, eligibleOnly = false } = {}) {
    return Array.from(state.exercises.values())
      .filter((row) => row.is_archived === false)
      .filter((row) => !id || row[idCol] === id)
      .map((row) => ({ ...row, ...(state.media.get(row[idCol]) ?? {}) }))
      .filter((row) => !eligibleOnly
        || (row.still_image_is_placeholder === false && !row.promoted_still_at)
        || (row.video_status === "ready" && !row.promoted_video_at));
  }

  const db = {
    state,
    async query(sql, params = []) {
      state.queries.push(sql);
      if (new RegExp(`FROM ${kind}_exercise e\\b`, "i").test(sql)) {
        const id = new RegExp(`e\\.${idCol} = \\$1`, "i").test(sql) ? params[0] : null;
        const rows = joined({ id, eligibleOnly: /promoted_still_at IS NULL/i.test(sql) });
        return { rows, rowCount: rows.length };
      }
      if (new RegExp(`SELECT ${idCol} FROM ${kind}_exercise WHERE`, "i").test(sql)) {
        const row = state.exercises.get(params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      const stamp = sql.match(new RegExp(`UPDATE ${kind}_exercise_media SET (promoted_still_at|promoted_video_at) = now\\(\\)`, "i"));
      if (stamp) {
        const current = state.media.get(params[0]);
        state.media.set(params[0], { ...current, [stamp[1]]: new Date("2026-10-07T10:00:00Z") });
        return { rows: [], rowCount: current ? 1 : 0 };
      }
      if (new RegExp(`UPDATE ${kind}_exercise_media\\s+SET video_key = null`, "i").test(sql)) {
        const current = state.media.get(params[0]);
        if (!current) return { rows: [], rowCount: 0 };
        const row = {
          ...current,
          video_key: null,
          poster_frame_key: null,
          video_duration_sec: null,
          video_source_filename: null,
          video_status: "none",
          promoted_video_at: null,
          uploaded_by: params[1],
        };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return db;
}

function seed(db, kind, id, media = {}, exercise = {}) {
  db.state.exercises.set(id, { [`${kind}_exercise_id`]: id, name: id, is_archived: false, ...exercise });
  db.state.media.set(id, {
    [`${kind}_exercise_id`]: id,
    still_image_key: "exercise-media/_placeholder/still.jpg",
    still_image_is_placeholder: true,
    video_key: null,
    video_status: "none",
    poster_frame_key: null,
    promoted_still_at: null,
    promoted_video_at: null,
    ...media,
  });
}

async function withEnv(env, fn) {
  const keys = ["INTERNAL_API_TOKEN", "PROD_ADMIN_API_BASE_URL", "PROD_INTERNAL_API_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.INTERNAL_API_TOKEN = TOKEN;
  for (const key of keys.slice(1)) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const PROD_ENV = { PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" };

async function withServer(createRouter, db, deps, fn) {
  const app = express();
  app.use("/admin", createRouter({ db, auditLogFn: async () => {}, ...deps }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

const auth = { "X-Internal-Token": TOKEN };

for (const { kind, createRouter } of KINDS) {
  const base = `/admin/${kind}-exercises`;

  test(`${kind}: new media routes require the internal token`, async () => {
    await withEnv(PROD_ENV, async () => {
      const db = createDb(kind);
      seed(db, kind, "a");
      await withServer(createRouter, db, {}, async (url) => {
        for (const [method, path] of [["DELETE", "/a/video"], ["POST", "/a/promote"], ["POST", "/promote-all"]]) {
          const res = await fetch(`${url}${base}${path}`, { method });
          assert.equal(res.status, 401, `${method} ${path}`);
        }
      });
    });
  });

  test(`${kind}: DELETE video clears video fields and promotion stamp; 404 for unknown id`, async () => {
    await withEnv(PROD_ENV, async () => {
      const db = createDb(kind);
      seed(db, kind, "a", {
        video_key: `${kind}-exercise-media/a/video.mp4`,
        poster_frame_key: `${kind}-exercise-media/a/poster.jpg`,
        video_status: "ready",
        video_duration_sec: 8,
        promoted_video_at: new Date("2026-10-01T00:00:00Z"),
      });
      await withServer(createRouter, db, {}, async (url) => {
        const res = await fetch(`${url}${base}/a/video`, { method: "DELETE", headers: auth });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.media.videoStatus, "none");
        assert.equal(body.media.videoKey, null);
        assert.equal(body.media.posterFrameKey, null);
        assert.equal(body.media.promotedVideoAt, null);

        const missing = await fetch(`${url}${base}/nope/video`, { method: "DELETE", headers: auth });
        assert.equal(missing.status, 404);
      });
    });
  });

  test(`${kind}: promote uploads to the matching production route and stamps both parts`, async () => {
    await withEnv(PROD_ENV, async () => {
      const db = createDb(kind);
      seed(db, kind, "a", {
        still_image_key: `${kind}-exercise-media/a/still.jpg`,
        still_image_is_placeholder: false,
        video_key: `${kind}-exercise-media/a/video.mp4`,
        video_status: "ready",
      });
      const calls = [];
      const fetchFn = async (url, options) => {
        calls.push({ url, token: options.headers["X-Internal-Token"] });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };
      await withServer(createRouter, db, { fetchFn, getObjectFn: async () => Buffer.from("x") }, async (url) => {
        const res = await fetch(`${url}${base}/a/promote`, { method: "POST", headers: auth });
        assert.equal(res.status, 200);
        assert.deepEqual((await res.json()).promoted, { still: true, video: true });
      });
      assert.deepEqual(calls.map((c) => c.url), [
        `${PROD_BASE}/admin/${kind}-exercises/a/still`,
        `${PROD_BASE}/admin/${kind}-exercises/a/video`,
      ]);
      assert.ok(calls.every((c) => c.token === "prod-token"));
      assert.ok(db.state.media.get("a").promoted_still_at);
      assert.ok(db.state.media.get("a").promoted_video_at);
    });
  });

  test(`${kind}: promote reports a production failure without stamping`, async () => {
    await withEnv(PROD_ENV, async () => {
      const db = createDb(kind);
      seed(db, kind, "a", { still_image_key: `${kind}-exercise-media/a/still.jpg`, still_image_is_placeholder: false });
      const fetchFn = async () => new Response(JSON.stringify({ ok: false, error: "not found in prod" }), { status: 404 });
      await withServer(createRouter, db, { fetchFn, getObjectFn: async () => Buffer.from("x") }, async (url) => {
        const res = await fetch(`${url}${base}/a/promote`, { method: "POST", headers: auth });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.deepEqual(body.promoted, { still: false, video: false });
        assert.equal(body.errors.still, "not found in prod");
      });
      assert.equal(db.state.media.get("a").promoted_still_at, null);
    });
  });

  test(`${kind}: promote-all only promotes active rows with pending media`, async () => {
    await withEnv(PROD_ENV, async () => {
      const db = createDb(kind);
      seed(db, kind, "pending", { still_image_key: "s.jpg", still_image_is_placeholder: false });
      seed(db, kind, "done", { still_image_key: "s.jpg", still_image_is_placeholder: false, promoted_still_at: new Date() });
      seed(db, kind, "placeholder");
      seed(db, kind, "archived", { still_image_key: "s.jpg", still_image_is_placeholder: false }, { is_archived: true });
      const calls = [];
      const fetchFn = async (url) => {
        calls.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };
      await withServer(createRouter, db, { fetchFn, getObjectFn: async () => Buffer.from("x") }, async (url) => {
        const res = await fetch(`${url}${base}/promote-all`, { method: "POST", headers: auth });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.deepEqual(body.results.map((r) => r.exerciseId), ["pending"]);
      });
      assert.deepEqual(calls, [`${PROD_BASE}/admin/${kind}-exercises/pending/still`]);
    });
  });

  test(`${kind}: promote and promote-all return 400 when promotion is not configured`, async () => {
    await withEnv({}, async () => {
      const db = createDb(kind);
      seed(db, kind, "a", { still_image_key: "s.jpg", still_image_is_placeholder: false });
      await withServer(createRouter, db, {}, async (url) => {
        for (const path of ["/a/promote", "/promote-all"]) {
          const res = await fetch(`${url}${base}${path}`, { method: "POST", headers: auth });
          assert.equal(res.status, 400, path);
        }
      });
    });
  });
}
