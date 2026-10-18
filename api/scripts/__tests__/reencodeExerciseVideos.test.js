import test from "node:test";
import assert from "node:assert/strict";
import { chooseInput, shouldSkip, backupKey, parseOptions, reencodeExerciseVideos } from "../reencodeExerciseVideos.mjs";

test("backfill prefers original input and names backups alongside videos", () => {
  assert.equal(chooseInput({ video_key: "a/video.mp4", video_source_key: "a/source.mov" }), "a/source.mov");
  assert.equal(chooseInput({ video_key: "a/video.mp4" }), "a/video.mp4");
  assert.equal(backupKey("exercise-media/a/video.mp4"), "exercise-media/a/video.pre-540p.mp4");
});

test("skip requires bounded dimensions and a known bitrate at or below the threshold", () => {
  const valid = { width: 960, height: 540, bitRate: 1_300_000 };
  assert.equal(shouldSkip(valid), true);
  for (const override of [{ width: 962 }, { height: 542 }, { bitRate: 1_300_001 }, { bitRate: null }, { bitRate: 0 }, { width: 0 }]) {
    assert.equal(shouldSkip({ ...valid, ...override }), false);
  }
});

test("CLI rejects invalid filters and conflicting dry-run cleanup", () => {
  for (const args of [["--table", "other"], ["--limit", "0"], ["--only"], ["--cleanup-backups", "--dry-run"], ["--unknown"]]) {
    assert.throws(() => parseOptions(args));
  }
  assert.deepEqual(parseOptions(["--only", "a", "--table", "warmup", "--limit", "2", "--dry-run"]), {
    only: "a", table: "warmup", limit: 2, dryRun: true, noBackup: false, cleanupBackups: false,
  });
});

for (const dryRun of [true, false]) {
  test(`backfill ${dryRun ? "dry-run has no writes" : "backs up before overwriting and preserves source/promotion stamps"}`, async () => {
    const writes = [];
    const queries = [];
    const reads = [];
    const original = Buffer.from("current");
    const output = Buffer.from("small");
    const report = await reencodeExerciseVideos({
      db: { query: async (sql, params) => {
        queries.push({ sql, params });
        return { rows: sql.startsWith("SELECT") ? [{ id: "a", video_key: "exercise-media/a/video.mp4", video_source_key: "exercise-media/a/source.mov", poster_frame_key: "exercise-media/a/poster.jpg" }] : [] };
      } },
      bucket: "bucket",
      getObjectFn: async key => { reads.push(key); return key.endsWith("source.mov") ? Buffer.from("source") : original; },
      putObjectFn: async (...args) => { writes.push(args); },
      probeVideoFn: async buffer => ({ width: buffer === original ? 1280 : 960, height: 540, bitRate: 200_000 }),
      compressExerciseVideoFn: async buffer => { assert.equal(buffer.toString(), "source"); return { compressedBuffer: output, posterBuffer: Buffer.from("poster"), durationSec: 8 }; },
    }, { dryRun, table: "exercise" });
    assert.equal(report[0].status, dryRun ? "dry_run" : "encoded");
    assert.deepEqual(reads, ["a/video.mp4", "a/source.mov"]);
    assert.equal(writes.length, dryRun ? 0 : 3);
    if (!dryRun) {
      assert.deepEqual(writes.map(call => call[0]), ["a/video.pre-540p.mp4", "a/video.mp4", "a/poster.jpg"]);
      assert.equal(writes[0][1], original);
      const update = queries.find(query => query.sql.startsWith("UPDATE"));
      assert.doesNotMatch(update.sql, /promoted_|video_source_key/);
    } else assert.equal(queries.length, 1);
  });
}

test("one failed row does not prevent processing later rows", async () => {
  const report = await reencodeExerciseVideos({
    db: { query: async () => ({ rows: [{ id: "bad", video_key: "bad/video.mp4" }, { id: "ok", video_key: "ok/video.mp4" }] }) },
    getObjectFn: async key => { if (key.startsWith("bad/")) throw new Error("missing"); return Buffer.from("ok"); },
    probeVideoFn: async () => ({ width: 960, height: 540, bitRate: 100_000 }),
  }, { table: "exercise" });
  assert.deepEqual(report.map(row => row.status), ["failed", "skipped"]);
});

test("backup cleanup finds orphaned backups without needing DB rows and respects library filters", async () => {
  const deleted = [];
  const report = await reencodeExerciseVideos({
    db: { query: async () => assert.fail("Backup cleanup must not depend on surviving DB rows") },
    listBackupKeysFn: async () => ["orphan/video.pre-540p.mp4", "warmup-exercise-media/a/video.pre-540p.mp4", "cooldown-exercise-media/b/video.pre-540p.mp4", "a/source.mp4"],
    deleteObjectFn: async key => { deleted.push(key); },
  }, { cleanupBackups: true });
  assert.equal(report.length, 3);
  assert.deepEqual(deleted, ["orphan/video.pre-540p.mp4", "warmup-exercise-media/a/video.pre-540p.mp4", "cooldown-exercise-media/b/video.pre-540p.mp4"]);
  const filtered = [];
  await reencodeExerciseVideos({
    listBackupKeysFn: async () => deleted,
    deleteObjectFn: async key => { filtered.push(key); },
  }, { cleanupBackups: true, table: "warmup", only: "a" });
  assert.deepEqual(filtered, ["warmup-exercise-media/a/video.pre-540p.mp4"]);
});
