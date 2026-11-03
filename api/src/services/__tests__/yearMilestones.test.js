import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../../db.js";
import { DATABASE_SKIP, withUsers, closeDb } from "../../../testSupport/entitlementFixtures.js";
import { transactionalPool } from "../../../testSupport/trainingFixtures.js";
import { detectAndRecordMilestones, claimYearMilestone } from "../yearMilestones.js";
import { getYearProgress } from "../yearProgress.js";
import { backfillYearMilestones } from "../../../scripts/backfillYearMilestones.mjs";

after(closeDb);
async function seed(db, user, count, start = "2026-01-01") {
  await db.query("UPDATE app_user SET created_at = '2020-01-01', timezone = 'UTC' WHERE id = $1", [user]);
  await db.query(`INSERT INTO training_session (user_id,local_date,source)
    SELECT $1, $2::date + n, 'manual' FROM generate_series(0,$3::int - 1) n`, [user, start, count]);
}

test("day one is recorded once; a second session on the same date earns nothing", { skip: DATABASE_SKIP }, () => withUsers(async (db, [user]) => {
  await seed(db, user, 1);
  const rows = await detectAndRecordMilestones(db, { userId: user, localDate: "2026-01-01" });
  assert.deepEqual(rows.map(row => row.slug), ["day_1"]);
  await db.query("INSERT INTO training_session (user_id,local_date,source) VALUES ($1,'2026-01-01','manual')", [user]);
  assert.deepEqual(await detectAndRecordMilestones(db, { userId: user, localDate: "2026-01-01" }), []);
}));

test("crossing several thresholds records each once per year", { skip: DATABASE_SKIP }, () => withUsers(async (db, [user]) => {
  await seed(db, user, 50);
  const rows = await detectAndRecordMilestones(db, { userId: user, localDate: "2026-02-19" });
  assert.deepEqual(rows.map(row => row.slug).sort(), ["day_1", "day_25", "day_50"]);
  assert.deepEqual(await detectAndRecordMilestones(db, { userId: user, localDate: "2026-02-19" }), []);
  await seed(db, user, 1, "2025-01-01");
  assert.equal((await detectAndRecordMilestones(db, { userId: user, localDate: "2025-01-01" }))[0].year, 2025);
}));

test("first-year clubs use their pro-rated thresholds", { skip: DATABASE_SKIP }, () => withUsers(async (db, [user]) => {
  await seed(db, user, 76, "2026-10-01");
  await db.query("INSERT INTO client_profile (user_id,onboarding_completed_at) VALUES ($1,'2026-10-01T12:00Z')", [user]);
  const rows = await detectAndRecordMilestones(db, { userId: user, localDate: "2026-12-15" });
  assert.deepEqual(rows.filter(row => row.slug.startsWith("club_")).map(row => [row.slug, row.threshold]),
    [["club_100", 25], ["club_200", 50], ["club_250", 63], ["club_300", 76]]);
}));

test("un-completing cannot remove earned milestones or yearly club history", { skip: DATABASE_SKIP }, () => withUsers(async (db, [user]) => {
  await seed(db, user, 100);
  await detectAndRecordMilestones(db, { userId: user, localDate: "2026-04-10" });
  const claim = await claimYearMilestone(transactionalPool(db), user, 2026);
  assert.equal(claim.milestone.slug, "day_100");
  assert.equal(claim.coalesced_ids.length, 4);
  await db.query("DELETE FROM training_session WHERE user_id = $1", [user]);
  const progress = await getYearProgress(db, user, { now: new Date("2026-11-03T12:00Z") });
  assert.equal(progress.count, 0);
  assert.equal(progress.clubs[0].reached_on, "2026-04-10");
  assert.equal(progress.years[0].best_club, 100);
  assert.equal(progress.milestones.length, 5);
}));

test("backfill uses Nth distinct date, marks history seen, supports dry-run and is idempotent", { skip: DATABASE_SKIP }, () => withUsers(async (db, [user]) => {
  await seed(db, user, 100);
  const transaction = transactionalPool(db);
  const scoped = { ...transaction, query(sql, params) {
    if (sql.includes("SELECT DISTINCT user_id FROM training_session")) {
      return db.query(sql.replace("WHERE user_id > $1", "WHERE user_id > $1 AND user_id = $3"), [...params, user]);
    }
    return transaction.query(sql, params);
  } };
  assert.equal((await backfillYearMilestones(scoped, { dryRun: true })).milestones, 5);
  assert.equal((await db.query("SELECT id FROM year_milestone WHERE user_id = $1", [user])).rows.length, 0);
  assert.equal((await backfillYearMilestones(scoped)).milestones, 5);
  assert.equal((await backfillYearMilestones(scoped)).milestones, 0);
  const rows = (await db.query("SELECT slug,reached_on::text,seen_at FROM year_milestone WHERE user_id = $1", [user])).rows;
  assert.ok(rows.every(row => row.seen_at));
  assert.equal(rows.find(row => row.slug === "day_25").reached_on, "2026-01-25");
}));

test("two real database connections can claim only one highest overlay; lower milestones are seen", { skip: DATABASE_SKIP }, async () => {
  const user = randomUUID();
  await pool.query("INSERT INTO app_user (id,subject_id,email) VALUES ($1::uuid,$1::text,$2)", [user, `milestone-${user}@example.test`]);
  try {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await seed(db, user, 200);
      await detectAndRecordMilestones(db, { userId: user, localDate: "2026-07-19" });
      await db.query("COMMIT");
    } catch (err) { await db.query("ROLLBACK"); throw err; }
    finally { db.release(); }
    const results = await Promise.all([claimYearMilestone(pool, user, 2026), claimYearMilestone(pool, user, 2026)]);
    assert.equal(results.filter(row => row.milestone).length, 1);
    const claimed = results.find(row => row.milestone);
    assert.equal(claimed.milestone.slug, "club_200");
    assert.equal(claimed.coalesced_ids.length, 6);
    assert.equal((await getYearProgress(pool, user, { now: new Date("2026-11-03T12:00Z") })).unseen_milestones.length, 0);
  } finally { await pool.query("DELETE FROM app_user WHERE id = $1", [user]); }
});
