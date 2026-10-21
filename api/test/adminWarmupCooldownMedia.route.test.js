import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAdminWarmupExercisesRouter } from "../src/routes/adminWarmupExercises.js";
import { createAdminCooldownExercisesRouter } from "../src/routes/adminCooldownExercises.js";
import { createAdminExerciseMediaRouter } from "../src/routes/adminExerciseMedia.js";

const TOKEN = "test-internal-token";

for (const { kind, createRouter, route, prefix } of [
  { kind: "exercise", createRouter: createAdminExerciseMediaRouter, route: "exercise-media", prefix: "exercise-media" },
  { kind: "warmup", createRouter: createAdminWarmupExercisesRouter, route: "warmup-exercises", prefix: "warmup-exercise-media" },
  { kind: "cooldown", createRouter: createAdminCooldownExercisesRouter, route: "cooldown-exercises", prefix: "cooldown-exercise-media" },
]) {
  for (const mode of ["original", "conforming", "oversized", "audio"]) {
    test(`${kind}: ${mode} video preserves sources or validates the precompressed hint`, async () => {
      await withEnv({}, async () => {
        const puts = [];
        const deletes = [];
        let compressed = 0;
        let remuxed = 0;
        let sourceKey = null;
        let deleted = false;
        let videoNotNeeded = true;
        const db = { query: async (sql, params = []) => {
          if (/SET video_key = \$2/.test(sql)) {
            assert.match(sql, /video_source_key = \$7/);
            assert.match(sql, /video_not_needed = false/);
            assert.doesNotMatch(sql, /video_not_needed_pending_promotion\s*=/);
            sourceKey = params[6];
            videoNotNeeded = false;
          }
          if (/SET video_key = null/.test(sql)) {
            assert.match(sql, /video_source_key = null/);
            sourceKey = null; deleted = true;
          }
          return { rowCount: 1, rows: [{ video_source_key: sourceKey, video_not_needed: videoNotNeeded }] };
        } };
        const result = { compressedBuffer: Buffer.from("mp4"), posterBuffer: Buffer.from("jpg"), durationSec: 1 };
        await withServer(createRouter, db, {
          putObjectFn: async (...args) => { puts.push(args); },
          deleteObjectFn: async (...args) => { deletes.push(args); throw Object.assign(new Error("gone"), { name: "NoSuchKey" }); },
          compressExerciseVideoFn: async () => {
            if (mode === "original") {
              assert.equal(puts[0][0], `${prefix}/a/source.mov`.replace(/^exercise-media\//, ""));
              assert.equal(puts[0][1].toString(), "original bytes");
              assert.equal(puts[0][2], "video/quicktime");
            }
            compressed++; return result;
          },
          probeVideoFn: async () => ({ codec: "h264", pixFmt: "yuv420p", width: mode === "oversized" ? 1280 : 960, height: 540, hasAudio: mode === "audio" }),
          remuxFaststartFn: async () => { remuxed++; return result; },
        }, async url => {
          const form = new FormData();
          form.append("video", new Blob(["original bytes"], { type: "video/quicktime" }), "Phone.MOV");
          const response = await fetch(`${url}/admin/${route}/a/video${mode === "original" ? "" : "?precompressed=1"}`, {
            method: "POST", headers: auth, body: form,
          });
          assert.equal(response.status, 200, await response.text());
          assert.equal(videoNotNeeded, false);
          assert.equal(compressed, mode === "conforming" ? 0 : 1);
          assert.equal(remuxed, mode === "conforming" ? 1 : 0);
          assert.equal(sourceKey, mode === "original" ? `${prefix}/a/source.mov` : null);
          assert.equal(puts.length, mode === "original" ? 3 : 2);
          const responseDelete = await fetch(`${url}/admin/${route}/a/video`, { method: "DELETE", headers: auth });
          assert.equal(responseDelete.status, 200);
          assert.equal(sourceKey, null);
          assert.equal(deleted, true);
          assert.deepEqual(deletes.map(call => call[0]), mode === "original" ? [`${prefix}/a/source.mov`.replace(/^exercise-media\//, "")] : []);
        });
      });
    });
  }
}
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
        || (row.video_status === "ready" && !row.promoted_video_at)
        || row.video_not_needed_pending_promotion === true);
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
      if (/SET video_not_needed_pending_promotion = false/i.test(sql)) {
        const current = state.media.get(params[0]);
        state.media.set(params[0], { ...current, video_not_needed_pending_promotion: false });
        return { rows: [], rowCount: current ? 1 : 0 };
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
          video_source_key: null,
          video_status: "none",
          promoted_video_at: null,
          uploaded_by: params[1],
        };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      if (/SELECT video_source_key FROM/i.test(sql)) {
        const row = state.media.get(params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
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
  app.use(express.json());
  app.use("/admin", createRouter({ db, deleteObjectFn: async () => {}, auditLogFn: async () => {}, ...deps }));
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

for (const [kind, createRouter, route, idColumn, listKey, auditAction] of [
  ["exercise", createAdminExerciseMediaRouter, "exercise-media", "exercise_id", "exercises", "exercise_media"],
  ["warmup", createAdminWarmupExercisesRouter, "warmup-exercises", "warmup_exercise_id", "warmupExercises", "warmup_exercise"],
  ["cooldown", createAdminCooldownExercisesRouter, "cooldown-exercises", "cooldown_exercise_id", "cooldownExercises", "cooldown_exercise"],
]) {
  test(`${kind}: video-not-needed validates auth/body/active ID and upserts both flag values`, async () => {
    await withEnv({}, async () => {
      const audits = [];
      let media = null;
      const db = { query: async (sql, params = []) => {
        if (/^SELECT /.test(sql)) {
          assert.match(sql, /AND is_archived = FALSE/);
          return { rows: [], rowCount: params[0] === "a" ? 1 : 0 };
        }
        if (/INSERT INTO/.test(sql)) {
          assert.match(sql, new RegExp(`ON CONFLICT \\(${idColumn}\\) DO UPDATE`));
          assert.match(sql, /video_not_needed = EXCLUDED.video_not_needed/);
          assert.match(sql, /video_not_needed_pending_promotion = true/);
          assert.match(sql, /updated_at = now\(\)/);
          assert.equal(params[1], "exercise-media/_placeholder/still.jpg");
          media = { [idColumn]: params[0], still_image_key: params[1], video_status: "ready",
            video_not_needed: params[2], video_not_needed_pending_promotion: true };
          return { rows: [media], rowCount: 1 };
        }
        assert.match(sql, /\.video_not_needed, \w+\.video_not_needed_pending_promotion/);
        return { rows: [media, { [idColumn]: "no-media" }], rowCount: 2 };
      } };
      await withServer(createRouter, db, { auditLogFn: async (_req, entry) => audits.push(entry) }, async url => {
        const endpoint = `${url}/admin/${route}/a/video-not-needed`;
        const send = (notNeeded, path = endpoint, authenticated = true) => fetch(path, {
          method: "PUT", headers: { ...(authenticated ? auth : {}), "Content-Type": "application/json" },
          body: JSON.stringify({ notNeeded }),
        });
        assert.equal((await send(true, endpoint, false)).status, 401);
        for (const value of ["yes", null, 1, undefined]) {
          const response = await send(value);
          assert.equal(response.status, 400);
          assert.deepEqual(await response.json(), { ok: false, code: "invalid_body", error: "notNeeded must be a boolean." });
        }
        for (const id of ["unknown", "archived"]) {
          const response = await send(true, `${url}/admin/${route}/${id}/video-not-needed`);
          assert.equal(response.status, 404);
          assert.equal((await response.json()).code, "not_found");
        }
        for (const notNeeded of [true, false]) {
          const response = await send(notNeeded);
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.media.videoNotNeeded, notNeeded);
          assert.equal(body.media.video_not_needed, notNeeded);
          assert.equal(body.media.videoNotNeededPendingPromotion, true);
          assert.equal(body.media.video_not_needed_pending_promotion, true);
          assert.equal(audits.at(-1).action, `${auditAction}.video_not_needed.set`);
          assert.deepEqual(audits.at(-1).detail, { notNeeded });
          assert.equal(audits.at(-1).entityId, "a");
        }
        const list = await fetch(`${url}/admin/${route}/list`, { headers: auth });
        assert.equal(list.status, 200);
        const rows = (await list.json())[listKey];
        assert.equal(rows[0].videoNotNeededPendingPromotion, true);
        assert.equal(rows[0].videoNotNeeded, false);
        assert.equal(rows[1].videoNotNeeded, false);
        assert.equal(rows[1].videoNotNeededPendingPromotion, false);
        assert.equal(audits.length, 2);
      });
    });
  });
}

for (const { kind, createRouter } of KINDS) {
  const base = `/admin/${kind}-exercises`;

  test(`${kind}: invalid still bytes cause no storage, DB or audit calls`, async () => {
    await withEnv({}, async () => {
      const unexpected = async () => assert.fail("Invalid images must not reach dependencies");
      await withServer(createRouter, { query: unexpected }, { putObjectFn: unexpected, auditLogFn: unexpected }, async url => {
        const data = new FormData();
        data.append("still", new Blob(["not an image"], { type: "image/jpeg" }), "x.jpg");
        const response = await fetch(`${url}${base}/a/still`, { method: "POST", headers: auth, body: data });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { ok: false, code: "invalid_image", error: "Could not read the image file." });
      });
    });
  });

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
        assert.deepEqual((await res.json()).promoted, { still: true, video: true, videoNotNeeded: false });
      });
      assert.deepEqual(calls.map((c) => c.url), [
        `${PROD_BASE}/admin/${kind}-exercises/a/still`,
        `${PROD_BASE}/admin/${kind}-exercises/a/video?precompressed=1`,
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
        assert.deepEqual(body.promoted, { still: false, video: false, videoNotNeeded: false });
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


for (const { kind, createRouter } of KINDS) {
  for (const notNeeded of [true, false]) {
    test(`${kind}: promote-all includes a flag-only change to ${notNeeded}`, async () => {
      await withEnv(PROD_ENV, async () => {
        const db = createDb(kind);
        seed(db, kind, "a", { video_not_needed: notNeeded, video_not_needed_pending_promotion: true });
        let calls = 0;
        await withServer(createRouter, db, {
          getObjectFn: async () => assert.fail("No objects needed for flag promotion"),
          fetchFn: async (url, options) => {
            calls++;
            assert.equal(url, `${PROD_BASE}/admin/${kind}-exercises/a/video-not-needed`);
            assert.equal(options.method, "PUT");
            assert.equal(options.headers["X-Internal-Token"], "prod-token");
            assert.deepEqual(JSON.parse(options.body), { notNeeded });
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
          },
        }, async url => {
          const response = await fetch(`${url}/admin/${kind}-exercises/promote-all`, { method: "POST", headers: auth });
          assert.equal(response.status, 200);
          assert.deepEqual((await response.json()).results[0].promoted, { still: false, video: false, videoNotNeeded: true });
          assert.equal(calls, 1);
          assert.equal(db.state.media.get("a").video_not_needed_pending_promotion, false);
          const select = db.state.queries.find(sql => /FROM .*_exercise e/.test(sql));
          assert.match(select, /OR m\.video_not_needed_pending_promotion = true/);
          assert.match(select, /m\.video_not_needed, m\.video_not_needed_pending_promotion/);
        });
      });
    });
  }
}
