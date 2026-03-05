/**
 * Import Bubble CSV exports into Postgres tables:
 * - program_generation_config
 * - program_rep_rule
 * - narration_template
 *
 * Usage:
 *   PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=... npm run import:bubble
 *   (Uses the same env vars as api/src/db.js)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const BATCH_SIZE = 500;

const IMPORT_SPECS = [
  {
    table: "program_generation_config",
    fileStem: "export_All-ProgramGenerationConfigs-modified_2026-03-01_15-22-30",
  },
  {
    table: "program_rep_rule",
    fileStem: "export_All-program-rep-rules-modified_2026-03-01_15-22-18",
  },
  {
    table: "narration_template",
    fileStem: "export_All-Narration-templates_2026-03-01_15-21-56",
  },
];

const BUBBLE_ONLY_HEADERS = new Set([
  "creation_date",
  "modified_date",
  "created_date",
  "updated_date",
  "created_by",
  "creator",
  "modified_by",
  "slug",
  "unique_id",
  "bubble_unique_id",
  "uid",
  "search",
  "thing",
  "deleted",
]);

function qIdent(identifier) {
  return `"${String(identifier).replace(/"/g, "\"\"")}"`;
}

function normalizeHeader(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeColumns(cols) {
  if (Array.isArray(cols)) {
    return cols.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof cols === "string") {
    return cols
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((v) => v.trim().replace(/^"+|"+$/g, ""))
      .filter(Boolean);
  }
  if (cols && typeof cols === "object" && Array.isArray(cols.columns)) {
    return cols.columns.map((v) => String(v).trim()).filter(Boolean);
  }
  return [];
}

function isProbablyJson(value) {
  const t = String(value ?? "").trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function parseBoolean(raw) {
  const t = String(raw ?? "").trim().toLowerCase();
  if (["true", "t", "1", "yes", "y"].includes(t)) return true;
  if (["false", "f", "0", "no", "n"].includes(t)) return false;
  throw new Error(`invalid boolean "${raw}"`);
}

function parseDateOnly(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) throw new Error(`invalid date "${raw}"`);
  return d.toISOString().slice(0, 10);
}

function parseTimestamp(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) throw new Error(`invalid timestamp "${raw}"`);
  return d.toISOString();
}

function convertCellValue(raw, colMeta) {
  const text = String(raw ?? "");
  const trimmed = text.trim();
  if (!trimmed) return null;

  const udt = colMeta.udt_name;
  const dataType = colMeta.data_type;

  if (udt === "bool" || dataType === "boolean") return parseBoolean(trimmed);

  if (["int2", "int4", "int8"].includes(udt)) {
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) throw new Error(`invalid integer "${raw}"`);
    return n;
  }

  if (["float4", "float8", "numeric"].includes(udt)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new Error(`invalid number "${raw}"`);
    return n;
  }

  if (udt === "json" || udt === "jsonb") {
    if (!isProbablyJson(trimmed)) throw new Error(`invalid json "${raw}"`);
    // Return canonical JSON text so json string primitives stay valid for PG json/jsonb.
    return JSON.stringify(JSON.parse(trimmed));
  }

  if (dataType === "date") return parseDateOnly(trimmed);
  if (dataType.includes("timestamp")) return parseTimestamp(trimmed);

  return text;
}

async function* parseCsvRows(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  let field = "";
  let row = [];
  let inQuotes = false;
  let sawAnyByte = false;

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i += 1) {
      let ch = chunk[i];

      if (!sawAnyByte) {
        sawAnyByte = true;
        if (ch === "\ufeff") continue;
      }

      if (inQuotes) {
        if (ch === "\"") {
          const next = chunk[i + 1];
          if (next === "\"") {
            field += "\"";
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === "\"") {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        yield row;
        row = [];
      } else if (ch === "\r") {
        // ignore CR; LF finalizes rows
      } else {
        field += ch;
      }
    }
  }

  if (inQuotes) {
    throw new Error(`Malformed CSV (unclosed quote): ${filePath}`);
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    yield row;
  }
}

function resolveExportFile(dataDir, fileStem) {
  const entries = fs.readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isFile());
  const exact = entries.find((d) => d.name === fileStem);
  if (exact) return path.join(dataDir, exact.name);

  const withCsv = entries.find((d) => d.name === `${fileStem}.csv`);
  if (withCsv) return path.join(dataDir, withCsv.name);

  const byPrefix = entries.filter((d) => d.name.startsWith(fileStem));
  if (byPrefix.length === 1) return path.join(dataDir, byPrefix[0].name);
  if (byPrefix.length > 1) {
    throw new Error(`Multiple files matched stem "${fileStem}": ${byPrefix.map((d) => d.name).join(", ")}`);
  }

  throw new Error(`File not found for stem "${fileStem}" in ${dataDir}`);
}

async function getTableMeta(client, tableName) {
  const colsRes = await client.query(
    `
      select
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        ordinal_position
      from information_schema.columns
      where table_schema='public'
        and table_name=$1
      order by ordinal_position
    `,
    [tableName],
  );

  if (colsRes.rows.length === 0) {
    throw new Error(`Table not found: public.${tableName}`);
  }

  const pkRes = await client.query(
    `
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
       and tc.table_name = kcu.table_name
      where tc.table_schema='public'
        and tc.table_name=$1
        and tc.constraint_type='PRIMARY KEY'
      order by kcu.ordinal_position
    `,
    [tableName],
  );

  const uniqRes = await client.query(
    `
      select
        tc.constraint_name,
        array_agg(kcu.column_name order by kcu.ordinal_position) as columns
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
       and tc.table_name = kcu.table_name
      where tc.table_schema='public'
        and tc.table_name=$1
        and tc.constraint_type='UNIQUE'
      group by tc.constraint_name
      order by tc.constraint_name
    `,
    [tableName],
  );

  const colByName = new Map(colsRes.rows.map((r) => [r.column_name, r]));
  const normalizedUniques = uniqRes.rows
    .map((r) => ({
      name: String(r.constraint_name),
      columns: normalizeColumns(r.columns),
    }))
    .filter((r) => r.columns.length > 0);

  if (String(process.env.DEBUG_IMPORT || "") === "1") {
    console.log(
      `[${tableName}] unique constraints normalized: ${normalizedUniques
        .map((u) => `${u.name}(${u.columns.join(",")})`)
        .join("; ") || "(none)"}`,
    );
  }

  return {
    columns: colsRes.rows,
    colByName,
    primaryKey: pkRes.rows.map((r) => r.column_name),
    uniqueConstraints: normalizedUniques,
  };
}

function chooseConflictColumns(meta, mappedColumns) {
  const mapped = new Set(mappedColumns);
  const pk = meta.primaryKey;
  if (pk.length > 0 && pk.every((c) => mapped.has(c))) {
    return { kind: "primary_key", columns: pk };
  }

  for (const uq of meta.uniqueConstraints) {
    if (uq.columns.length > 0 && uq.columns.every((c) => mapped.has(c))) {
      return { kind: `unique:${uq.name}`, columns: uq.columns };
    }
  }

  return null;
}

function buildInsertSql({ tableName, columns, rowCount, conflict }) {
  const quotedCols = columns.map(qIdent).join(", ");
  const valuesParts = [];
  let param = 1;
  for (let r = 0; r < rowCount; r += 1) {
    const params = [];
    for (let c = 0; c < columns.length; c += 1) {
      params.push(`$${param}`);
      param += 1;
    }
    valuesParts.push(`(${params.join(", ")})`);
  }

  let sql = `insert into ${qIdent(tableName)} (${quotedCols}) values ${valuesParts.join(", ")}`;

  if (conflict && conflict.columns.length > 0) {
    const conflictCols = conflict.columns.map(qIdent).join(", ");
    const updateCols = columns.filter((c) => !conflict.columns.includes(c));
    if (updateCols.length === 0) {
      sql += ` on conflict (${conflictCols}) do nothing`;
      sql += " returning false as inserted";
      return sql;
    }

    const updates = updateCols.map((c) => `${qIdent(c)} = excluded.${qIdent(c)}`).join(", ");
    sql += ` on conflict (${conflictCols}) do update set ${updates}`;
    sql += " returning (xmax = 0) as inserted";
    return sql;
  }

  sql += " returning true as inserted";
  return sql;
}

async function runBatchInsert({ client, tableName, columns, rows, conflict, counters }) {
  if (rows.length === 0) return;

  const flatValues = rows.flat();
  const sql = buildInsertSql({
    tableName,
    columns,
    rowCount: rows.length,
    conflict,
  });

  const res = await client.query(sql, flatValues);
  const returned = res.rows ?? [];

  if (conflict && conflict.columns.length > 0) {
    let inserted = 0;
    for (const row of returned) {
      if (row.inserted === true) inserted += 1;
    }
    counters.inserted += inserted;
    counters.updated += returned.length - inserted;
    counters.skipped += rows.length - returned.length;
    return;
  }

  counters.inserted += returned.length;
  counters.skipped += rows.length - returned.length;
}

async function importOneTable(client, spec) {
  const filePath = resolveExportFile(DATA_DIR, spec.fileStem);
  const detectedExt = path.extname(filePath) || "(none)";
  console.log(`\n[${spec.table}] source file: ${path.basename(filePath)} (ext: ${detectedExt})`);

  const meta = await getTableMeta(client, spec.table);
  console.log(
    `[${spec.table}] columns=${meta.columns.length}, pk=${meta.primaryKey.join(",") || "none"}, unique=${meta.uniqueConstraints.length}`,
  );

  const counters = {
    readRows: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  let headerSeen = false;
  let mappedIndexes = [];
  let mappedColumns = [];
  let conflict = null;
  let batch = [];

  try {
    await client.query("begin");

    for await (const row of parseCsvRows(filePath)) {
      if (!headerSeen) {
        headerSeen = true;
        const normalized = row.map(normalizeHeader);
        const mapped = [];

        for (let i = 0; i < normalized.length; i += 1) {
          const header = normalized[i];
          if (!header) continue;
          if (BUBBLE_ONLY_HEADERS.has(header)) continue;
          if (!meta.colByName.has(header)) continue;
          mapped.push({ index: i, column: header });
        }

        if (mapped.length === 0) {
          throw new Error(
            `0 mapped columns for ${spec.table}. CSV headers did not match table columns (after dropping Bubble meta fields).`,
          );
        }

        mappedIndexes = mapped.map((m) => m.index);
        mappedColumns = mapped.map((m) => m.column);
        conflict = chooseConflictColumns(meta, mappedColumns);

        console.log(`[${spec.table}] mapped columns: ${mappedColumns.join(", ")}`);
        if (conflict) {
          console.log(`[${spec.table}] upsert strategy: ${conflict.kind} (${conflict.columns.join(", ")})`);
        } else {
          console.log(`[${spec.table}] upsert strategy: none (insert-only)`);
        }
        continue;
      }

      counters.readRows += 1;

      try {
        const values = [];
        let allNull = true;

        for (let i = 0; i < mappedIndexes.length; i += 1) {
          const idx = mappedIndexes[i];
          const col = mappedColumns[i];
          const colMeta = meta.colByName.get(col);
          const raw = idx < row.length ? row[idx] : "";
          const converted = convertCellValue(raw, colMeta);
          if (converted !== null) allNull = false;
          values.push(converted);
        }

        if (allNull) {
          counters.skipped += 1;
          continue;
        }

        batch.push(values);

        if (batch.length >= BATCH_SIZE) {
          await runBatchInsert({
            client,
            tableName: spec.table,
            columns: mappedColumns,
            rows: batch,
            conflict,
            counters,
          });
          batch = [];
        }
      } catch (rowErr) {
        counters.errors += 1;
        console.error(`[${spec.table}] row ${counters.readRows} skipped: ${rowErr.message}`);
      }
    }

    if (!headerSeen) {
      throw new Error(`CSV appears empty: ${filePath}`);
    }

    if (batch.length > 0) {
      await runBatchInsert({
        client,
        tableName: spec.table,
        columns: mappedColumns,
        rows: batch,
        conflict,
        counters,
      });
    }

    await client.query("commit");
    console.log(
      `[${spec.table}] read=${counters.readRows} inserted=${counters.inserted} updated=${counters.updated} skipped=${counters.skipped} errors=${counters.errors}`,
    );
  } catch (err) {
    await client.query("rollback");
    throw new Error(`[${spec.table}] import failed: ${err.message}`);
  }

  return counters;
}

async function validateTable(client, tableName) {
  const countRes = await client.query(`select count(*)::int as count from ${qIdent(tableName)}`);
  const count = countRes.rows[0]?.count ?? 0;
  console.log(`[validate] ${tableName} count=${count}`);

  const sampleRes = await client.query(`select * from ${qIdent(tableName)} order by 1 limit 3`);
  const sample = sampleRes.rows ?? [];
  if (sample.length === 0) {
    console.log(`[validate] ${tableName} sample: (no rows)`);
    return;
  }

  const keys = Object.keys(sample[0]);
  console.log(`[validate] ${tableName} sample keys: ${keys.join(", ")}`);
}

async function main() {
  const client = await pool.connect();
  try {
    for (const spec of IMPORT_SPECS) {
      await importOneTable(client, spec);
    }

    for (const spec of IMPORT_SPECS) {
      await validateTable(client, spec.table);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
