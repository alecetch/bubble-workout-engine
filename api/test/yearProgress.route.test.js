import test, { after } from "node:test";
import assert from "node:assert/strict";
import { DATABASE_SKIP, withUsers, withApp, auth, token, closeDb } from "../testSupport/entitlementFixtures.js";
import { createYearProgressHandler } from "../src/routes/yearProgress.js";
import { getYearProgress } from "../src/services/yearProgress.js";

after(closeDb);
test("year progress: auth, additive shape, distinct dates, clubs, year history, free access and isolation", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user, other]) => {
    await db.query("UPDATE app_user SET created_at = '2020-01-01', timezone = 'UTC' WHERE id = ANY($1::uuid[])", [[user, other]]);
    for (const [id, dates] of [[user, ["2026-01-01", "2026-01-01", "2026-01-02", "2025-12-31"]], [other, ["2026-01-03"]]]) {
      for (const date of dates) await db.query("INSERT INTO training_session (user_id,local_date,source) VALUES ($1,$2,'manual')", [id, date]);
    }
    await withApp(app => { app.use(auth); app.get("/progress", createYearProgressHandler(db, { now: () => new Date("2026-11-02T12:00Z") })); }, async url => {
      assert.equal((await fetch(`${url}/progress`)).status, 401);
      const res = await fetch(`${url}/progress?user_id=${other}`, { headers: { Authorization: `Bearer ${token(user)}` } });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(Object.keys(body).sort(), ["ok", "year", "today_local", "count", "target", "pro_rated", "window_start", "window_end", "expected_to_date", "pace_delta", "pace_status", "projected_year_end", "clubs", "next_milestone", "training_dates", "years", "milestones", "unseen_milestones"].sort());
      assert.equal(body.count, 2);
      assert.equal(body.target, 200);
      assert.deepEqual(body.training_dates, ["2026-01-01", "2026-01-02"]);
      assert.deepEqual(body.years, [{ year: 2026, count: 2, target: 200, best_club: null }, { year: 2025, count: 1, target: 200, best_club: null }]);
      for (const query of ["year=1999", "year=2028", "year=abc", "year=2026.0", "timezone=nope", "year=2025&year=2026"]) {
        assert.equal((await fetch(`${url}/progress?${query}`, { headers: { Authorization: `Bearer ${token(user)}` } })).status, 400, query);
      }
    });
  });
});

test("first-year target and club reached dates use distinct dates; include empty current year", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    await db.query("UPDATE app_user SET timezone = 'UTC' WHERE id = $1", [user]);
    await db.query("INSERT INTO client_profile (user_id, onboarding_completed_at) VALUES ($1, '2026-10-01T12:00Z')", [user]);
    await db.query(`INSERT INTO training_session (user_id,local_date,source)
      SELECT $1, '2026-10-01'::date + n, 'manual' FROM generate_series(0,49) n`, [user]);
    await withApp(app => { app.use(auth); app.get("/progress", createYearProgressHandler(db, { now: () => new Date("2027-01-01T12:00Z") })); }, async url => {
      const body = await (await fetch(`${url}/progress?year=2026`, { headers: { Authorization: `Bearer ${token(user)}` } })).json();
      assert.equal(body.target, 50);
      assert.equal(body.pro_rated, true);
      assert.deepEqual(body.clubs.slice(0, 2), [{ tier: 100, threshold: 25, reached_on: "2026-10-25" }, { tier: 200, threshold: 50, reached_on: "2026-11-19" }]);
      assert.equal(body.projected_year_end, 50);
      assert.deepEqual(body.years, [{ year: 2027, count: 0, target: 200, best_club: null }, { year: 2026, count: 50, target: 50, best_club: 200 }]);
    });
  });
});

test("read uses three caller-scoped queries; projection uses only the last 28 distinct dates", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    await db.query("UPDATE app_user SET created_at = '2020-01-01', timezone = 'UTC' WHERE id = $1", [user]);
    for (const date of ["2026-01-01", "2026-10-05", "2026-10-06", "2026-10-07", "2026-11-01", "2026-11-02", "2026-11-02"]) {
      await db.query("INSERT INTO training_session (user_id,local_date,source) VALUES ($1,$2,'manual')", [user, date]);
    }
    let queries = 0;
    const progress = await getYearProgress({ query: (sql, params) => { queries++; assert.equal(params[0], user); return db.query(sql, params); } }, user, { now: new Date("2026-11-02T12:00Z") });
    assert.equal(queries, 3);
    assert.equal(progress.count, 6);
    assert.equal(progress.projected_year_end, 14);
  });
});
