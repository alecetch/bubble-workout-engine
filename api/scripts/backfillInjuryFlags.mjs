import { pathToFileURL } from "node:url";
import { pool } from "../src/db.js";
import { normalizeInjuryFlags, normalizeInjuryFlag, InvalidInjuryFlagError } from "../src/utils/injuryFlags.js";

export async function backfillInjuryFlags(db, { apply = false } = {}) {
  const client = typeof db.connect === "function" ? await db.connect() : db;
  const totals = { profiles: 0, changed: 0, unknownRows: 0, unknownValues: {}, apply };
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id, injury_flags FROM client_profile ORDER BY id FOR UPDATE");
    for (const row of rows) {
      totals.profiles++;
      let flags;
      try { flags = normalizeInjuryFlags(row.injury_flags); }
      catch (error) {
        if (!(error instanceof InvalidInjuryFlagError)) throw error;
        totals.unknownRows++;
        for (const value of row.injury_flags) {
          if (!normalizeInjuryFlag(value)) {
            const key = String(value);
            Object.defineProperty(totals.unknownValues, key, {
              value: (Object.hasOwn(totals.unknownValues, key) ? totals.unknownValues[key] : 0) + 1,
              enumerable: true, configurable: true,
            });
          }
        }
        continue;
      }
      if (JSON.stringify(flags) === JSON.stringify(row.injury_flags ?? [])) continue;
      totals.changed++;
      if (apply) await client.query("UPDATE client_profile SET injury_flags = $2, updated_at = now() WHERE id = $1", [row.id, flags]);
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return totals;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (client !== db) client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--apply", "--dry-run"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) {
      throw new Error("Use --dry-run (default) or --apply");
    }
    console.log(JSON.stringify(await backfillInjuryFlags(pool, { apply: args.includes("--apply") })));
  } catch { console.error("Injury flag backfill failed"); process.exitCode = 1; }
  finally { await pool.end(); }
}
