import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { auditExerciseMedia, classifyMediaObject } from "../auditExerciseMedia.mjs";

const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
const head = { ContentType: "image/jpeg", ContentLength: 100 };

for (const [name, input, expected] of [
  ["valid JPEG", { kind: "still", head, firstBytes: jpeg }, "ok"],
  ["missing", { kind: "still", head: null }, "missing"],
  ["wrong content type", { kind: "still", head: { ...head, ContentType: "image/png" }, firstBytes: jpeg }, "wrong_type"],
  ["PNG bytes labeled JPEG", { kind: "still", head, firstBytes: Buffer.from([0x89, 0x50, 0x4e]) }, "wrong_type"],
  ["large JPEG", { kind: "still", head: { ...head, ContentLength: 500 * 1024 + 1 }, firstBytes: jpeg }, "oversize"],
  ["size boundary", { kind: "still", head: { ...head, ContentLength: 500 * 1024 }, firstBytes: jpeg }, "ok"],
  ["video", { kind: "video", head: { ContentType: "video/mp4", ContentLength: 1000000 } }, "ok"],
  ["poster", { kind: "poster", head: { ContentType: "image/jpeg" } }, "ok"],
]) {
  test(`classifies ${name}`, () => assert.equal(classifyMediaObject(input), expected));
}

test("read-only audit checks all referenced keys across the three libraries without downloading full objects or writing", async () => {
  const queries = [];
  const keys = [];
  const unexpected = async () => assert.fail("Read-only audit must not download full objects or write");
  const report = await auditExerciseMedia({
    db: { query: async sql => {
      queries.push(sql);
      assert.match(sql, /still_image_is_placeholder = false OR video_status = 'ready' OR poster_frame_key IS NOT NULL/);
      return { rows: [{ id: "a", still_image_key: " /exercise-media/a/still.jpg", video_key: "a/video.mp4", poster_frame_key: "a/poster.jpg" }] };
    } },
    bucket: "test-bucket",
    headObjectFn: async (key, bucket) => { keys.push(key); assert.equal(bucket, "test-bucket"); return head; },
    getObjectStreamFn: async (key, bucket, range) => {
      assert.equal(key, "a/still.jpg"); assert.equal(bucket, "test-bucket"); assert.equal(range, "bytes=0-2");
      return { Body: Readable.from([jpeg]) };
    },
    getObjectFn: unexpected, putObjectFn: unexpected, normalizeStillImageFn: unexpected, readImageMetadataFn: unexpected,
  });
  assert.equal(queries.length, 3);
  assert.match(queries[0], /exercise_id AS id/);
  assert.match(queries[1], /warmup_exercise_id AS id/);
  assert.match(queries[2], /cooldown_exercise_id AS id/);
  assert.equal(keys.length, 9);
  assert.equal(report.length, 9);
  assert.ok(report.every(item => item.status === "ok"));
});

test("repair normalizes wrong-type and dimension-oversize stills, resets promotion, and leaves missing objects untouched", async () => {
  const writes = [];
  const updates = [];
  const report = await auditExerciseMedia({
    db: { query: async (sql, params) => {
      if (sql.startsWith("UPDATE")) { updates.push({ sql, params }); return { rows: [] }; }
      if (!sql.includes("FROM exercise_media\n")) return { rows: [] };
      return { rows: ["png", "wide", "missing"].map(id => ({ id, still_image_key: `exercise-media/${id}/still.jpg` })) };
    } },
    bucket: "test-bucket", fixStills: true,
    headObjectFn: async key => {
      if (key.startsWith("missing/")) throw Object.assign(new Error("gone"), { name: "NotFound" });
      return { ...head, ContentType: key.startsWith("png/") ? "image/png" : "image/jpeg" };
    },
    getObjectStreamFn: async () => ({ Body: Readable.from([jpeg]) }),
    getObjectFn: async key => { assert.ok(!key.startsWith("missing/")); return Buffer.from(key); },
    readImageMetadataFn: async () => ({ width: 1600, height: 900 }),
    normalizeStillImageFn: async () => ({ buffer: jpeg, width: 1280, height: 720, bytes: jpeg.length }),
    putObjectFn: async (...args) => { writes.push(args); },
  });
  assert.deepEqual(report.map(item => item.status), ["ok", "ok", "missing"]);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(([, buffer, type, bucket]) => buffer.equals(jpeg) && type === "image/jpeg" && bucket === "test-bucket"));
  assert.deepEqual(updates.map(item => item.params), [["png", "exercise-media/png/still.jpg"], ["wide", "exercise-media/wide/still.jpg"]]);
  assert.ok(updates.every(item => /SET promoted_still_at = NULL/.test(item.sql)));
});

test("storage permission failures are not misreported as missing", async () => {
  await assert.rejects(auditExerciseMedia({
    db: { query: async () => ({ rows: [{ id: "a", still_image_key: "a/still.jpg" }] }) },
    headObjectFn: async () => { throw Object.assign(new Error("denied"), { name: "AccessDenied" }); },
  }), /denied/);
});
