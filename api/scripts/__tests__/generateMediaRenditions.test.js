import test from "node:test";
import assert from "node:assert/strict";
import { selectRenditionRow, shouldSkipRenditions, generateMediaRenditions } from "../generateMediaRenditions.mjs";

test("selection excludes placeholders, non-ready posters and legacy heroes", () => {
  assert.equal(selectRenditionRow({ still_image_is_placeholder: true, still_image_key: "a/still.jpg" }, "still"), false);
  assert.equal(selectRenditionRow({ still_image_is_placeholder: false, still_image_key: "a/still.jpg" }, "still"), true);
  assert.equal(selectRenditionRow({ video_status: "none", poster_frame_key: "a/poster.jpg" }, "poster"), false);
  assert.equal(selectRenditionRow({ image_key: "program/a.png" }, "hero"), false);
  assert.equal(selectRenditionRow({ image_key: "hero-media/program/a.png" }, "hero"), true);
  const row = { still_image_is_placeholder: false, still_image_key: "a/still.jpg", still_renditions_at: "now" };
  assert.equal(shouldSkipRenditions(row, "still"), true);
  assert.equal(shouldSkipRenditions(row, "still", true), false);
});

test("dry-run generates and reports bytes without any write", async () => {
  const report = await generateMediaRenditions({
    db: { query: async sql => { assert.match(sql, /^SELECT/); return { rows: sql.includes("FROM exercise_media") ? [{ exercise_id: "a", still_image_is_placeholder: false, still_image_key: "exercise-media/a/still.jpg" }] : [] }; } },
    getObjectFn: async key => { assert.equal(key, "a/still.jpg"); return Buffer.from("source"); },
    generateRenditionsFn: async () => ({ renditions: [{ buffer: Buffer.from("webp") }] }),
    putObjectFn: async () => assert.fail("Dry-run wrote storage"), storeImageRenditionsFn: async () => assert.fail("Dry-run wrote DB"),
  }, { dryRun: true, kind: "still" });
  assert.equal(report[0].status, "dry_run");
  assert.equal(report[0].sourceBytes, 6);
  assert.equal(report[0].renditionBytes, 4);
});
