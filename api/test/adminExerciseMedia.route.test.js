import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAdminExerciseMediaRouter } from "../src/routes/adminExerciseMedia.js";

const TOKEN = "test-internal-token";

function createDb() {
  const state = {
    exercises: new Map([
      ["sled_push", { exercise_id: "sled_push", name: "Sled Push", is_archived: false }],
    ]),
    media: new Map([
      ["sled_push", {
        exercise_id: "sled_push",
        still_image_key: "exercise-media/_placeholder/still.jpg",
        still_image_is_placeholder: true,
        video_key: null,
        video_status: "none",
        video_duration_sec: null,
        video_source_filename: null,
        poster_frame_key: null,
      }],
    ]),
  };

  const db = {
    state,
    async query(sql, params = []) {
      if (/FROM exercise_catalogue ec/i.test(sql)) {
        const rows = Array.from(state.exercises.values())
          .filter((row) => row.is_archived === false)
          .map((exercise) => ({ ...exercise, ...(state.media.get(exercise.exercise_id) ?? {}) }));
        return { rows, rowCount: rows.length };
      }
      if (/SELECT exercise_id FROM exercise_catalogue/i.test(sql)) {
        const row = state.exercises.get(params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/INSERT INTO exercise_media/i.test(sql) && /still_image_key/i.test(sql) && /still_image_is_placeholder/i.test(sql)) {
        const current = state.media.get(params[0]) ?? { exercise_id: params[0], video_status: "none" };
        const row = {
          ...current,
          exercise_id: params[0],
          still_image_key: params[1],
          still_image_is_placeholder: false,
          uploaded_by: params[2],
        };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      if (/INSERT INTO exercise_media/i.test(sql) && /video_status/i.test(sql)) {
        const current = state.media.get(params[0]) ?? {
          exercise_id: params[0],
          still_image_key: "exercise-media/_placeholder/still.jpg",
          still_image_is_placeholder: true,
        };
        state.media.set(params[0], { ...current, video_status: "processing", uploaded_by: params[1] });
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE exercise_media/i.test(sql) && /video_status = 'failed'/i.test(sql)) {
        const current = state.media.get(params[0]);
        state.media.set(params[0], { ...current, video_status: "failed" });
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE exercise_media/i.test(sql) && /video_key = \$2/i.test(sql)) {
        const current = state.media.get(params[0]);
        const row = {
          ...current,
          video_key: params[1],
          poster_frame_key: params[2],
          video_duration_sec: params[3],
          video_status: "ready",
          video_source_filename: params[4],
          uploaded_by: params[5],
        };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      if (/UPDATE exercise_media/i.test(sql) && /video_key = null/i.test(sql)) {
        const current = state.media.get(params[0]);
        const row = {
          ...current,
          video_key: null,
          poster_frame_key: null,
          video_duration_sec: null,
          video_source_filename: null,
          video_status: "none",
        };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      if (/SELECT poster_frame_key FROM exercise_media/i.test(sql)) {
        const row = state.media.get(params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/UPDATE exercise_media/i.test(sql) && /still_image_key = \$2/i.test(sql)) {
        const current = state.media.get(params[0]);
        const row = { ...current, still_image_key: params[1], still_image_is_placeholder: false };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return db;
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

test("GET /admin/exercise-media/list requires token and returns active rows", async () => {
  process.env.INTERNAL_API_TOKEN = TOKEN;
  const db = createDb();
  await withServer(db, {}, async (base) => {
    const noToken = await fetch(`${base}/admin/exercise-media/list`);
    assert.equal(noToken.status, 401);

    const ok = await fetch(`${base}/admin/exercise-media/list`, { headers: headers() });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(body.exercises.length, 1);
    assert.equal(body.exercises[0].stillImageIsPlaceholder, true);
  });
});

test("still upload validates type, exercise existence, writes media, and audits", async () => {
  process.env.INTERNAL_API_TOKEN = TOKEN;
  const db = createDb();
  const audits = [];
  await withServer(db, {
    putObjectFn: async (key) => key,
    auditLogFn: async (_req, entry) => audits.push(entry),
  }, async (base) => {
    const bad = await fetch(`${base}/admin/exercise-media/sled_push/still`, {
      method: "POST",
      headers: headers(),
      body: form("still", new Blob(["nope"], { type: "text/plain" }), "bad.txt"),
    });
    assert.equal(bad.status, 400);

    const missing = await fetch(`${base}/admin/exercise-media/unknown/still`, {
      method: "POST",
      headers: headers(),
      body: form("still", new Blob(["jpg"], { type: "image/jpeg" }), "still.jpg"),
    });
    assert.equal(missing.status, 404);

    const ok = await fetch(`${base}/admin/exercise-media/sled_push/still`, {
      method: "POST",
      headers: headers(),
      body: form("still", new Blob(["jpg"], { type: "image/jpeg" }), "still.jpg"),
    });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(db.state.media.get("sled_push").still_image_is_placeholder, false);
    assert.equal(body.media.stillImageUrl.includes("exercise-media/sled_push/still.jpg"), true);
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].entity, "exercise_media");
  assert.equal(audits[0].entityId, "sled_push");
});

test("video upload ready path, corrupt failure, delete, and poster-as-still behave correctly", async () => {
  process.env.INTERNAL_API_TOKEN = TOKEN;
  const db = createDb();
  const audits = [];
  const stored = new Map();
  await withServer(db, {
    putObjectFn: async (key, buffer) => stored.set(key, Buffer.from(buffer)),
    getObjectFn: async (key) => stored.get(key) ?? Buffer.from("poster"),
    auditLogFn: async (_req, entry) => audits.push(entry),
    compressExerciseVideoFn: async (buffer) => {
      if (buffer.toString().includes("corrupt")) throw new Error("not a video");
      return {
        compressedBuffer: Buffer.from("mp4"),
        posterBuffer: Buffer.from("poster"),
        durationSec: 2.4,
      };
    },
  }, async (base) => {
    const ok = await fetch(`${base}/admin/exercise-media/sled_push/video`, {
      method: "POST",
      headers: headers(),
      body: form("video", new Blob(["valid"], { type: "video/mp4" }), "demo.mp4"),
    });
    assert.equal(ok.status, 200);
    assert.equal(db.state.media.get("sled_push").video_status, "ready");
    assert.equal(db.state.media.get("sled_push").video_duration_sec, 2.4);

    const poster = await fetch(`${base}/admin/exercise-media/sled_push/use-poster-as-still`, {
      method: "POST",
      headers: headers(),
    });
    assert.equal(poster.status, 200);
    assert.equal(db.state.media.get("sled_push").still_image_is_placeholder, false);

    const del = await fetch(`${base}/admin/exercise-media/sled_push/video`, {
      method: "DELETE",
      headers: headers(),
    });
    assert.equal(del.status, 200);
    assert.equal(db.state.media.get("sled_push").video_status, "none");
    assert.equal(db.state.media.get("sled_push").still_image_key, "exercise-media/sled_push/still.jpg");

    const noPoster = await fetch(`${base}/admin/exercise-media/sled_push/use-poster-as-still`, {
      method: "POST",
      headers: headers(),
    });
    assert.equal(noPoster.status, 400);

    const bad = await fetch(`${base}/admin/exercise-media/sled_push/video`, {
      method: "POST",
      headers: headers(),
      body: form("video", new Blob(["corrupt"], { type: "video/mp4" }), "bad.mp4"),
    });
    assert.equal(bad.status, 422);
    assert.notEqual(db.state.media.get("sled_push").video_status, "ready");
  });
  assert.equal(audits.length, 3);
  assert.deepEqual(audits.map((row) => row.entity), ["exercise_media", "exercise_media", "exercise_media"]);
});
