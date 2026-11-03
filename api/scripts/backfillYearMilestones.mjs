import { pathToFileURL } from "node:url";
import { pool } from "../src/db.js";
import { milestoneDefinitions } from "../src/services/yearMilestones.js";

export async function backfillYearMilestones(db, { dryRun = false, batchSize = 100 } = {}) {
  const totals = { users: 0, milestones: 0, dryRun };
  let cursor = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const users = (await db.query(`SELECT DISTINCT user_id FROM training_session
      WHERE user_id > $1 ORDER BY user_id LIMIT $2`, [cursor, batchSize])).rows;
    if (!users.length) break;
    for (const { user_id: userId } of users) {
      const client = typeof db.connect === "function" ? await db.connect() : db;
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM app_user WHERE id = $1 FOR UPDATE", [userId]);
        const dates = (await client.query(`SELECT DISTINCT local_date::text AS local_date FROM training_session
          WHERE user_id = $1 ORDER BY local_date`, [userId])).rows.map(row => row.local_date);
        for (const year of new Set(dates.map(date => Number(date.slice(0, 4))))) {
          const yearlyDates = dates.filter(date => Number(date.slice(0, 4)) === year);
          const existing = new Set((await client.query("SELECT slug FROM year_milestone WHERE user_id = $1 AND year = $2", [userId, year])).rows.map(row => row.slug));
          const definitions = (await milestoneDefinitions(client, userId, year)).filter(m => m.threshold <= yearlyDates.length && !existing.has(m.slug));
          for (const milestone of definitions) {
            if (dryRun) { totals.milestones++; continue; }
            const inserted = await client.query(`INSERT INTO year_milestone (user_id, year, slug, threshold, reached_on, seen_at)
              VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (user_id, year, slug) DO NOTHING`,
            [userId, year, milestone.slug, milestone.threshold, yearlyDates[milestone.threshold - 1]]);
            totals.milestones += inserted.rowCount;
          }
        }
        totals.users++;
        await client.query(dryRun ? "ROLLBACK" : "COMMIT");
      } catch (err) { await client.query("ROLLBACK"); throw err; }
      finally { if (client !== db) client.release(); }
    }
    cursor = users.at(-1).user_id;
  }
  return totals;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const unknown = process.argv.slice(2).filter(arg => arg !== "--dry-run");
    if (unknown.length) throw new Error(`Unknown option: ${unknown[0]}`);
    console.log(JSON.stringify(await backfillYearMilestones(pool, { dryRun: process.argv.includes("--dry-run") })));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
  finally { await pool.end(); }
}
