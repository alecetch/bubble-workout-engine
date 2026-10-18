import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { thumbHashToRGBA } from "thumbhash";
import { generateRenditions, storeImageRenditions, stillThumbKey, stillCardKey, posterCardKey, heroCardKey } from "../imageRenditions.js";

function image(width, height) { return sharp({ create: { width, height, channels: 3, background: "#6a98b2" } }).png().toBuffer(); }

test("photographic gradient with noise produces small WebP still renditions and a decodable thumbhash", async () => {
  const width = 1264, height = 720;
  const raw = Buffer.alloc(width * height * 3);
  let seed = 1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    raw[(y * width + x) * 3 + c] = Math.round(40 + 120 * x / width + 50 * y / height + (seed % 17) - 8);
  }
  const source = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
  const result = await generateRenditions(source, "still");
  assert.equal(result.renditions[0].height, 168);
  assert.equal(result.renditions[1].width, 1080);
  assert.ok(result.renditions[0].buffer.length < 15_000);
  assert.ok(result.renditions[1].buffer.length < 80_000);
  for (const output of result.renditions) {
    assert.equal(output.buffer.toString("ascii", 0, 4), "RIFF");
    assert.equal(output.buffer.toString("ascii", 8, 12), "WEBP");
  }
  const decoded = thumbHashToRGBA(Buffer.from(result.thumbhash, "base64"));
  assert.ok(decoded.w > 0 && decoded.h > 0 && decoded.rgba.length > 0);
});

test("small stills are not enlarged; portrait and landscape heroes produce 1080x720", async () => {
  const small = await generateRenditions(await image(600, 400), "still");
  assert.equal(small.renditions[1].width, 600);
  assert.equal(small.renditions[1].height, 400);
  for (const [width, height] of [[1024, 1536], [2000, 1000]]) {
    const result = await generateRenditions(await image(width, height), "hero");
    assert.equal(result.renditions[0].width, 1080);
    assert.equal(result.renditions[0].height, 720);
  }
  const poster = await generateRenditions(await image(600, 400), "poster");
  assert.equal(poster.renditions.length, 1);
  assert.equal(poster.thumbhash, null);
  await assert.rejects(generateRenditions(Buffer.from("garbage"), "still"));
});

test("keys are deterministic and legacy heroes have no card key", () => {
  assert.equal(stillThumbKey("exercise-media/a/still.jpg"), "exercise-media/a/still-thumb.webp");
  assert.equal(stillCardKey("warmup-exercise-media/a/still.jpg"), "warmup-exercise-media/a/still-card.webp");
  assert.equal(posterCardKey("a/poster.jpg"), "a/poster-card.webp");
  assert.equal(heroCardKey("hero-media/program_day/a.png"), "hero-media/program_day/a-card.webp");
  assert.equal(heroCardKey("program/a.png"), null);
});

test("generation failure clears stale readiness, logs the event, and is nonfatal", async () => {
  const queries = [], logs = [];
  const result = await storeImageRenditions({
    db: { query: async sql => { queries.push(sql); return { rows: [] }; } }, table: "exercise_media", idColumn: "exercise_id", id: "a", kind: "still", key: "a/still.jpg",
    generateRenditionsFn: async () => { throw new Error("broken encoder"); },
    putObjectFn: async () => assert.fail("No derived file should be stored"), log: { warn: entry => logs.push(entry) },
  });
  assert.equal(result, null);
  assert.match(queries[0], /still_renditions_at = NULL, still_thumbhash = NULL/);
  assert.equal(logs[0].event, "media.renditions.failed");
});
