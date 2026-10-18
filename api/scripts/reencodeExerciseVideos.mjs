import { pathToFileURL } from "node:url";
import { exerciseMediaObjectKey } from "../src/utils/exerciseMediaObjectKey.js";
import { TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT } from "../src/services/exerciseMediaCompression.js";

const TABLES = {
  exercise: ["exercise_media", "exercise_id"],
  warmup: ["warmup_exercise_media", "warmup_exercise_id"],
  cooldown: ["cooldown_exercise_media", "cooldown_exercise_id"],
};

export function chooseInput(row) {
  return row.video_source_key || row.video_key;
}

export function shouldSkip(probe) {
  return probe.width > 0 && probe.width <= TARGET_MAX_WIDTH && probe.height > 0 && probe.height <= TARGET_MAX_HEIGHT
    && Number.isFinite(probe.bitRate) && probe.bitRate > 0 && probe.bitRate <= 1_300_000;
}

export function backupKey(videoKey) {
  if (!String(videoKey).endsWith(".mp4")) throw new Error("Expected an MP4 video key");
  return videoKey.replace(/\.mp4$/, ".pre-540p.mp4");
}

export function parseOptions(args) {
  const options = { dryRun: false, noBackup: false, cleanupBackups: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-backup") options.noBackup = true;
    else if (arg === "--cleanup-backups") options.cleanupBackups = true;
    else if (["--only", "--table", "--limit"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--only") options.only = value;
      if (arg === "--table") {
        if (!TABLES[value]) throw new Error("--table must be exercise, warmup or cooldown");
        options.table = value;
      }
      if (arg === "--limit") {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error("--limit must be a positive integer");
        options.limit = Number(value);
      }
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.cleanupBackups && options.dryRun) throw new Error("--cleanup-backups cannot be combined with --dry-run");
  return options;
}

export async function reencodeExerciseVideos({ db, bucket, getObjectFn, putObjectFn, deleteObjectFn, listBackupKeysFn, probeVideoFn, compressExerciseVideoFn }, options = {}) {
  const report = [];
  if (options.cleanupBackups) {
    // List storage rather than DB rows: deleted exercises can leave backups
    // behind, and cleanup must find those too.
    const keys = await listBackupKeysFn(bucket);
    for (const key of keys) {
      const match = /^(?:(warmup|cooldown)-exercise-media\/)?([^/]+)\/video\.pre-540p\.mp4$/.exec(key);
      if (!match) continue;
      const kind = match[1] || "exercise";
      const id = match[2];
      if ((options.table && options.table !== kind) || (options.only && options.only !== id)) continue;
      if (report.length >= (options.limit ?? Infinity)) break;
      try {
        await deleteObjectFn(key, bucket);
        report.push({ table: TABLES[kind][0], id, status: "backup_deleted" });
      } catch (error) {
        report.push({ table: TABLES[kind][0], id, status: "failed", error: error.message });
      }
    }
    return report;
  }
  let remaining = options.limit ?? Infinity;
  for (const [kind, [table, idColumn]] of Object.entries(TABLES)) {
    if ((options.table && options.table !== kind) || remaining <= 0) continue;
    const params = [];
    let where = "video_status = 'ready'";
    if (options.only) { params.push(options.only); where += ` AND ${idColumn} = $${params.length}`; }
    let limit = "";
    if (Number.isFinite(remaining)) { params.push(remaining); limit = ` LIMIT $${params.length}`; }
    const { rows } = await db.query(`SELECT ${idColumn} AS id, video_key, video_source_key, poster_frame_key
      FROM ${table} WHERE ${where} ORDER BY ${idColumn}${limit}`, params);
    remaining -= rows.length;
    for (const row of rows) {
      const item = { table, id: row.id, inputType: row.video_source_key ? "source" : "legacy video" };
      try {
        const videoKey = exerciseMediaObjectKey(row.video_key);
        if (!videoKey) throw new Error("Ready row has no video key");
        const current = await getObjectFn(videoKey, bucket);
        const probe = await probeVideoFn(current);
        item.beforeBytes = current.length;
        if (shouldSkip(probe)) {
          report.push({ ...item, status: "skipped", afterBytes: current.length, width: probe.width, height: probe.height, durationSec: probe.durationSec });
          continue;
        }
        const input = row.video_source_key ? await getObjectFn(exerciseMediaObjectKey(chooseInput(row)), bucket) : current;
        const result = await compressExerciseVideoFn(input);
        const outputProbe = await probeVideoFn(result.compressedBuffer);
        if (!options.dryRun) {
          if (!options.noBackup) await putObjectFn(backupKey(videoKey), current, "video/mp4", bucket);
          await putObjectFn(videoKey, result.compressedBuffer, "video/mp4", bucket);
          const posterKey = exerciseMediaObjectKey(row.poster_frame_key || row.video_key.replace(/video\.mp4$/, "poster.jpg"));
          await putObjectFn(posterKey, result.posterBuffer, "image/jpeg", bucket);
          await db.query(`UPDATE ${table} SET video_duration_sec = $2, poster_frame_key = $3 WHERE ${idColumn} = $1`,
            [row.id, result.durationSec, row.poster_frame_key || row.video_key.replace(/video\.mp4$/, "poster.jpg")]);
        }
        report.push({ ...item, status: options.dryRun ? "dry_run" : "encoded", afterBytes: result.compressedBuffer.length,
          width: outputProbe.width, height: outputProbe.height, durationSec: result.durationSec });
      } catch (error) {
        report.push({ ...item, status: "failed", error: error.message });
      }
    }
  }
  return report;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  for (const [target, source] of [["PGUSER", "POSTGRES_USER"], ["PGPASSWORD", "POSTGRES_PASSWORD"], ["PGDATABASE", "POSTGRES_DB"]]) {
    if (process.env[target] === undefined && process.env[source] !== undefined) process.env[target] = process.env[source];
  }
  const { pool } = await import("../src/db.js");
  try {
    const storage = await import("../src/services/s3Service.js");
    const encoding = await import("../src/services/exerciseMediaCompression.js");
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    async function listBackupKeysFn(bucket) {
      const keys = [];
      let token;
      do {
        const page = await storage.getClientForBucket(bucket).send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
        for (const object of page.Contents ?? []) if (object.Key?.endsWith("/video.pre-540p.mp4")) keys.push(object.Key);
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys.sort();
    }
    const report = await reencodeExerciseVideos({ db: pool, bucket: storage.EXERCISE_MEDIA_BUCKET,
      getObjectFn: storage.getObject, putObjectFn: storage.putObject, deleteObjectFn: storage.deleteObject, listBackupKeysFn,
      probeVideoFn: encoding.probeVideo, compressExerciseVideoFn: encoding.compressExerciseVideo }, options);
    console.table(report);
    const counts = report.reduce((result, row) => { result[row.status] = (result[row.status] ?? 0) + 1; return result; }, {});
    console.log(JSON.stringify({ counts, beforeBytes: report.reduce((sum, row) => sum + (row.beforeBytes ?? 0), 0),
      afterBytes: report.reduce((sum, row) => sum + (row.afterBytes ?? 0), 0) }));
    console.log("Rows over 1 MB:");
    console.table(report.filter(row => row.afterBytes > 1_000_000));
    if (report.some(row => row.status === "failed")) process.exitCode = 1;
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Video re-encode failed: ${error.message}`); process.exitCode = 1; });
}
