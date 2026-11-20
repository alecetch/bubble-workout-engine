import { dbAvailableOrSkip } from "../../../../test/helpers/requireDb.js";
import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../../../db.js";
import { finalizeJobStatus } from "../doublesJobRunner.js";

let dbReadyCache = null;

async function dbReady(t) {
  if (!await dbAvailableOrSkip(t, pool)) return false;

    const result = await pool.query("SELECT to_regclass('public.hyrox_doubles_scrape_jobs') AS jobs");
    if (!result.rows[0]?.jobs) {
      dbReadyCache = { ready: false, reason: "hyrox_doubles_scrape_jobs table is not present in this database." };
      if (process.env.REQUIRE_DB === "true") throw new Error(dbReadyCache.reason);
      t.skip(dbReadyCache.reason);
      return false;
    }
    dbReadyCache = { ready: true };
    return true;

}

test.after(async () => {
  await pool.end();
});

test("finalizeJobStatus completes a job with a null last_error without throwing", async (t) => {
  if (!await dbReady(t)) return;

  const inserted = await pool.query(
    `INSERT INTO hyrox_doubles_scrape_jobs (status, selected_event_ids, selected_divisions)
     VALUES ('running', ARRAY[1]::int[], ARRAY['doubles_male']::text[])
     RETURNING id`,
  );
  const jobId = inserted.rows[0].id;

  try {
    await finalizeJobStatus(pool, jobId, "completed", null);

    const { rows } = await pool.query(
      "SELECT status, last_error, last_error_at, completed_at FROM hyrox_doubles_scrape_jobs WHERE id = $1",
      [jobId],
    );
    assert.equal(rows[0].status, "completed");
    assert.equal(rows[0].last_error, null);
    assert.notEqual(rows[0].completed_at, null);
  } finally {
    await pool.query("DELETE FROM hyrox_doubles_scrape_jobs WHERE id = $1", [jobId]);
  }
});

test("finalizeJobStatus marks a job failed with a specific error message", async (t) => {
  if (!await dbReady(t)) return;

  const inserted = await pool.query(
    `INSERT INTO hyrox_doubles_scrape_jobs (status, selected_event_ids, selected_divisions)
     VALUES ('running', ARRAY[1]::int[], ARRAY['doubles_male']::text[])
     RETURNING id`,
  );
  const jobId = inserted.rows[0].id;

  try {
    await finalizeJobStatus(pool, jobId, "failed", "All 3 records found were already in the database — no new data for this scrape.");

    const { rows } = await pool.query(
      "SELECT status, last_error FROM hyrox_doubles_scrape_jobs WHERE id = $1",
      [jobId],
    );
    assert.equal(rows[0].status, "failed");
    assert.match(rows[0].last_error, /already in the database/);
  } finally {
    await pool.query("DELETE FROM hyrox_doubles_scrape_jobs WHERE id = $1", [jobId]);
  }
});
