import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const { Client } = createRequire(new URL("../api/package.json", import.meta.url))("pg");

export const CHECKED_TABLES = [
  { name: "app_user", class: "user", nonEmpty: true, timestamps: ["created_at"] },
  { name: "client_profile", class: "user" },
  { name: "program", class: "user", nonEmpty: true },
  { name: "program_day", class: "user" },
  { name: "segment_exercise_log", class: "user", timestamps: ["updated_at", "created_at"] },
  { name: "training_session", class: "user", timestamps: ["local_date"] },
  { name: "year_milestone", class: "user" },
  { name: "notification_preference", class: "user" },
  { name: "referral_conversion", class: "user" },
  { name: "exercise_catalogue", class: "reference", nonEmpty: true },
  { name: "media_assets", class: "reference" },
  { name: "narration_template", class: "reference" },
  { name: "program_rep_rule", class: "reference" },
];
const identifier = value => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Invalid verification table definition");
  return `"${value}"`;
};
export function restoreConnectionConfig(value) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database URL");
  const mode = url.searchParams.get("sslmode");
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  return { connectionString: value, ssl: mode === "disable" ? false : mode || !local ? { rejectUnauthorized: false } : false };
}
async function snapshot(url, tables, onConnected) {
  const client = new Client(restoreConnectionConfig(url));
  client.on("error", () => {}); // Query promises still reject; never expose raw connection errors.
  try {
    await client.connect();
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    await client.query("SET default_transaction_read_only = on");
    await onConnected?.(client);
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = { version: null, tables: [], errors: [] };
    const history = await client.query("SELECT to_regclass('flyway_schema_history') AS relation");
    if (!history.rows[0].relation) result.errors.push("Missing flyway_schema_history");
    else {
      const latest = await client.query("SELECT version FROM flyway_schema_history WHERE success AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1");
      result.version = latest.rows[0]?.version ?? null;
      if (!result.version || !/^\d+(?:\.\d+)*$/.test(result.version)) result.errors.push("Missing or invalid Flyway version");
    }
    for (const table of tables) {
      const name = identifier(table.name);
      const relation = await client.query("SELECT to_regclass($1) AS relation", [name]);
      if (!relation.rows[0].relation) { result.errors.push(`Missing table ${table.name}`); continue; }
      const columns = await client.query("SELECT attname FROM pg_attribute WHERE attrelid=to_regclass($1) AND attnum > 0 AND NOT attisdropped", [name]);
      const timestamp = table.timestamps?.find(column => columns.rows.some(row => row.attname === column));
      const data = await client.query(`SELECT count(*)::text AS count${timestamp ? `, max(${identifier(timestamp)})::text AS latest` : ""} FROM ${name}`);
      result.tables.push({ name: table.name, class: table.class, count: data.rows[0].count, ...(timestamp ? { latest: data.rows[0].latest } : {}) });
      if (table.nonEmpty && data.rows[0].count === "0") result.errors.push(`Empty required table ${table.name}`);
    }
    await client.query("COMMIT");
    return result;
  } finally { await client.end(); }
}
function older(a, b) {
  const left = a.split(".").map(BigInt), right = b.split(".").map(BigInt);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] ?? 0n) !== (right[i] ?? 0n)) return (left[i] ?? 0n) < (right[i] ?? 0n);
  }
  return false;
}
export async function verifyRestore({ targetUrl, referenceUrl, tables = CHECKED_TABLES, onConnected }) {
  const report = { ok: false, target: null, reference: null, errors: [], notes: [] };
  try {
    report.target = await snapshot(targetUrl, tables, onConnected);
    report.errors.push(...report.target.errors.map(error => `Target: ${error}`));
    if (referenceUrl) {
      report.reference = await snapshot(referenceUrl, tables);
      report.errors.push(...report.reference.errors.map(error => `Reference: ${error}`));
      if (report.target.version && report.reference.version && older(report.target.version, report.reference.version)) report.errors.push("Target Flyway version is older than reference");
      for (const target of report.target.tables) {
        const reference = report.reference.tables.find(table => table.name === target.name);
        if (!reference) continue;
        const a = BigInt(target.count), b = BigInt(reference.count);
        if (target.class === "reference" && a !== b) report.errors.push(`Reference count differs: ${target.name}`);
        if (target.class === "user" && a > b) report.errors.push(`Target has more user rows: ${target.name}`);
        if (target.class === "user" && a < b) report.notes.push(`Fewer user rows after restore: ${target.name} (${target.count} versus ${reference.count})`);
      }
    }
    report.ok = report.errors.length === 0;
  } catch { report.errors.push("Restore verification could not complete; check database connectivity, permissions and schema"); }
  return report;
}
export async function main(args = process.argv.slice(2)) {
  let targetUrl, referenceUrl, json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (["--target", "--reference"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) {
      if (args[i++] === "--target") targetUrl = args[i]; else referenceUrl = args[i];
    } else { console.error("Usage: node scripts/verify-restore.mjs --target <url> [--reference <url>] [--json]"); return 1; }
  }
  if (!targetUrl) { console.error("A target database URL is required"); return 1; }
  const report = await verifyRestore({ targetUrl, referenceUrl });
  // The report contains aggregates and fixed diagnostics, never URLs or row data.
  console.log(JSON.stringify(report, null, json ? undefined : 2));
  return report.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
