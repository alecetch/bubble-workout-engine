import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";
import { pool } from "../src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  "../data/export_All-EquipmentItems-modified_2026-02-25_21-18-14.csv",
);

const UPSERT_SQL = `
INSERT INTO equipment_items (
  bubble_id,
  category,
  name,
  exercise_slug,
  slug,
  creator,
  commercial_gym,
  crossfit_hyrox_gym,
  decent_home_gym,
  minimal_equipment,
  no_equipment,
  created_at,
  updated_at,
  raw_json
)
VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13::timestamptz,$14::jsonb
)
ON CONFLICT (bubble_id)
DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  exercise_slug = EXCLUDED.exercise_slug,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  commercial_gym = EXCLUDED.commercial_gym,
  crossfit_hyrox_gym = EXCLUDED.crossfit_hyrox_gym,
  decent_home_gym = EXCLUDED.decent_home_gym,
  minimal_equipment = EXCLUDED.minimal_equipment,
  no_equipment = EXCLUDED.no_equipment,
  created_at = COALESCE(equipment_items.created_at, EXCLUDED.created_at),
  updated_at = CASE
    WHEN equipment_items.updated_at IS NULL THEN EXCLUDED.updated_at
    WHEN EXCLUDED.updated_at IS NULL THEN equipment_items.updated_at
    ELSE GREATEST(equipment_items.updated_at, EXCLUDED.updated_at)
  END,
  raw_json = EXCLUDED.raw_json
RETURNING (xmax = 0) AS inserted;
`;

function normalizeHeader(header: string): string {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
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

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};

    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = (cols[c] ?? "").trim();
    }

    rows.push(row);
  }

  return rows;
}

function toNullableText(value: string | undefined): string | null {
  const t = String(value || "").trim();
  return t === "" ? null : t;
}

function toBool(value: string | undefined): boolean {
  const t = String(value || "").trim().toLowerCase();
  return t === "yes";
}

function parseBubbleTimestamp(value: string | undefined, bubbleId: string, fieldName: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dt = DateTime.fromFormat(raw, "LLL d, yyyy h:mm a", { zone: "utc" });
  if (!dt.isValid) {
    console.warn(
      JSON.stringify({
        event: "equipment_items.bad_timestamp",
        bubble_id: bubbleId,
        field: fieldName,
        value: raw,
      }),
    );
    return null;
  }

  return dt.toISO();
}

type EquipmentRow = {
  bubble_id: string;
  category: string | null;
  name: string;
  exercise_slug: string;
  slug: string | null;
  creator: string | null;
  commercial_gym: boolean;
  crossfit_hyrox_gym: boolean;
  decent_home_gym: boolean;
  minimal_equipment: boolean;
  no_equipment: boolean;
  created_at: string | null;
  updated_at: string | null;
  raw_json: Record<string, string>;
};

function mapRow(row: Record<string, string>): EquipmentRow {
  const bubble_id = String(row.unique_id || "").trim();
  const name = String(row.name || "").trim();
  const exercise_slug = String(row.exercise_slug || "").trim();

  if (!bubble_id) {
    throw new Error("Missing unique id");
  }
  if (!name) {
    throw new Error(`Missing name for bubble_id=${bubble_id}`);
  }
  if (!exercise_slug) {
    throw new Error(`Missing exercise_slug for bubble_id=${bubble_id}`);
  }

  return {
    bubble_id,
    category: toNullableText(row.category),
    name,
    exercise_slug,
    slug: toNullableText(row.slug),
    creator: toNullableText(row.creator),
    commercial_gym: toBool(row.commercial_gym),
    crossfit_hyrox_gym: toBool(row.crossfit_hyrox_gym),
    decent_home_gym: toBool(row.decent_home_gym),
    minimal_equipment: toBool(row.minimal_equipment),
    no_equipment: toBool(row.no_equipment),
    created_at: parseBubbleTimestamp(row.creation_date, bubble_id, "creation_date"),
    updated_at: parseBubbleTimestamp(row.modified_date, bubble_id, "modified_date"),
    raw_json: row,
  };
}

async function main(): Promise<void> {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV_PATH;
  const csv = await fs.readFile(csvPath, "utf8");
  const rawRows = parseCsv(csv);

  const rowsRead = rawRows.length;
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  if (!rowsRead) {
    throw new Error(`No rows found in CSV: ${csvPath}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (let i = 0; i < rawRows.length; i += 1) {
      const raw = rawRows[i];
      const fallbackBubbleId = String(raw.unique_id || "").trim() || `row_${i + 1}`;

      await client.query("SAVEPOINT equipment_row_savepoint");
      try {
        const row = mapRow(raw);
        const params = [
          row.bubble_id,
          row.category,
          row.name,
          row.exercise_slug,
          row.slug,
          row.creator,
          row.commercial_gym,
          row.crossfit_hyrox_gym,
          row.decent_home_gym,
          row.minimal_equipment,
          row.no_equipment,
          row.created_at,
          row.updated_at,
          JSON.stringify(row.raw_json),
        ];

        const result = await client.query(UPSERT_SQL, params);
        if (result.rows[0]?.inserted) inserted += 1;
        else updated += 1;

        await client.query("RELEASE SAVEPOINT equipment_row_savepoint");
      } catch (err: any) {
        failed += 1;
        await client.query("ROLLBACK TO SAVEPOINT equipment_row_savepoint");
        await client.query("RELEASE SAVEPOINT equipment_row_savepoint");

        console.error(
          JSON.stringify({
            event: "equipment_items.row_failed",
            bubble_id: fallbackBubbleId,
            error: err?.message || String(err),
          }),
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(
    JSON.stringify({
      event: "equipment_items.import_complete",
      rows_read: rowsRead,
      inserted,
      updated,
      failed,
    }),
  );
}

main().catch((err: any) => {
  console.error(
    JSON.stringify({
      event: "equipment_items.import_failed",
      error: err?.message || String(err),
    }),
  );
  process.exitCode = 1;
});
