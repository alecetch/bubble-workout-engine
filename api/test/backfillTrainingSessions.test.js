import test, { after } from "node:test";
import assert from "node:assert/strict";
import { DATABASE_SKIP, withUsers, closeDb } from "../testSupport/entitlementFixtures.js";
import { trainingProgram, transactionalPool, seedLog } from "../testSupport/trainingFixtures.js";
import { backfillTrainingSessions } from "../scripts/backfillTrainingSessions.mjs";

after(closeDb);
test("backfill uses earliest confirmed local date, latest log timestamp, scheduled fallback, and is idempotent", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    const program = await trainingProgram(db, user);
    await db.query("UPDATE app_user SET timezone = 'America/New_York' WHERE id = $1", [user]);
    await db.query("UPDATE program_day SET is_completed = true WHERE id = ANY($1::uuid[])", [[program.days[0], program.days[1]]]);
    await seedLog(db, user, program, { createdAt: "2026-03-01T03:30:00Z" });
    // Different set order permits another log for the same exercise.
    await db.query(`INSERT INTO segment_exercise_log (user_id,program_id,program_day_id,is_draft,created_at)
      VALUES ($1,$2,$3,false,'2026-03-02T12:00Z'), ($1,$2,$4,true,'2026-02-01T12:00Z')`, [user, program.id, program.days[0], program.days[2]]);
    const all = transactionalPool(db);
    // Restrict the CLI's user scan to fixture users, keeping the rollback test fast and isolated.
    const isolated = { ...all, query: (sql, params) => sql.includes("WHERE u.id > $1")
      ? db.query(sql.replace("WHERE u.id > $1", "WHERE u.id > $1 AND u.id = $3"), [...params, user]) : all.query(sql, params) };
    const preview = await backfillTrainingSessions(isolated, { dryRun: true });
    assert.equal(preview.sessions, 2);
    assert.equal((await db.query("SELECT count(*) FROM training_session WHERE user_id = $1", [user])).rows[0].count, "0");
    assert.equal((await backfillTrainingSessions(isolated)).sessions, 2);
    const rows = (await db.query("SELECT program_day_id,local_date::text FROM training_session WHERE user_id = $1 ORDER BY local_date", [user])).rows;
    assert.deepEqual(rows, [{ program_day_id: program.days[1], local_date: "2026-01-01" }, { program_day_id: program.days[0], local_date: "2026-02-28" }]);
    assert.equal((await db.query("SELECT completed_at FROM program_day WHERE id = $1", [program.days[0]])).rows[0].completed_at.toISOString(), "2026-03-02T12:00:00.000Z");
    const second = await backfillTrainingSessions(isolated);
    assert.equal(second.sessions, 0);
    assert.equal(second.completedTimestamps, 0);
  });
});
