import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

export async function cleanupOldCalculatorEvents(db = pool, deps = {}) {
  const log = deps.log ?? console;
  const retentionDays = deps.retentionDays ?? 180;
  const { rowCount } = await db.query(
    `DELETE FROM hyrox_calculator_events WHERE created_at < NOW() - ($1 * INTERVAL '1 day')`,
    [retentionDays],
  );
  log.info?.(
    { event: "hyrox_calculator_events_cleanup.complete", deletedCount: rowCount },
    `Deleted ${rowCount} HYROX calculator event row(s) older than ${retentionDays} days`,
  );
  return { deletedCount: rowCount };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cleanupOldCalculatorEvents()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exitCode = 1;
    });
}
