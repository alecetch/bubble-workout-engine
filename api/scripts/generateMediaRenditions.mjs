import { pathToFileURL } from "node:url";
import { exerciseMediaObjectKey } from "../src/utils/exerciseMediaObjectKey.js";
import { heroCardKey } from "../src/utils/mediaRenditionKeys.js";

export function selectRenditionRow(row, kind) {
  if (kind === "hero") return Boolean(heroCardKey(row.image_key));
  if (kind === "still") return row.still_image_is_placeholder === false && Boolean(row.still_image_key);
  return kind === "poster" && row.video_status === "ready" && Boolean(row.poster_frame_key);
}

export function shouldSkipRenditions(row, kind, force = false) {
  return !selectRenditionRow(row, kind) || (!force && Boolean(row[kind === "hero" ? "renditions_at" : `${kind}_renditions_at`]));
}

export async function generateMediaRenditions({ db, bucket, getObjectFn, putObjectFn, generateRenditionsFn, storeImageRenditionsFn }, options = {}) {
  const report = [];
  for (const [table, idColumn, kinds] of [["exercise_media", "exercise_id", ["still", "poster"]],
    ["warmup_exercise_media", "warmup_exercise_id", ["still", "poster"]], ["cooldown_exercise_media", "cooldown_exercise_id", ["still", "poster"]],
    ["media_assets", "id", ["hero"]]]) {
    const wanted = kinds.filter(kind => !options.kind || kind === options.kind);
    if (!wanted.length) continue;
    const params = options.only ? [options.only] : [];
    const rows = (await db.query(`SELECT * FROM ${table}${options.only ? ` WHERE ${idColumn}::text = $1` : ""} ORDER BY ${idColumn}`, params)).rows;
    for (const row of rows) for (const kind of wanted) {
      if (!selectRenditionRow(row, kind)) continue;
      const item = { table, id: row[idColumn], kind };
      if (shouldSkipRenditions(row, kind, options.force)) { report.push({ ...item, status: "skipped" }); continue; }
      try {
        const key = row[kind === "hero" ? "image_key" : kind === "still" ? "still_image_key" : "poster_frame_key"];
        const buffer = await getObjectFn(exerciseMediaObjectKey(key), bucket);
        const result = options.dryRun ? await generateRenditionsFn(buffer, kind)
          : await storeImageRenditionsFn({ db, table, idColumn, id: row[idColumn], kind, key, buffer, putObjectFn, generateRenditionsFn, throwOnError: true });
        report.push({ ...item, status: options.dryRun ? "dry_run" : "generated", sourceBytes: buffer.length,
          renditionBytes: result.renditions.reduce((sum, rendition) => sum + rendition.buffer.length, 0) });
      } catch (error) { report.push({ ...item, status: "failed", error: error.message }); }
    }
  }
  return report;
}

async function main() {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") options.dryRun = true;
    else if (args[i] === "--force") options.force = true;
    else if (["--only", "--kind"].includes(args[i])) {
      const arg = args[i]; const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--kind" && !["still", "poster", "hero"].includes(value)) throw new Error("Unknown rendition kind");
      options[arg.slice(2)] = value;
    } else throw new Error(`Unknown option: ${args[i]}`);
  }
  for (const [target, source] of [["PGUSER", "POSTGRES_USER"], ["PGPASSWORD", "POSTGRES_PASSWORD"], ["PGDATABASE", "POSTGRES_DB"]]) {
    if (process.env[target] === undefined) process.env[target] = process.env[source];
  }
  const { pool } = await import("../src/db.js");
  try {
    const storage = await import("../src/services/s3Service.js");
    const images = await import("../src/services/imageRenditions.js");
    const report = await generateMediaRenditions({ db: pool, bucket: storage.EXERCISE_MEDIA_BUCKET,
      getObjectFn: storage.getObject, putObjectFn: storage.putObject, generateRenditionsFn: images.generateRenditions,
      storeImageRenditionsFn: images.storeImageRenditions }, options);
    console.table(report);
    const totals = {};
    for (const row of report) {
      const total = totals[row.kind] ??= { generated: 0, skipped: 0, failed: 0, sourceBytes: 0, renditionBytes: 0 };
      if (row.status === "failed") total.failed++;
      else if (row.status === "skipped") total.skipped++;
      else total.generated++;
      total.sourceBytes += row.sourceBytes ?? 0; total.renditionBytes += row.renditionBytes ?? 0;
    }
    console.log(JSON.stringify(totals));
    if (report.some(row => row.status === "failed")) process.exitCode = 1;
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Media rendition backfill failed: ${error.message}`); process.exitCode = 1; });
}
