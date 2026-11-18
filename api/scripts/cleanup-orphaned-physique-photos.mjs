import { pathToFileURL } from "node:url";
import { pool } from "../src/db.js";
import { listPrefixes, deletePrefix, countPrefix, PHYSIQUE_BUCKET } from "../src/services/s3Service.js";
import { isUuid } from "../src/utils/userIdentity.js";

export async function run({ db = pool, listPrefixesFn = listPrefixes, deletePrefixFn = deletePrefix, countFn = countPrefix, apply = false, log = console.log } = {}) {
  const summary = { checked: 0, orphaned: 0, skipped: 0, objects_deleted: 0 };
  const prefixes = [...new Set(await listPrefixesFn("physique/", PHYSIQUE_BUCKET))];
  const valid = [];
  for (const prefix of prefixes) {
    const match = typeof prefix === "string" && /^physique\/([^/]+)\/$/.exec(prefix);
    if (!match || match[1] !== match[1].trim() || !isUuid(match[1])) { summary.skipped++; continue; }
    valid.push({ prefix, id: match[1].toLowerCase() });
  }
  for (let offset = 0; offset < valid.length; offset += 500) {
    const batch = valid.slice(offset, offset + 500);
    const { rows } = await db.query("SELECT id FROM app_user WHERE id = ANY($1::uuid[])", [batch.map(item => item.id)]);
    const existing = new Set(rows.map(row => row.id.toLowerCase()));
    for (const { id, prefix } of batch) {
      summary.checked++;
      if (existing.has(id)) continue;
      // Recheck immediately before applying: an account created since the batch query is not an orphan.
      if (apply && (await db.query("SELECT id FROM app_user WHERE id = $1", [id])).rows.length) continue;
      summary.orphaned++;
      const objects = await countFn(prefix, PHYSIQUE_BUCKET);
      log({ prefix, objects, apply });
      if (apply) summary.objects_deleted += (await deletePrefixFn(prefix, PHYSIQUE_BUCKET)).deleted;
    }
  }
  log(summary);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--apply")) throw new Error("Use --apply or no flags (dry run)");
    await run({ apply: args.includes("--apply") });
  } catch { console.error("Orphaned physique photo cleanup failed"); process.exitCode = 1; }
  finally { await pool.end(); }
}
