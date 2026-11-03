import test, { after } from "node:test";
import assert from "node:assert/strict";
import { DATABASE_SKIP, withUsers, withApp, auth, token, closeDb } from "../testSupport/entitlementFixtures.js";
import { transactionalPool } from "../testSupport/trainingFixtures.js";
import { createYearMilestoneHandlers } from "../src/routes/yearMilestones.js";
import { createYearProgressHandler } from "../src/routes/yearProgress.js";

after(closeDb);
test("milestone acknowledgement and claim are authenticated and caller-scoped", { skip: DATABASE_SKIP }, () => withUsers(async (db, [user, other]) => {
  const row = (await db.query(`INSERT INTO year_milestone (user_id,year,slug,threshold,reached_on)
    VALUES ($1,2026,'day_1',1,'2026-01-01') RETURNING id`, [user])).rows[0];
  const handlers = createYearMilestoneHandlers(transactionalPool(db));
  await withApp(app => {
    app.use(auth);
    app.post("/milestones/claim", handlers.claim);
    app.post("/milestones/:id/seen", handlers.seen);
    app.get("/progress", createYearProgressHandler(db, { now: () => new Date("2026-11-03T12:00Z") }));
  }, async url => {
    const post = (path, id = user, body = {}) => fetch(`${url}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await fetch(`${url}/milestones/${row.id}/seen`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${url}/milestones/claim`, { method: "POST" })).status, 401);
    assert.equal((await post(`/milestones/${row.id}/seen`, other)).status, 404);
    assert.equal((await post("/milestones/claim", other, { year: 2026 })).status, 200);
    assert.equal((await post("/milestones/claim", user, { year: "2026" })).status, 400);
    const before = await (await fetch(`${url}/progress`, { headers: { Authorization: `Bearer ${token(user)}` } })).json();
    assert.equal(before.unseen_milestones.length, 1);
    assert.equal((await post(`/milestones/${row.id}/seen`)).status, 204);
    assert.equal((await post(`/milestones/${row.id}/seen`)).status, 204);
    const after = await (await fetch(`${url}/progress`, { headers: { Authorization: `Bearer ${token(user)}` } })).json();
    assert.deepEqual(after.unseen_milestones, []);
    assert.deepEqual(after.milestones, [{ slug: "day_1", threshold: 1, reached_on: "2026-01-01" }]);
  });
}));
