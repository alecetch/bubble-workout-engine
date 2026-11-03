import test, { after } from "node:test";
import assert from "node:assert/strict";
import { DATABASE_SKIP, withUsers, withApp, auth, token, closeDb } from "../testSupport/entitlementFixtures.js";
import { trainingProgram } from "../testSupport/trainingFixtures.js";
import { createYearRecapHandler, createYearProgressHandler } from "../src/routes/yearProgress.js";

after(closeDb);
const skip = { skip: DATABASE_SKIP };
async function fixture(fn, clock = "2026-12-28T12:00:00Z") {
  return withUsers(async (db, [user, other]) => {
    await db.query("UPDATE app_user SET created_at = '2020-01-01', timezone = 'UTC' WHERE id = ANY($1::uuid[])", [[user, other]]);
    await withApp(app => { app.use(auth); app.get("/recap", createYearRecapHandler(db, { now: () => new Date(clock) })); }, async url => {
      const get = (query = "?year=2026", id = user) => fetch(`${url}/recap${query}`, { headers: id ? { Authorization: `Bearer ${token(id)}` } : {} });
      await fn({ db, user, other, get });
    });
  });
}
test("recap counts days separately from sessions, preserves earned clubs and counts real weight PRs in one query", skip, () => fixture(async ({ db, user, get }) => {
  for (const [date, weight, draft] of [["2025-12-31", 100, false], ["2026-09-30", 90, false], ["2026-10-01", 110, false], ["2026-10-02", 200, true]]) {
    const program = await trainingProgram(db, user);
    await db.query("UPDATE program_day SET scheduled_date = $2::date WHERE id = $1", [program.days[0], date]);
    await db.query(`INSERT INTO segment_exercise_log (user_id, program_id, program_day_id, workout_segment_id,
      program_exercise_id, weight_kg, is_draft) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [user, program.id, program.days[0], program.segment, program.exercise, weight, draft]);
  }
  await db.query(`INSERT INTO training_session (user_id,local_date,source) VALUES
    ($1,'2026-10-01','apple_health'),($1,'2026-10-01','apple_health'),($1,'2026-10-02','apple_health')`, [user]);
  await db.query("INSERT INTO year_milestone (user_id,year,slug,threshold,reached_on) VALUES ($1,2026,'club_200',200,'2026-09-20')", [user]);
  const response = await get();
  assert.equal(response.status, 200);
  const recap = await response.json();
  assert.deepEqual(Object.keys(recap).sort(), ["ok","year","count","target","pro_rated","best_club","best_month","longest_on_pace_weeks","busiest_weekday","sessions_count","personal_records_count","first_training_date","milestones","training_dates","today_local","window_start","window_end"].sort());
  assert.equal(recap.count, 2);
  assert.equal(recap.sessions_count, 3);
  assert.equal(recap.personal_records_count, 1);
  assert.equal(recap.best_club, 200);
  assert.deepEqual(recap.best_month, { month: 10, count: 2 });
  assert.equal(recap.first_training_date, "2026-10-01");
  assert.deepEqual(recap.milestones, [{ slug: "club_200", reached_on: "2026-09-20" }]);
}));
test("recap is authenticated, available without an entitlement and scoped to the token", skip, () => fixture(async ({ db, user, other, get }) => {
  await db.query("INSERT INTO training_session (user_id,local_date,source) VALUES ($1,'2026-01-01','apple_health')", [user]);
  assert.equal((await get("?year=2026", null)).status, 401);
  assert.equal((await (await get(`?year=2026&user_id=${other}`)).json()).count, 1);
  const empty = await (await get("?year=2026", other)).json();
  assert.equal(empty.count, 0);
  assert.equal(empty.sessions_count, 0);
  assert.equal(empty.personal_records_count, 0);
  assert.equal(empty.best_month, null);
  assert.equal(empty.busiest_weekday, null);
  assert.equal(empty.first_training_date, null);
  assert.equal(empty.longest_on_pace_weeks, 0);
}));
test("pre-join years return no_year, invalid inputs return 400 and current recap opens on local 28 December", skip, () => fixture(async ({ get }) => {
  const before = await get("?year=2019");
  assert.equal(before.status, 404);
  assert.equal((await before.json()).code, "no_year");
  for (const query of ["?year=abc", "?year=2027", "?year=2026&year=2025", "?year=2026&timezone=nope"]) assert.equal((await get(query)).status, 400);
  assert.equal((await get("?year=2026&timezone=Pacific/Honolulu")).status, 404);
  assert.equal((await get("?year=2026&timezone=Pacific/Kiritimati")).status, 200);
  assert.equal((await get("?year=2025")).status, 200);
}, "2026-12-28T01:00:00Z"));
test("current recap stays unavailable before December 28 but past years remain available", skip, () => fixture(async ({ get }) => {
  const current = await get();
  assert.equal(current.status, 404);
  assert.equal((await current.json()).code, "recap_not_ready");
  assert.equal((await get("?year=2025")).status, 200);
}, "2026-12-27T12:00:00Z"));
test("year progress rolls over on local January 1 and retains last year's count and club", skip, () => withUsers(async (db, [user]) => {
  await db.query("UPDATE app_user SET created_at='2020-01-01', timezone='Pacific/Kiritimati' WHERE id=$1", [user]);
  await db.query("INSERT INTO training_session (user_id,local_date,source) VALUES ($1,'2026-12-31','apple_health')", [user]);
  await db.query("INSERT INTO year_milestone (user_id,year,slug,threshold,reached_on) VALUES ($1,2026,'club_200',200,'2026-11-20')", [user]);
  await withApp(app => { app.use(auth); app.get("/progress", createYearProgressHandler(db, { now: () => new Date("2026-12-31T12:05:00Z") })); }, async url => {
    const body = await (await fetch(`${url}/progress`, { headers: { Authorization: `Bearer ${token(user)}` } })).json();
    assert.equal(body.year, 2027);
    assert.equal(body.today_local, "2027-01-01");
    assert.equal(body.count, 0);
    assert.deepEqual(body.years, [{ year: 2027, count: 0, target: 200, best_club: null }, { year: 2026, count: 1, target: 200, best_club: 200 }]);
  });
}));
