import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAdminWarmupExercisesRouter } from "../src/routes/adminWarmupExercises.js";

const TOKEN = "test-internal-token";

function createDb() {
  const state = { warmups: new Map(), media: new Map() };
  const db = {
    state,
    async query(sql, params = []) {
      if (/FROM warmup_exercise we/i.test(sql) && /LEFT JOIN warmup_exercise_media/i.test(sql)) {
        const rows = Array.from(state.warmups.values()).map((row) => ({ ...row, ...(state.media.get(row.warmup_exercise_id) ?? {}) }));
        return { rows, rowCount: rows.length };
      }
      if (/SELECT warmup_exercise_id FROM warmup_exercise/i.test(sql)) {
        const row = state.warmups.get(params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/INSERT INTO warmup_exercise \(/i.test(sql)) {
        const row = {
          warmup_exercise_id: params[0],
          name: params[1],
          target_regions_json: JSON.parse(params[2]),
          equipment_items_slugs: params[3],
          cue_text: params[4],
          duration_or_reps_label: params[5],
          rounds: params[6],
          is_archived: false,
        };
        state.warmups.set(row.warmup_exercise_id, row);
        return { rows: [row], rowCount: 1 };
      }
      if (/INSERT INTO warmup_exercise_media/i.test(sql) && /still_image_is_placeholder/i.test(sql) && !/ON CONFLICT/i.test(sql)) {
        const row = { warmup_exercise_id: params[0], still_image_key: params[1], still_image_is_placeholder: true, video_status: "none" };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      if (/UPDATE warmup_exercise\s+SET name/i.test(sql)) {
        const current = state.warmups.get(params[0]);
        if (!current) return { rows: [], rowCount: 0 };
        const row = {
          ...current,
          name: params[1],
          target_regions_json: JSON.parse(params[2]),
          equipment_items_slugs: params[3],
          cue_text: params[4],
          duration_or_reps_label: params[5],
          rounds: params[6],
          is_archived: params[7] ?? current.is_archived,
        };
        state.warmups.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      if (/UPDATE warmup_exercise SET is_archived = true/i.test(sql)) {
        const current = state.warmups.get(params[0]);
        if (!current) return { rows: [], rowCount: 0 };
        const row = { ...current, is_archived: true };
        state.warmups.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      if (/INSERT INTO warmup_exercise_media/i.test(sql) && /ON CONFLICT/i.test(sql) && /still_image_key/i.test(sql)) {
        const row = { ...(state.media.get(params[0]) ?? {}), warmup_exercise_id: params[0], still_image_key: params[1], still_image_is_placeholder: false, uploaded_by: params[2], video_status: "none" };
        state.media.set(params[0], row);
        return { rows: [row], rowCount: 1 };
      }
      if (/INSERT INTO warmup_exercise_media/i.test(sql) && /video_status/i.test(sql)) {
        const row = { ...(state.media.get(params[0]) ?? {}), warmup_exercise_id: params[0], still_image_key: params[1], video_status: "processing" };
        state.media.set(params[0], row);
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE warmup_exercise_media/i.test(sql) && /video_status = 'ready'/i.test(sql)) {
        const row = { ...(state.media.get(params[0]) ?? {}), warmup_exercise_id: params[0], video_key: params[1], poster_frame_key: params[2], video_duration_sec: params[3], video_status: "ready", video_source_filename: params[4] };
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
  app.use(express.json());
  app.use("/admin", createAdminWarmupExercisesRouter({ db, ...deps }));
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
  return { "X-Internal-Token": TOKEN, "Content-Type": "application/json" };
}

function form(field, blob, filename) {
  const fd = new FormData();
  fd.append(field, blob, filename);
  return fd;
}

test("GET /admin/warmup-exercises/list requires token and returns seeded rows", async () => {
  process.env.INTERNAL_API_TOKEN = TOKEN;
  const db = createDb();
  db.state.warmups.set("glute-bridge", { warmup_exercise_id: "glute-bridge", name: "Glute Bridge", target_regions_json: ["glutes"], equipment_items_slugs: [], is_archived: false });
  db.state.media.set("glute-bridge", { warmup_exercise_id: "glute-bridge", still_image_key: "exercise-media/_placeholder/still.jpg", still_image_is_placeholder: true, video_status: "none" });
  await withServer(db, {}, async (base) => {
    assert.equal((await fetch(`${base}/admin/warmup-exercises/list`)).status, 401);
    const ok = await fetch(`${base}/admin/warmup-exercises/list`, { headers: headers() });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(body.warmupExercises[0].warmupExerciseId, "glute-bridge");
  });
});

test("create, patch, archive, still upload, and video upload mutate rows and audit", async () => {
  process.env.INTERNAL_API_TOKEN = TOKEN;
  const db = createDb();
  const audits = [];
  await withServer(db, {
    putObjectFn: async (key) => key,
    auditLogFn: async (_req, entry) => audits.push(entry),
    compressExerciseVideoFn: async () => ({ compressedBuffer: Buffer.from("mp4"), posterBuffer: Buffer.from("jpg"), durationSec: 1.5 }),
  }, async (base) => {
    const created = await fetch(`${base}/admin/warmup-exercises`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: "Glute Bridge", targetRegions: ["glutes"], equipmentItemsSlugs: [], cueText: "Squeeze", durationOrRepsLabel: "10 reps", rounds: 1 }),
    });
    assert.equal(created.status, 200);
    assert.equal(db.state.warmups.has("glute-bridge"), true);
    assert.equal(db.state.media.get("glute-bridge").still_image_key, "exercise-media/_placeholder/still.jpg");

    const patched = await fetch(`${base}/admin/warmup-exercises/glute-bridge`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ name: "Bridge", targetRegions: ["glutes"], equipmentItemsSlugs: [], cueText: "Pause", durationOrRepsLabel: "12 reps", rounds: 2 }),
    });
    assert.equal(patched.status, 200);
    assert.equal(db.state.warmups.get("glute-bridge").rounds, 2);

    assert.equal((await fetch(`${base}/admin/warmup-exercises/unknown`, { method: "PATCH", headers: headers(), body: "{}" })).status, 404);

    const archived = await fetch(`${base}/admin/warmup-exercises/glute-bridge`, { method: "DELETE", headers: headers() });
    assert.equal(archived.status, 200);
    assert.equal(db.state.warmups.get("glute-bridge").is_archived, true);

    const still = await fetch(`${base}/admin/warmup-exercises/glute-bridge/still`, {
      method: "POST",
      headers: { "X-Internal-Token": TOKEN },
      body: form("still", new Blob(["jpg"], { type: "image/jpeg" }), "still.jpg"),
    });
    assert.equal(still.status, 200);
    assert.equal(db.state.media.get("glute-bridge").still_image_key, "warmup-exercise-media/glute-bridge/still.jpg");

    const video = await fetch(`${base}/admin/warmup-exercises/glute-bridge/video`, {
      method: "POST",
      headers: { "X-Internal-Token": TOKEN },
      body: form("video", new Blob(["mp4"], { type: "video/mp4" }), "demo.mp4"),
    });
    assert.equal(video.status, 200);
    assert.equal(db.state.media.get("glute-bridge").video_status, "ready");
  });

  assert.deepEqual(audits.map((entry) => entry.entity), [
    "warmup_exercise",
    "warmup_exercise",
    "warmup_exercise",
    "warmup_exercise",
    "warmup_exercise",
  ]);
});
