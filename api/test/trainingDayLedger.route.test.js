import test, { after } from "node:test";
import assert from "node:assert/strict";
import { DATABASE_SKIP, withUsers, withApp, auth, token, closeDb } from "../testSupport/entitlementFixtures.js";
import { trainingProgram, transactionalPool, seedLog } from "../testSupport/trainingFixtures.js";
import { createReadProgramHandlers } from "../src/routes/readProgram.js";
import { createSegmentLogHandlers } from "../src/routes/segmentLog.js";
import { getYearProgress } from "../src/services/yearProgress.js";
import { localDateInZone, offsetLocalDate } from "../src/services/trainingYear.js";

after(closeDb);

async function fixture(fn) {
  await withUsers(async (db, [user, other]) => {
    const program = await trainingProgram(db, user);
    await db.query("UPDATE app_user SET timezone = 'Pacific/Honolulu', created_at = '2020-01-01' WHERE id = $1", [user]);
    const queryable = transactionalPool(db);
    const complete = createReadProgramHandlers({ db: queryable, progressionDecisionService: { async applyProgressionRecommendations() { return { decisions: [] }; } } });
    const logs = createSegmentLogHandlers(queryable);
    await withApp(app => {
      app.use(auth);
      app.patch("/day/:program_day_id/complete", complete.dayComplete);
      app.post("/segment-log", logs.postSegmentLog);
    }, async url => {
      const today = localDateInZone(new Date(), "Pacific/Honolulu");
      const patch = (day, body = {}, id = user) => fetch(`${url}/day/${day}/complete`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      await fn({ db, program, user, other, patch, url, today });
    });
  });
}

test("multiple completions including bonus day count once on actual date, and uncomplete retains other sessions", { skip: DATABASE_SKIP }, () => fixture(async ({ db, program, user, patch, today }) => {
  for (const day of [program.days[0], program.days[2]]) {
    const res = await patch(day, { local_date: today });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).year_progress, { year: Number(today.slice(0, 4)), count: 1, target: 200 });
  }
  const completedAt = (await db.query("SELECT completed_at FROM program_day WHERE id = $1", [program.days[0]])).rows[0].completed_at;
  assert.ok(completedAt);
  await patch(program.days[0], { local_date: offsetLocalDate(today, -1) });
  assert.deepEqual((await getYearProgress(db, user)).training_dates, [today]);
  await patch(program.days[0], { is_completed: false });
  assert.equal((await getYearProgress(db, user)).count, 1);
  await patch(program.days[2], { is_completed: false });
  assert.equal((await getYearProgress(db, user)).count, 0);
  assert.equal((await db.query("SELECT completed_at FROM program_day WHERE id = $1", [program.days[0]])).rows[0].completed_at, null);
}));

test("confirmed set without completion counts; uncomplete retains it; later completion cannot move date", { skip: DATABASE_SKIP }, () => fixture(async ({ db, program, user, url, patch, today }) => {
  const yesterday = offsetLocalDate(today, -1);
  const res = await fetch(`${url}/segment-log`, { method: "POST", headers: { Authorization: `Bearer ${token(user)}`, "Content-Type": "application/json" }, body: JSON.stringify({
    program_id: program.id, program_day_id: program.days[0], workout_segment_id: program.segment, local_date: yesterday,
    rows: [{ program_exercise_id: program.exercise, order_index: 1, weight_kg: 50, reps_completed: 5 }],
  }) });
  assert.equal(res.status, 200, JSON.stringify(await res.json()));
  assert.deepEqual((await getYearProgress(db, user)).training_dates, [yesterday]);
  await patch(program.days[0], { local_date: today });
  await patch(program.days[0], { is_completed: false });
  assert.deepEqual((await getYearProgress(db, user)).training_dates, [yesterday]);
}));

test("invalid dates roll back completion and logs; yesterday and old clients work; ownership is enforced", { skip: DATABASE_SKIP }, () => fixture(async ({ db, program, user, other, patch, today, url }) => {
  const invalid = await patch(program.days[0], { local_date: offsetLocalDate(today, -2) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "invalid_local_date");
  assert.equal((await db.query("SELECT is_completed FROM program_day WHERE id = $1", [program.days[0]])).rows[0].is_completed, false);
  assert.equal((await patch(program.days[0], {}, other)).status, 404);
  const badLog = await fetch(`${url}/segment-log`, { method: "POST", headers: { Authorization: `Bearer ${token(user)}`, "Content-Type": "application/json" }, body: JSON.stringify({
    program_id: program.id, program_day_id: program.days[0], workout_segment_id: program.segment,
    local_date: offsetLocalDate(today, -2), rows: [{ program_exercise_id: program.exercise }],
  }) });
  assert.equal(badLog.status, 400);
  assert.equal((await db.query("SELECT count(*) FROM segment_exercise_log WHERE user_id = $1", [user])).rows[0].count, "0");
  assert.equal((await patch(program.days[0])).status, 200);
  assert.deepEqual((await getYearProgress(db, user)).training_dates, [today]);
  assert.equal((await patch(program.days[1], { local_date: offsetLocalDate(today, -1), timezone: "Pacific/Honolulu" })).status, 200);
  assert.equal((await getYearProgress(db, user)).count, 2);
}));

test("draft logs alone do not retain a training day", { skip: DATABASE_SKIP }, () => fixture(async ({ db, program, user, patch }) => {
  await seedLog(db, user, program, { draft: true });
  await patch(program.days[0]);
  await patch(program.days[0], { is_completed: false });
  assert.equal((await getYearProgress(db, user)).count, 0);
}));

test("set-log ownership and client user IDs cannot redirect the ledger; valid zones are remembered", { skip: DATABASE_SKIP }, () => fixture(async ({ db, program, user, other, url }) => {
  const body = { user_id: other, program_id: program.id, program_day_id: program.days[0], workout_segment_id: program.segment,
    timezone: "Asia/Tokyo", rows: [{ program_exercise_id: program.exercise, order_index: 1, reps_completed: 5 }] };
  const post = id => fetch(`${url}/segment-log`, { method: "POST", headers: { Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post(other)).status, 404);
  assert.equal((await post(user)).status, 200);
  assert.equal((await getYearProgress(db, other)).count, 0);
  assert.equal((await db.query("SELECT timezone FROM app_user WHERE id = $1", [user])).rows[0].timezone, "Asia/Tokyo");
  assert.equal((await db.query("SELECT count(*) FROM training_session WHERE user_id = $1", [user])).rows[0].count, "1");
}));
