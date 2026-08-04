import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";
import { deleteObject as deleteObjectDefault } from "../src/services/s3Service.js";
import { SLIDE_FILENAMES } from "../src/hyrox/sharePack/slideAssets.js";

export async function cleanupExpiredSharePacks(db = pool, deps = {}) {
  const deleteObjectFn = deps.deleteObject ?? deleteObjectDefault;
  const log = deps.log ?? console;

  const { rows } = await db.query(
    `SELECT id, submission_id, zip_key, race_card_key
     FROM hyrox_share_packs
     WHERE expires_at IS NOT NULL AND expires_at < NOW()`,
  );

  let deletedCount = 0;
  let objectErrorCount = 0;

  for (const row of rows) {
    const prefix = `hyrox-share-packs/${row.submission_id}/`;
    const keys = new Set();
    if (row.zip_key) {
      keys.add(row.zip_key);
      for (const filename of SLIDE_FILENAMES) keys.add(`${prefix}${filename}`);
    }
    if (row.race_card_key) keys.add(row.race_card_key);

    for (const key of keys) {
      try {
        await deleteObjectFn(key);
      } catch (err) {
        objectErrorCount += 1;
        log.warn?.({ event: "hyrox_share_pack_cleanup.s3_delete_failed", key, err: err?.message });
      }
    }

    await db.query(`DELETE FROM hyrox_share_packs WHERE id = $1`, [row.id]);
    deletedCount += 1;
  }

  log.info?.(
    { event: "hyrox_share_pack_cleanup.complete", deletedCount, objectErrorCount },
    `Cleaned up ${deletedCount} expired HYROX share-pack row(s)`,
  );
  return { deletedCount, objectErrorCount };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cleanupExpiredSharePacks()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exitCode = 1;
    });
}
