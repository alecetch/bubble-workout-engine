import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, ensureDb, seedPair, appWithLogging, withServer, request, profileRow } from "./helpers/profileOwnership.js";
const { createClientProfilesRouter } = await import("../src/routes/clientProfiles.js");
after(() => pool.end());
const notFound = { ok: false, code: "not_found", error: "Profile not found" };
function app() {
  const app = appWithLogging();
  const router = createClientProfilesRouter();
  app.use("/api/client-profiles", router);
  app.use("/client-profiles", router);
  return app;
}
test("profile routes require JWT for creation, reads and patches on both paths", async () => {
  await withServer(app(), async base => {
    for (const prefix of ["/api/client-profiles", "/client-profiles"]) {
      for (const [method, path] of [["POST", prefix], ["GET", `${prefix}/${randomUUID()}`], ["PATCH", `${prefix}/${randomUUID()}`]]) {
        const res = await request(base, path, null, method, method === "GET" ? undefined : {});
        assert.equal(res.status, 401); assert.equal(res.body.code, "unauthorized");
      }
    }
  });
});
test("profile reads expose own shape and hide foreign and unknown profiles on both paths", async t => {
  if (!await ensureDb(t)) return;
  const [a, b] = await seedPair(t);
  await withServer(app(), async base => {
    for (const prefix of ["/api/client-profiles", "/client-profiles"]) {
      const own = await request(base, `${prefix}/${a.profileId}`, a.userId);
      assert.equal(own.status, 200); assert.equal(own.body.id, a.profileId); assert.equal(own.body.userId, a.userId);
      assert.equal(Number(own.body.heightCm), 170); assert.ok(Array.isArray(own.body.goals));
      for (const id of [a.profileId, randomUUID()]) {
        const res = await request(base, `${prefix}/${id}`, b.userId);
        assert.equal(res.status, 404); assert.deepEqual(res.body, notFound);
      }
      const created = await request(base, prefix, a.userId, "POST", {});
      assert.equal(created.status, 200); assert.equal(created.body.id, a.profileId);
    }
  });
});
test("foreign profile patches leave the profile and existing anchor lifts unchanged", async t => {
  if (!await ensureDb(t)) return;
  const [a, b] = await seedPair(t);
  await pool.query(`INSERT INTO client_anchor_lift (client_profile_id, estimation_family, skipped, source) VALUES ($1, 'squat', true, 'skipped')`, [a.profileId]);
  const before = await profileRow(a.profileId);
  const anchors = async () => (await pool.query("SELECT * FROM client_anchor_lift WHERE client_profile_id = $1 ORDER BY estimation_family", [a.profileId])).rows;
  const beforeAnchors = await anchors();
  await withServer(app(), async base => {
    for (const prefix of ["/api/client-profiles", "/client-profiles"]) {
      const res = await request(base, `${prefix}/${a.profileId}`, b.userId, "PATCH", { heightCm: 999, anchorLifts: [{ estimationFamily: "squat", skipped: true, source: "manual" }] });
      assert.equal(res.status, 404); assert.deepEqual(res.body, notFound);
      assert.deepEqual(await profileRow(a.profileId), before); assert.deepEqual(await anchors(), beforeAnchors);
    }
  });
});
test("own patches persist and retain split validation and anchor stamping", async t => {
  if (!await ensureDb(t)) return;
  const [a] = await seedPair(t);
  await withServer(app(), async base => {
    const path = `/api/client-profiles/${a.profileId}`;
    const invalid = await request(base, path, a.userId, "PATCH", { preferredSplitJson: { day_focuses: [] } });
    assert.equal(invalid.status, 400); assert.equal(invalid.body.code, "validation_error");
    const res = await request(base, path, a.userId, "PATCH", { heightCm: 180, anchorLifts: [{ estimationFamily: "squat", skipped: true }] });
    assert.equal(res.status, 200); assert.equal(Number(res.body.heightCm), 180);
    assert.ok(res.body.anchorLiftsCollectedAt); assert.equal(Number((await profileRow(a.profileId)).height_cm), 180);
    const before = await profileRow(a.profileId);
    const badAnchor = await request(base, path, a.userId, "PATCH", { heightCm: 190, anchorLifts: [{}] });
    assert.equal(badAnchor.status, 400); assert.equal(badAnchor.body.code, "validation_error");
    assert.deepEqual(await profileRow(a.profileId), before);
  });
});
