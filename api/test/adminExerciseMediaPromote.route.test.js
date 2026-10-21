import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import sharp from "sharp";
import { createAdminExerciseMediaRouter } from "../src/routes/adminExerciseMedia.js";

const TOKEN = "test-internal-token";

for (const [ext, mime] of [["mov", "video/quicktime"], ["mp4", "video/mp4"]]) {
  test(`promotion sends the original ${ext} once without the precompressed flag`, async () => {
    await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
      const db = createDb();
      seedExercise(db, "source_clip", { video_key: "exercise-media/source_clip/video.mp4", video_source_key: `exercise-media/source_clip/source.${ext}`, video_status: "ready" });
      let sent = false;
      await withServer(db, {
        getObjectFn: async key => { assert.equal(key, `source_clip/source.${ext}`); return Buffer.from("original"); },
        fetchFn: async (url, options) => {
          assert.equal(url, `${PROD_BASE}/admin/exercise-media/source_clip/video`);
          const file = options.body.get("video");
          assert.equal(file.name, `source.${ext}`);
          assert.equal(file.type, mime);
          assert.equal(await file.text(), "original");
          sent = true;
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        },
      }, async base => {
        const response = await fetch(`${base}/admin/exercise-media/source_clip/promote`, { method: "POST", headers: headers() });
        assert.deepEqual((await response.json()).promoted, { still: false, video: true, videoNotNeeded: false });
      });
      assert.equal(sent, true);
    });
  });
}
const PROD_BASE = "https://prod.example.test";

function createDb() {
  const state = {
    exercises: new Map(),
    media: new Map(),
  };

  function joinedRows({ activeOnly = true, exerciseId = null, eligibleOnly = false } = {}) {
    return Array.from(state.exercises.values())
      .filter((exercise) => !activeOnly || exercise.is_archived === false)
      .filter((exercise) => !exerciseId || exercise.exercise_id === exerciseId)
      .map((exercise) => ({ ...exercise, ...(state.media.get(exercise.exercise_id) ?? {}) }))
      .filter((row) => {
        if (!eligibleOnly) return true;
        return (
          (row.still_image_is_placeholder === false && !row.promoted_still_at) ||
          (row.video_status === "ready" && !row.promoted_video_at) ||
          row.video_not_needed_pending_promotion === true
        );
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  const db = {
    state,
    async query(sql, params = []) {
      if (/FROM exercise_catalogue ec/i.test(sql)) {
        const exerciseId = /ec\.exercise_id = \$1/i.test(sql) ? params[0] : null;
        const eligibleOnly = /promoted_still_at IS NULL/i.test(sql) || /promoted_video_at IS NULL/i.test(sql);
        if (eligibleOnly) assert.match(sql, /OR em\.video_not_needed_pending_promotion = true/);
        assert.match(sql, /em\.video_not_needed, em\.video_not_needed_pending_promotion/);
        const rows = joinedRows({ exerciseId, eligibleOnly });
        return { rows, rowCount: rows.length };
      }
      if (/SELECT exercise_id FROM exercise_catalogue/i.test(sql)) {
        const row = state.exercises.get(params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/UPDATE exercise_media SET video_not_needed_pending_promotion = false/i.test(sql)) {
        const current = state.media.get(params[0]);
        state.media.set(params[0], { ...current, video_not_needed_pending_promotion: false });
        return { rows: [], rowCount: current ? 1 : 0 };
      }
      if (/UPDATE exercise_media SET promoted_still_at = now\(\)/i.test(sql)) {
        const current = state.media.get(params[0]);
        state.media.set(params[0], { ...current, promoted_still_at: new Date("2026-09-12T10:00:00Z") });
        return { rows: [], rowCount: current ? 1 : 0 };
      }
      if (/UPDATE exercise_media SET promoted_video_at = now\(\)/i.test(sql)) {
        const current = state.media.get(params[0]);
        state.media.set(params[0], { ...current, promoted_video_at: new Date("2026-09-12T10:01:00Z") });
        return { rows: [], rowCount: current ? 1 : 0 };
      }
      if (/INSERT INTO exercise_media/i.test(sql) && /still_image_key/i.test(sql) && /still_image_is_placeholder/i.test(sql)) {
        const current = state.media.get(params[0]) ?? { exercise_id: params[0], video_status: "none" };
        const row = {
          ...current,
          exercise_id: params[0],
          still_image_key: params[1],
          still_image_is_placeholder: false,
          promoted_still_at: null,
          uploaded_by: params[2],
        };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return db;
}

function seedExercise(db, id, mediaOverrides = {}) {
  db.state.exercises.set(id, { exercise_id: id, name: id.replace(/_/g, " "), is_archived: false });
  db.state.media.set(id, {
    exercise_id: id,
    still_image_key: "exercise-media/_placeholder/still.jpg",
    still_image_is_placeholder: true,
    video_key: null,
    video_status: "none",
    video_duration_sec: null,
    video_source_filename: null,
    poster_frame_key: null,
    promoted_still_at: null,
    promoted_video_at: null,
    ...mediaOverrides,
  });
}

async function withEnv(env, fn) {
  const previous = {
    INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
    PROD_ADMIN_API_BASE_URL: process.env.PROD_ADMIN_API_BASE_URL,
    PROD_INTERNAL_API_TOKEN: process.env.PROD_INTERNAL_API_TOKEN,
  };
  process.env.INTERNAL_API_TOKEN = TOKEN;
  if (Object.prototype.hasOwnProperty.call(env, "PROD_ADMIN_API_BASE_URL")) {
    process.env.PROD_ADMIN_API_BASE_URL = env.PROD_ADMIN_API_BASE_URL;
  }
  if (Object.prototype.hasOwnProperty.call(env, "PROD_INTERNAL_API_TOKEN")) {
    process.env.PROD_INTERNAL_API_TOKEN = env.PROD_INTERNAL_API_TOKEN;
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

async function withServer(db, deps, fn) {
  const app = express();
  app.use("/admin", createAdminExerciseMediaRouter({ db, ...deps }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function headers() {
  return { "X-Internal-Token": TOKEN };
}

function form(field, blob, filename) {
  const fd = new FormData();
  fd.append(field, blob, filename);
  return fd;
}

test("promote sends still and video to production and marks both promoted", async () => {
  await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
    const db = createDb();
    seedExercise(db, "sled_push", {
      still_image_key: "exercise-media/sled_push/still.jpg",
      still_image_is_placeholder: false,
      video_key: "exercise-media/sled_push/video.mp4",
      video_status: "ready",
    });
    const fetchCalls = [];
    await withServer(db, {
      getObjectFn: async () => Buffer.from("asset"),
      fetchFn: async (url, options) => {
        fetchCalls.push({ url, options });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    }, async (base) => {
      const res = await fetch(`${base}/admin/exercise-media/sled_push/promote`, { method: "POST", headers: headers() });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(body.promoted, { still: true, video: true, videoNotNeeded: false });
    });

    assert.deepEqual(fetchCalls.map((call) => call.url), [
      `${PROD_BASE}/admin/exercise-media/sled_push/still`,
      `${PROD_BASE}/admin/exercise-media/sled_push/video?precompressed=1`,
    ]);
    assert.equal(fetchCalls.every((call) => call.options.headers["X-Internal-Token"] === "prod-token"), true);
    assert.ok(db.state.media.get("sled_push").promoted_still_at);
    assert.ok(db.state.media.get("sled_push").promoted_video_at);
  });
});

test("promote skips placeholder stills and absent videos", async () => {
  await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
    const db = createDb();
    seedExercise(db, "air_squat");
    let fetchCount = 0;
    await withServer(db, {
      fetchFn: async () => {
        fetchCount += 1;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    }, async (base) => {
      const res = await fetch(`${base}/admin/exercise-media/air_squat/promote`, { method: "POST", headers: headers() });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(body.promoted, { still: false, video: false, videoNotNeeded: false });
    });
    assert.equal(fetchCount, 0);
  });
});

test("promote does not resend unchanged media after a successful promotion", async () => {
  await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
    const db = createDb();
    seedExercise(db, "bench_press", {
      still_image_key: "exercise-media/bench_press/still.jpg",
      still_image_is_placeholder: false,
    });
    let fetchCount = 0;
    await withServer(db, {
      getObjectFn: async () => Buffer.from("asset"),
      fetchFn: async () => {
        fetchCount += 1;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    }, async (base) => {
      let res = await fetch(`${base}/admin/exercise-media/bench_press/promote`, { method: "POST", headers: headers() });
      assert.equal(res.status, 200);
      assert.equal(fetchCount, 1);

      res = await fetch(`${base}/admin/exercise-media/bench_press/promote`, { method: "POST", headers: headers() });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(body.promoted, { still: false, video: false, videoNotNeeded: false });
      assert.equal(fetchCount, 1);
    });
  });
});

test("still re-upload resets promotedStillAt in list response", async () => {
  const jpeg = await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } }).jpeg().toBuffer();
  await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
    const db = createDb();
    seedExercise(db, "row", {
      still_image_key: "exercise-media/row/still.jpg",
      still_image_is_placeholder: false,
    });
    await withServer(db, {
      putObjectFn: async () => "ok",
      getObjectFn: async () => Buffer.from("asset"),
      fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
      auditLogFn: async () => {},
    }, async (base) => {
      await fetch(`${base}/admin/exercise-media/row/promote`, { method: "POST", headers: headers() });
      assert.ok(db.state.media.get("row").promoted_still_at);

      const upload = await fetch(`${base}/admin/exercise-media/row/still`, {
        method: "POST",
        headers: headers(),
        body: form("still", new Blob([jpeg], { type: "image/jpeg" }), "still.jpg"),
      });
      assert.equal(upload.status, 200);

      const list = await fetch(`${base}/admin/exercise-media/list`, { headers: headers() });
      const body = await list.json();
      assert.equal(body.exercises[0].promotedStillAt, null);
    });
  });
});

test("upstream failure reports errors and does not set promoted timestamp", async () => {
  await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
    const db = createDb();
    seedExercise(db, "deadlift", {
      still_image_key: "exercise-media/deadlift/still.jpg",
      still_image_is_placeholder: false,
    });
    await withServer(db, {
      getObjectFn: async () => Buffer.from("asset"),
      fetchFn: async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: "bad token" }) }),
    }, async (base) => {
      const res = await fetch(`${base}/admin/exercise-media/deadlift/promote`, { method: "POST", headers: headers() });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.errors.still, "bad token");
      assert.equal(db.state.media.get("deadlift").promoted_still_at, null);
    });
  });
});

test("promote-all continues after a partial failure", async () => {
  await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
    const db = createDb();
    seedExercise(db, "a_first", { still_image_key: "exercise-media/a_first/still.jpg", still_image_is_placeholder: false });
    seedExercise(db, "b_second", { still_image_key: "exercise-media/b_second/still.jpg", still_image_is_placeholder: false });
    let fetchCount = 0;
    await withServer(db, {
      getObjectFn: async () => Buffer.from("asset"),
      fetchFn: async () => {
        fetchCount += 1;
        if (fetchCount === 1) return { ok: false, status: 401, json: async () => ({ ok: false, error: "bad token" }) };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    }, async (base) => {
      const res = await fetch(`${base}/admin/exercise-media/promote-all`, { method: "POST", headers: headers() });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.results.length, 2);
      assert.equal(body.results[0].errors.still, "bad token");
      assert.deepEqual(body.results[1].promoted, { still: true, video: false, videoNotNeeded: false });
      assert.equal(db.state.media.get("a_first").promoted_still_at, null);
      assert.ok(db.state.media.get("b_second").promoted_still_at);
    });
  });
});

test("promotion routes return not configured and make no outbound calls when env is missing", async () => {
  await withEnv({ PROD_ADMIN_API_BASE_URL: "", PROD_INTERNAL_API_TOKEN: "" }, async () => {
    const db = createDb();
    seedExercise(db, "press", { still_image_key: "exercise-media/press/still.jpg", still_image_is_placeholder: false });
    let fetchCount = 0;
    await withServer(db, {
      fetchFn: async () => {
        fetchCount += 1;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    }, async (base) => {
      let res = await fetch(`${base}/admin/exercise-media/press/promote`, { method: "POST", headers: headers() });
      let body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.error, "Production promotion is not configured");

      res = await fetch(`${base}/admin/exercise-media/promote-all`, { method: "POST", headers: headers() });
      body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.error, "Production promotion is not configured");
    });
    assert.equal(fetchCount, 0);
  });
});

test("promotion routes require the internal token", async () => {
  await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
    const db = createDb();
    seedExercise(db, "press", { still_image_key: "exercise-media/press/still.jpg", still_image_is_placeholder: false });
    await withServer(db, {}, async (base) => {
      assert.equal((await fetch(`${base}/admin/exercise-media/press/promote`, { method: "POST" })).status, 401);
      assert.equal((await fetch(`${base}/admin/exercise-media/promote-all`, { method: "POST" })).status, 401);
    });
  });
});


for (const notNeeded of [true, false]) {
  test(`flag-only promotion sends ${notNeeded} and clears pending, including promote-all`, async () => {
    await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
      const db = createDb();
      seedExercise(db, "still_only", { video_not_needed: notNeeded, video_not_needed_pending_promotion: true });
      const requests = [];
      await withServer(db, {
        getObjectFn: async () => assert.fail("Flag-only promotion must not read objects"),
        fetchFn: async (url, options) => {
          requests.push(url);
          assert.equal(url, `${PROD_BASE}/admin/exercise-media/still_only/video-not-needed`);
          assert.equal(options.method, "PUT");
          assert.deepEqual(options.headers, { "X-Internal-Token": "prod-token", "Content-Type": "application/json" });
          assert.deepEqual(JSON.parse(options.body), { notNeeded });
          return { ok: true, status: 204, json: async () => { throw new Error("no content"); } };
        },
      }, async url => {
        const response = await fetch(`${url}/admin/exercise-media/${notNeeded ? "promote-all" : "still_only/promote"}`, { method: "POST", headers: headers() });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.deepEqual((notNeeded ? body.results[0] : body).promoted, { still: false, video: false, videoNotNeeded: true });
        assert.equal(db.state.media.get("still_only").video_not_needed_pending_promotion, false);
        assert.equal(requests.length, 1);
        const again = await fetch(`${url}/admin/exercise-media/still_only/promote`, { method: "POST", headers: headers() });
        assert.equal(again.status, 200);
        assert.equal(requests.length, 1);
      });
    });
  });
}

test("flag promotion failure retains pending and still continues with media promotion", async () => {
  await withEnv({ PROD_ADMIN_API_BASE_URL: PROD_BASE, PROD_INTERNAL_API_TOKEN: "prod-token" }, async () => {
    const db = createDb();
    seedExercise(db, "hold", { video_not_needed: true, video_not_needed_pending_promotion: true,
      still_image_is_placeholder: false, still_image_key: "exercise-media/hold/still.jpg",
      video_status: "ready", video_key: "exercise-media/hold/video.mp4" });
    const requests = [];
    await withServer(db, {
      getObjectFn: async () => Buffer.from("media"),
      fetchFn: async (url) => {
        requests.push(url);
        return url.endsWith("video-not-needed")
          ? { ok: false, status: 500, json: async () => ({ error: "Flag rejected" }) }
          : { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    }, async url => {
      const response = await fetch(`${url}/admin/exercise-media/hold/promote`, { method: "POST", headers: headers() });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.promoted, { still: true, video: true, videoNotNeeded: false });
      assert.equal(body.errors.videoNotNeeded, "Flag rejected");
      assert.equal(db.state.media.get("hold").video_not_needed_pending_promotion, true);
      assert.equal(requests.length, 3);
      assert.ok(requests[0].endsWith("video-not-needed"));
    });
  });
});
