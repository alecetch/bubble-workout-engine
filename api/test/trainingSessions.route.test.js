import test, { after } from "node:test";
import assert from "node:assert/strict";
import { DATABASE_SKIP, withUsers, withApp, auth, token, closeDb } from "../testSupport/entitlementFixtures.js";
import { trainingProgram, transactionalPool } from "../testSupport/trainingFixtures.js";
import { createTrainingSessionHandlers } from "../src/routes/trainingSessions.js";
import { getYearProgress } from "../src/services/yearProgress.js";

after(closeDb);
const clock = new Date("2026-11-03T00:30:00Z");
const skip = { skip: DATABASE_SKIP };
async function fixture(fn, now = clock) {
  return withUsers(async (db, [user, other]) => {
    await db.query("UPDATE app_user SET created_at = '2020-01-01', timezone = 'UTC' WHERE id = ANY($1::uuid[])", [[user, other]]);
    const handlers = createTrainingSessionHandlers(transactionalPool(db), { now: () => now });
    await withApp(app => {
      app.use(auth);
      app.post("/sessions", handlers.post);
      app.get("/sessions", handlers.get);
      app.delete("/sessions/:id", handlers.delete);
    }, async url => {
      const request = (method, path = "", body, id = user) => fetch(`${url}/sessions${path}`, {
        method, headers: { ...(id ? { Authorization: `Bearer ${token(id)}` } : {}), "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const post = (body = {}, id = user) => request("POST", "", { activity_type: "run", duration_min: 40, ...body }, id);
      const progress = () => getYearProgress(db, user, { now });
      await fn({ db, user, other, request, post, progress });
    });
  });
}

test("manual log counts once, upserts in place and earns milestones only once", skip, () => fixture(async ({ post, progress, request }) => {
  const first = await post();
  assert.equal(first.status, 201);
  const body = await first.json();
  assert.deepEqual(body.year_progress, { year: 2026, count: 1, target: 200 });
  assert.deepEqual(body.session, { id: body.session.id, local_date: "2026-11-03", activity_type: "run", duration_min: 40 });
  assert.deepEqual(body.new_milestones.map(row => row.slug), ["day_1"]);
  const second = await (await post({ activity_type: "cycle", duration_min: 300 })).json();
  assert.equal(second.session.id, body.session.id);
  assert.equal(second.session.activity_type, "cycle");
  assert.equal(second.year_progress.count, 1);
  assert.deepEqual(second.new_milestones, []);
  assert.equal((await progress()).count, 1);
  assert.equal((await request("DELETE", `/${body.session.id}`)).status, 204);
  const after = await progress();
  assert.equal(after.count, 0);
  assert.equal(after.milestones[0].slug, "day_1");
}));

test("manual and in-app sessions share a training day; deleting manual keeps the in-app day", skip, () => fixture(async ({ db, user, post, request, progress }) => {
  const program = await trainingProgram(db, user);
  const row = (await db.query("INSERT INTO training_session (user_id,program_day_id,source,local_date) VALUES ($1,$2,'program_day','2026-11-03') RETURNING id", [user, program.days[0]])).rows[0];
  const body = await (await post()).json();
  assert.equal(body.year_progress.count, 1);
  assert.equal((await request("DELETE", `/${row.id}`)).status, 404);
  assert.equal((await request("DELETE", `/${body.session.id}`)).status, 204);
  assert.equal((await progress()).count, 1);
}));

test("manual routes require authentication, isolate owners and ignore client-supplied user IDs", skip, () => fixture(async ({ post, request, user, other }) => {
  assert.equal((await post({}, null)).status, 401);
  assert.equal((await request("GET", "", undefined, null)).status, 401);
  assert.equal((await request("DELETE", "/00000000-0000-0000-0000-000000000000", undefined, null)).status, 401);
  const body = await (await post({ user_id: other })).json();
  assert.equal((await request("DELETE", `/${body.session.id}`, undefined, other)).status, 404);
  assert.deepEqual((await (await request("GET", "", undefined, other)).json()).sessions, []);
  assert.equal((await (await request("GET", "", undefined, user)).json()).sessions.length, 1);
  assert.equal((await request("DELETE", "/invalid")).status, 404);
}));

test("validation rejects unknown activities, noninteger/out-of-range durations and dates outside today/yesterday without writes", skip, () => fixture(async ({ post, progress }) => {
  for (const [input, code] of [
    [{ activity_type: "walking" }, "invalid_activity_type"], [{ activity_type: null }, "invalid_activity_type"],
    ...[19, 301, 20.5, "40", null].map(duration_min => [{ duration_min }, "invalid_duration"]),
    ...["2026-11-01", "2026-11-04", "bad", null].map(local_date => [{ local_date }, "invalid_local_date"]),
  ]) {
    const result = await post(input);
    assert.equal(result.status, 400, JSON.stringify(input));
    assert.equal((await result.json()).code, code);
  }
  assert.equal((await progress()).count, 0);
  assert.equal((await post({ duration_min: 20, local_date: "2026-11-02" })).status, 201);
}));

test("GET filters the caller's manual rows by year and orders newest first", skip, () => fixture(async ({ post, request, db, user }) => {
  await post({ local_date: "2026-11-02" });
  await post();
  await db.query("INSERT INTO training_session (user_id,local_date,source,activity_type,duration_min) VALUES ($1,'2025-12-31','manual','swim',45)", [user]);
  const result = await (await request("GET", "?source=manual&year=2026")).json();
  assert.deepEqual(result.sessions.map(row => row.local_date), ["2026-11-03", "2026-11-02"]);
  assert.equal((await (await request("GET", "?year=2025")).json()).sessions.length, 1);
  for (const query of ["?year=abc", "?year=1999", "?year=2028", "?year=2026&year=2025", "?source=program_day"]) {
    assert.equal((await request("GET", query)).status, 400);
  }
}));

test("timezone controls today/yesterday and is remembered", skip, () => fixture(async ({ post, db, user }) => {
  const body = await (await post({ timezone: "Pacific/Honolulu" })).json();
  assert.equal(body.session.local_date, "2026-11-02");
  assert.equal((await post({ timezone: "Pacific/Honolulu", local_date: "2026-11-01" })).status, 201);
  assert.equal((await db.query("SELECT timezone FROM app_user WHERE id = $1", [user])).rows[0].timezone, "Pacific/Honolulu");
}));

test("Yesterday at New Year updates the selected prior year's progress", skip, () => fixture(async ({ post }) => {
  const body = await (await post({ local_date: "2026-12-31" })).json();
  assert.deepEqual(body.year_progress, { year: 2026, count: 1, target: 200 });
}, new Date("2027-01-01T12:00:00Z")));

test("a milestone failure rolls back the manual log instead of leaving a partially saved day", skip, () => withUsers(async (db, [user]) => {
  const wrapped = transactionalPool(db);
  const queryable = { connect: async () => {
    const client = await wrapped.connect();
    return { release: client.release, query: (sql, params) => {
      if (sql.includes("INSERT INTO year_milestone")) throw new Error("Simulated storage failure");
      return client.query(sql, params);
    } };
  } };
  const handlers = createTrainingSessionHandlers(queryable, { now: () => clock });
  await withApp(app => { app.use(auth); app.post("/sessions", handlers.post); }, async url => {
    const response = await fetch(`${url}/sessions`, { method: "POST", headers: { Authorization: `Bearer ${token(user)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ activity_type: "run", duration_min: 45 }) });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).code, "internal_error");
    assert.equal((await db.query("SELECT COUNT(*) FROM training_session WHERE user_id = $1", [user])).rows[0].count, "0");
  });
}));
