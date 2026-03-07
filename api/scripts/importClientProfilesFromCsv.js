// api/scripts/importClientProfilesFromCsv.js
// Transactional importer for Bubble Client Profiles CSV -> Postgres client_profile.
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  "../data/export_All-Client-Profiles-modified_2026-02-24_17-39-14.csv",
);

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_/-]/g, "")
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

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
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

function parseArgs(argv) {
  let csvPath = DEFAULT_CSV_PATH;
  let bubbleUserId = "";

  for (const arg of argv) {
    if (arg.startsWith("--bubble-user-id=")) {
      bubbleUserId = arg.split("=").slice(1).join("=").trim();
    } else if (arg.startsWith("--csv=")) {
      csvPath = path.resolve(arg.split("=").slice(1).join("=").trim());
    }
  }

  return { csvPath, bubbleUserId };
}

function looksLikeBubbleId(v) {
  return /^\d+x\d+$/.test(String(v || "").trim());
}

function parseListToSlugs(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const items = raw
    .split(",")
    .map((x) => normalizeSlug(x))
    .filter(Boolean);

  return [...new Set(items)];
}

function parsePreferredDays(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const map = new Map([
    ["mon", "mon"],
    ["monday", "mon"],
    ["tue", "tue"],
    ["tues", "tue"],
    ["tuesday", "tue"],
    ["wed", "wed"],
    ["weds", "wed"],
    ["wednesday", "wed"],
    ["thu", "thu"],
    ["thur", "thu"],
    ["thurs", "thu"],
    ["thursday", "thu"],
    ["fri", "fri"],
    ["friday", "fri"],
    ["sat", "sat"],
    ["saturday", "sat"],
    ["sun", "sun"],
    ["sunday", "sun"],
  ]);

  const out = [];
  for (const token of raw.split(",")) {
    const key = normalizeSlug(token).replace(/_/g, "");
    if (!key) continue;
    const mapped = map.get(key) || map.get(normalizeSlug(token));
    if (mapped) out.push(mapped);
  }

  return [...new Set(out)];
}

function parseInjuryFlags(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (/no\s+known\s+issues/i.test(raw)) return [];
  return parseListToSlugs(raw);
}

function parseFitnessRank(fitnessLevelSlug) {
  switch (fitnessLevelSlug) {
    case "beginner":
      return 0;
    case "intermediate":
      return 1;
    case "advanced":
      return 2;
    case "elite":
      return 3;
    default:
      return 0;
  }
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNumeric(value) {
  const t = String(value || "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toNullableText(value) {
  const t = String(value || "").trim();
  return t ? t : null;
}

function toBool(value) {
  const t = String(value || "").trim().toLowerCase();
  return ["true", "t", "1", "yes", "y"].includes(t);
}

function toTs(value) {
  const t = String(value || "").trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRow(row, cliBubbleUserId) {
  const bubbleClientProfileId = toNullableText(row.unique_id);
  if (!bubbleClientProfileId) {
    throw new Error("Missing unique id (bubble_client_profile_id)");
  }

  const csvUser = toNullableText(row.user);
  const bubbleUserId = cliBubbleUserId || (looksLikeBubbleId(csvUser) ? csvUser : "");
  if (!bubbleUserId) {
    throw new Error(
      `Could not resolve bubble_user_id for bubble_client_profile_id=${bubbleClientProfileId}. Pass --bubble-user-id=<id>`,
    );
  }

  const fitnessLevelSlug = normalizeSlug(row.fitness_level);
  const bodyTypePreferenceSlug = normalizeSlug(row.body_type_preference);
  const equipmentPresetSlug = normalizeSlug(row.equipment_preset);
  const intensityPrefSlug = normalizeSlug(row.program_intensity_preference);
  const themeSlug = normalizeSlug(row.theme);

  return {
    bubble_user_id: bubbleUserId,
    bubble_client_profile_id: bubbleClientProfileId,
    bubble_user_raw: csvUser,

    display_name: "",
    fitness_level_slug: fitnessLevelSlug,
    fitness_rank: parseFitnessRank(fitnessLevelSlug),

    equipment_items_slugs: parseListToSlugs(row.equipment_items_slugs_csv),
    injury_flags: parseInjuryFlags(row.injury_flags),
    preferred_days: parsePreferredDays(row.preferred_days),
    main_goals_slugs: parseListToSlugs(row.main_goals),

    minutes_per_session: Math.max(0, toInt(row.minutes_per_session, 0)),
    height_cm: toNullableText(row.height_cm) ? toInt(row.height_cm, 0) : null,
    weight_kg: toNumeric(row.weight_kg),

    body_type_preference_slug: bodyTypePreferenceSlug || null,
    equipment_items_text: toNullableText(row.equipment_items_text),
    equipment_notes: toNullableText(row.equipment_notes),
    equipment_preset_slug: equipmentPresetSlug || null,
    goal_notes: toNullableText(row.goal_notes),
    ok_with_gymless_backup: toBool(row.ok_with_gymless_backup),
    program_intensity_preference_slug: intensityPrefSlug || null,
    schedule_constraints: toNullableText(row.schedule_constraints),
    theme_slug: themeSlug || null,

    bubble_creation_date: toTs(row.creation_date),
    bubble_modified_date: toTs(row.modified_date),
    slug: toNullableText(row.slug),
    creator: toNullableText(row.creator),
    is_archived: false,
  };
}

async function ensureUser(client, bubbleUserId) {
  const r = await client.query(
    `
    INSERT INTO app_user (bubble_user_id)
    VALUES ($1)
    ON CONFLICT (bubble_user_id)
    DO UPDATE SET updated_at = now()
    RETURNING id
    `,
    [bubbleUserId],
  );
  return r.rows[0].id;
}

const UPSERT_SQL = `
INSERT INTO client_profile (
  user_id,
  bubble_client_profile_id,
  display_name,
  fitness_level_slug,
  fitness_rank,
  equipment_items_slugs,
  injury_flags,
  preferred_days,
  main_goals_slugs,
  minutes_per_session,
  height_cm,
  weight_kg,
  body_type_preference_slug,
  equipment_items_text,
  equipment_notes,
  equipment_preset_slug,
  goal_notes,
  ok_with_gymless_backup,
  program_intensity_preference_slug,
  schedule_constraints,
  theme_slug,
  bubble_creation_date,
  bubble_modified_date,
  slug,
  creator,
  bubble_user_raw,
  is_archived,
  updated_at
)
VALUES (
  $1,$2,$3,$4,$5,$6::text[],$7::text[],$8::text[],$9::text[],$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::timestamptz,$23::timestamptz,$24,$25,$26,$27,now()
)
ON CONFLICT (bubble_client_profile_id)
DO UPDATE SET
  user_id = EXCLUDED.user_id,
  display_name = EXCLUDED.display_name,
  fitness_level_slug = EXCLUDED.fitness_level_slug,
  fitness_rank = EXCLUDED.fitness_rank,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  injury_flags = EXCLUDED.injury_flags,
  preferred_days = EXCLUDED.preferred_days,
  main_goals_slugs = EXCLUDED.main_goals_slugs,
  minutes_per_session = EXCLUDED.minutes_per_session,
  height_cm = EXCLUDED.height_cm,
  weight_kg = EXCLUDED.weight_kg,
  body_type_preference_slug = EXCLUDED.body_type_preference_slug,
  equipment_items_text = EXCLUDED.equipment_items_text,
  equipment_notes = EXCLUDED.equipment_notes,
  equipment_preset_slug = EXCLUDED.equipment_preset_slug,
  goal_notes = EXCLUDED.goal_notes,
  ok_with_gymless_backup = EXCLUDED.ok_with_gymless_backup,
  program_intensity_preference_slug = EXCLUDED.program_intensity_preference_slug,
  schedule_constraints = EXCLUDED.schedule_constraints,
  theme_slug = EXCLUDED.theme_slug,
  bubble_creation_date = EXCLUDED.bubble_creation_date,
  bubble_modified_date = EXCLUDED.bubble_modified_date,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  bubble_user_raw = EXCLUDED.bubble_user_raw,
  is_archived = EXCLUDED.is_archived,
  updated_at = now()
RETURNING (xmax = 0) AS inserted;
`;

async function main() {
  const { csvPath, bubbleUserId: cliBubbleUserId } = parseArgs(process.argv.slice(2));
  const csv = await fs.readFile(csvPath, "utf8");
  const rawRows = parseCsv(csv);

  if (!rawRows.length) {
    throw new Error(`No rows found in CSV: ${csvPath}`);
  }

  const mappedRows = rawRows.map((row) => mapRow(row, cliBubbleUserId));

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query("BEGIN");

    const userIdByBubble = new Map();

    for (const row of mappedRows) {
      if (!userIdByBubble.has(row.bubble_user_id)) {
        const userId = await ensureUser(client, row.bubble_user_id);
        userIdByBubble.set(row.bubble_user_id, userId);
      }

      const userId = userIdByBubble.get(row.bubble_user_id);

      const params = [
        userId,
        row.bubble_client_profile_id,
        row.display_name,
        row.fitness_level_slug,
        row.fitness_rank,
        row.equipment_items_slugs,
        row.injury_flags,
        row.preferred_days,
        row.main_goals_slugs,
        row.minutes_per_session,
        row.height_cm,
        row.weight_kg,
        row.body_type_preference_slug,
        row.equipment_items_text,
        row.equipment_notes,
        row.equipment_preset_slug,
        row.goal_notes,
        row.ok_with_gymless_backup,
        row.program_intensity_preference_slug,
        row.schedule_constraints,
        row.theme_slug,
        row.bubble_creation_date,
        row.bubble_modified_date,
        row.slug,
        row.creator,
        row.bubble_user_raw,
        row.is_archived,
      ];

      const result = await client.query(UPSERT_SQL, params);
      if (result.rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    await client.query("COMMIT");
    console.log(`client_profile import complete. inserted=${inserted} updated=${updated} total=${mappedRows.length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("client_profile import failed:", err.message || err);
  process.exitCode = 1;
});