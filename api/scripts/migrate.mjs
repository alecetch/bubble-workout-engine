/**
 * Production migration runner. Reads V__*.sql files from ./migrations/,
 * checks flyway_schema_history for what's already applied, and runs anything new.
 * Invoked automatically as the Fly release_command before each deploy goes live.
 */
import pg from "pg";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../migrations");

function parseVersion(filename) {
  const match = filename.match(/^V(\d+(?:__\d+)?)__(.+)\.sql$/i);
  if (!match) return null;
  const rawVersion = match[1].replace(/__/g, ".");
  return {
    version: rawVersion,
    versionNum: parseFloat(rawVersion),
    description: match[2].replace(/_/g, " "),
    script: filename,
  };
}

async function getAppliedVersions(client) {
  try {
    const { rows } = await client.query(
      "SELECT version FROM flyway_schema_history WHERE success = true",
    );
    return new Set(rows.map((r) => r.version));
  } catch {
    return new Set();
  }
}

async function getNextRank(client) {
  try {
    const { rows } = await client.query(
      "SELECT COALESCE(MAX(installed_rank), 0) + 1 AS next FROM flyway_schema_history",
    );
    return rows[0].next;
  } catch {
    return 1;
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log("[migrate] Connected.");

const applied = await getAppliedVersions(client);

const files = (await readdir(MIGRATIONS_DIR))
  .filter((f) => /^V\d+__.*\.sql$/i.test(f))
  .sort((a, b) => {
    const va = parseVersion(a)?.versionNum ?? 0;
    const vb = parseVersion(b)?.versionNum ?? 0;
    return va - vb;
  });

let count = 0;
for (const file of files) {
  const meta = parseVersion(file);
  if (!meta || applied.has(meta.version)) continue;

  const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
  const start = Date.now();
  const rank = await getNextRank(client);

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO flyway_schema_history
         (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
       VALUES ($1, $2, $3, 'SQL', $4, 0, current_user, $5, true)`,
      [rank, meta.version, meta.description, meta.script, Date.now() - start],
    );
    await client.query("COMMIT");
    console.log(`[migrate] ✓ ${file}`);
    count++;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[migrate] ✗ ${file}: ${err.message}`);
    process.exit(1);
  }
}

if (count === 0) console.log("[migrate] No pending migrations.");
else console.log(`[migrate] Applied ${count} migration(s).`);

await client.end();
