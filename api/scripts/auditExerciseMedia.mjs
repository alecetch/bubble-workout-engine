import { pathToFileURL } from "node:url";
import { exerciseMediaObjectKey } from "../src/utils/exerciseMediaObjectKey.js";

const MAX_STILL_BYTES = 500 * 1024;
const TABLES = [
  ["exercise_media", "exercise_id"],
  ["warmup_exercise_media", "warmup_exercise_id"],
  ["cooldown_exercise_media", "cooldown_exercise_id"],
];

export function classifyMediaObject({ kind, head, firstBytes }) {
  if (!head) return "missing";
  if (kind !== "still") return "ok";
  if (head.ContentType !== "image/jpeg"
    || firstBytes?.[0] !== 0xff || firstBytes?.[1] !== 0xd8 || firstBytes?.[2] !== 0xff) {
    return "wrong_type";
  }
  return head.ContentLength > MAX_STILL_BYTES ? "oversize" : "ok";
}

function isMissingObjectError(error) {
  return [error?.name, error?.Code, error?.code].some(value => value === "NoSuchKey" || value === "NotFound")
    || error?.$metadata?.httpStatusCode === 404;
}

// Dependencies are supplied by the CLI so importing the classifier never opens
// a database connection or initializes storage clients.
export async function auditExerciseMedia({
  db, bucket, headObjectFn, getObjectStreamFn, getObjectFn, putObjectFn,
  normalizeStillImageFn, readImageMetadataFn, fixStills = false,
}) {
  const report = [];
  for (const [table, idColumn] of TABLES) {
    const { rows } = await db.query(`SELECT ${idColumn} AS id, still_image_key, video_key, poster_frame_key
      FROM ${table}
      WHERE still_image_is_placeholder = false OR video_status = 'ready' OR poster_frame_key IS NOT NULL
      ORDER BY ${idColumn}`);
    for (const row of rows) {
      for (const [kind, storedKey] of [["still", row.still_image_key], ["video", row.video_key], ["poster", row.poster_frame_key]]) {
        if (!storedKey) continue;
        const key = exerciseMediaObjectKey(storedKey);
        let head = null;
        let firstBytes;
        try {
          head = await headObjectFn(key, bucket);
          if (kind === "still" && head) {
            const object = await getObjectStreamFn(key, bucket, "bytes=0-2");
            const chunks = [];
            for await (const chunk of object.Body) chunks.push(Buffer.from(chunk));
            firstBytes = Buffer.concat(chunks);
          }
        } catch (error) {
          if (!isMissingObjectError(error)) throw error;
          head = null;
        }
        let status = classifyMediaObject({ kind, head, firstBytes });
        let repaired = false;
        if (fixStills && kind === "still" && status !== "missing") {
          // Full-image reads (including dimension checks) are opt-in only.
          // An object deleted since HEAD must still be reported as missing.
          let original;
          try {
            original = await getObjectFn(key, bucket);
          } catch (error) {
            if (!isMissingObjectError(error)) throw error;
            status = "missing";
          }
          if (original) {
            if (status === "ok") {
              const metadata = await readImageMetadataFn(original);
              if (metadata.width > 1280 || metadata.height > 1280) status = "oversize";
            }
            if (status === "wrong_type" || status === "oversize") {
              const normalized = await normalizeStillImageFn(original);
              await putObjectFn(key, normalized.buffer, "image/jpeg", bucket);
              await db.query(`UPDATE ${table} SET promoted_still_at = NULL WHERE ${idColumn} = $1 AND still_image_key = $2`,
                [row.id, storedKey]);
              repaired = true;
              status = classifyMediaObject({ kind, head: { ContentType: "image/jpeg", ContentLength: normalized.bytes }, firstBytes: normalized.buffer });
            }
          }
        }
        report.push({ table, id: row.id, kind, key, status, ...(repaired ? { repaired } : {}) });
      }
    }
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--json" && arg !== "--fix-stills")) {
    throw new Error("Usage: node scripts/auditExerciseMedia.mjs [--json] [--fix-stills]");
  }
  // Compose's API startup shell maps POSTGRES_* to PG*. An exec command
  // starts a new process, so support the same configuration here as well.
  for (const [target, source] of [["PGUSER", "POSTGRES_USER"], ["PGPASSWORD", "POSTGRES_PASSWORD"], ["PGDATABASE", "POSTGRES_DB"]]) {
    if (process.env[target] === undefined && process.env[source] !== undefined) process.env[target] = process.env[source];
  }
  const { pool } = await import("../src/db.js");
  try {
    const storage = await import("../src/services/s3Service.js");
    const { normalizeStillImage } = await import("../src/utils/normalizeStillImage.js");
    const { default: sharp } = await import("sharp");
    const report = await auditExerciseMedia({
      db: pool,
      bucket: storage.EXERCISE_MEDIA_BUCKET,
      headObjectFn: storage.headObject,
      getObjectStreamFn: storage.getObjectStream,
      getObjectFn: storage.getObject,
      putObjectFn: storage.putObject,
      normalizeStillImageFn: normalizeStillImage,
      readImageMetadataFn: buffer => sharp(buffer).metadata(),
      fixStills: args.includes("--fix-stills"),
    });
    if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else console.table(report);
    if (report.some(item => item.status === "missing")) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Exercise media audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
