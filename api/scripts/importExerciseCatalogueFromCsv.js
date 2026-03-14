// api/scripts/importExerciseCatalogueFromCsv.js
// Imports Bubble ExerciseCatalogue CSV into Postgres exercise_catalogue with transactional upsert.
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  "../data/export_All-ExerciseCatalogues-modified_2026-02-24_17-09-21.csv",
);

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = (cols[c] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

function firstNonEmpty(row, aliases) {
  for (const a of aliases) {
    const v = row[normalizeHeader(a)];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function toNullableText(v) {
  const t = String(v || "").trim();
  return t === "" ? null : t;
}

function toInt(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v, fallback = false) {
  const t = String(v ?? "").trim().toLowerCase();
  if (["true", "t", "1", "yes", "y"].includes(t)) return true;
  if (["false", "f", "0", "no", "n"].includes(t)) return false;
  return fallback;
}

function parseSlugsCsvToArray(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return [];

  const parts = raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(parts)];
}

function parseJsonArray(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseNullableTimestamp(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function mapRow(row) {
  const exercise_id = firstNonEmpty(row, ["exercise_id"]);
  const name = firstNonEmpty(row, ["name"]);
  const movement_class = firstNonEmpty(row, ["movement_class"]);
  const movement_pattern_primary = firstNonEmpty(row, ["movement_pattern_primary"]);

  if (!exercise_id) {
    throw new Error("Missing required exercise_id in CSV row");
  }
  if (!name) {
    throw new Error(`Missing required name for exercise_id=${exercise_id}`);
  }
  if (!movement_class) {
    throw new Error(`Missing required movement_class for exercise_id=${exercise_id}`);
  }
  if (!movement_pattern_primary) {
    throw new Error(`Missing required movement_pattern_primary for exercise_id=${exercise_id}`);
  }

  return {
    exercise_id,
    name,
    movement_class,
    movement_pattern_primary,
    min_fitness_rank: Math.max(0, toInt(firstNonEmpty(row, ["min_fitness_rank"]), 0)),
    is_archived: toBool(firstNonEmpty(row, ["is_archived"]), false),
    is_loadable: toBool(firstNonEmpty(row, ["is_loadable"]), false),

    complexity_rank: toInt(firstNonEmpty(row, ["complexity_rank"]), 0),
    contraindications_json: parseJsonArray(firstNonEmpty(row, ["contraindications_json"])),
    contraindications_slugs: parseSlugsCsvToArray(firstNonEmpty(row, ["contraindications_slugs_csv"])),
    density_rating: toInt(firstNonEmpty(row, ["density_rating"]), 0),
    engine_anchor: toBool(firstNonEmpty(row, ["engine_anchor"]), false),
    engine_role: toNullableText(firstNonEmpty(row, ["engine_role"])),
    equipment_items_slugs: parseSlugsCsvToArray(firstNonEmpty(row, ["equipment_items_slugs_csv"])),
    equipment_json: parseJsonArray(firstNonEmpty(row, ["equipment_json"])),
    form_cues: toNullableText(firstNonEmpty(row, ["form_cues"])),
    impact_level: toInt(firstNonEmpty(row, ["impact_level"]), 0),
    lift_class: toNullableText(firstNonEmpty(row, ["lift_class"])),
    preferred_in_json: parseJsonArray(firstNonEmpty(row, ["preferred_in_json"])),
    swap_group_id_1: toNullableText(firstNonEmpty(row, ["swap_group_id_1"])),
    swap_group_id_2: toNullableText(firstNonEmpty(row, ["swap_group_id_2"])),
    target_regions_json: parseJsonArray(firstNonEmpty(row, ["target_regions_json"])),
    warmup_hooks: parseJsonArray(firstNonEmpty(row, ["warmup_hooks"])),
    slug: toNullableText(firstNonEmpty(row, ["slug"])),
    creator: toNullableText(firstNonEmpty(row, ["creator"])),
  };
}

const UPSERT_SQL = `
INSERT INTO exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  updated_at
)
VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::text[],$11,$12,$13,$14::text[],$15::jsonb,$16,$17,$18,$19::jsonb,$20,$21,$22::jsonb,$23::jsonb,$24,$25,now()
)
ON CONFLICT (exercise_id)
DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  updated_at = now()
RETURNING (xmax = 0) AS inserted;
`;

async function run() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV_PATH;
  const content = await fs.readFile(csvPath, "utf8");
  const rawRows = parseCsv(content);

  if (!rawRows.length) {
    throw new Error(`CSV is empty: ${csvPath}`);
  }

  const records = rawRows.map(mapRow);

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query("BEGIN");

    for (const r of records) {
      const params = [
        r.exercise_id,
        r.name,
        r.movement_class,
        r.movement_pattern_primary,
        r.min_fitness_rank,
        r.is_archived,
        r.is_loadable,
        r.complexity_rank,
        JSON.stringify(r.contraindications_json),
        r.contraindications_slugs,
        r.density_rating,
        r.engine_anchor,
        r.engine_role,
        r.equipment_items_slugs,
        JSON.stringify(r.equipment_json),
        r.form_cues,
        r.impact_level,
        r.lift_class,
        JSON.stringify(r.preferred_in_json),
        r.swap_group_id_1,
        r.swap_group_id_2,
        JSON.stringify(r.target_regions_json),
        JSON.stringify(r.warmup_hooks),
        r.slug,
        r.creator,
      ];

      const result = await client.query(UPSERT_SQL, params);
      if (result.rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    await client.query("COMMIT");
    console.log(`exercise_catalogue import complete. inserted=${inserted} updated=${updated} total=${records.length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("exercise_catalogue import failed:", err.message || err);
  process.exitCode = 1;
});