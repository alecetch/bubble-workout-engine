import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, ensureDb, seedPair, appWithLogging, withServer, request, profileRow } from "./helpers/profileOwnership.js";
const { createUsersMeRouter } = await import("../src/routes/usersMe.js");
after(() => pool.end());
function app() {
  const app = appWithLogging(); const router = createUsersMeRouter();
  app.use("/api/users/me", router); app.use("/users/me", router); return app;
}
test("users/me rejects foreign and unknown profile links before any preferences change", async t => {
  if (!await ensureDb(t)) return;
  const [a, b] = await seedPair(t);
  const beforeA = await profileRow(a.profileId); const beforeB = await profileRow(b.profileId);
  await withServer(app(), async base => {
    for (const path of ["/api/users/me", "/users/me"]) {
      for (const id of [a.profileId, randomUUID()]) {
        const res = await request(base, path, b.userId, "PATCH", { clientProfileId: id, preferredUnit: "lbs", preferredHeightUnit: "ft" });
        assert.equal(res.status, 404); assert.deepEqual(res.body, { ok: false, code: "not_found", error: "Profile not found" });
        assert.deepEqual(await profileRow(a.profileId), beforeA); assert.deepEqual(await profileRow(b.profileId), beforeB);
      }
    }
  });
});
test("own legacy profile link is a no-op and preference updates affect only the caller", async t => {
  if (!await ensureDb(t)) return;
  const [a, b] = await seedPair(t); const beforeA = await profileRow(a.profileId); const beforeB = await profileRow(b.profileId);
  await withServer(app(), async base => {
    const linked = await request(base, "/api/users/me", a.userId, "PATCH", { clientProfileId: a.profileId });
    assert.equal(linked.status, 200);
    assert.deepEqual(linked.body, { id: a.userId, clientProfileId: a.profileId, preferredUnit: "kg", preferredHeightUnit: "cm" });
    assert.deepEqual(await profileRow(a.profileId), beforeA);
    const changed = await request(base, "/api/users/me", a.userId, "PATCH", { preferredUnit: "lbs" });
    assert.equal(changed.status, 200); assert.equal(changed.body.preferredUnit, "lbs");
    assert.equal((await profileRow(a.profileId)).preferred_unit, "lbs"); assert.deepEqual(await profileRow(b.profileId), beforeB);
  });
});


test("a caller without a profile cannot take over another user's profile", async t => {
  if (!await ensureDb(t)) return;
  const [a, b] = await seedPair(t);
  await pool.query("DELETE FROM client_profile WHERE id = $1", [b.profileId]);
  const before = await profileRow(a.profileId);
  await withServer(app(), async base => {
    const res = await request(base, "/api/users/me", b.userId, "PATCH", { clientProfileId: a.profileId, preferredUnit: "lbs" });
    assert.equal(res.status, 404); assert.equal(res.body.code, "not_found");
    assert.deepEqual(await profileRow(a.profileId), before);
    assert.equal((await pool.query("SELECT id FROM client_profile WHERE user_id = $1", [b.userId])).rowCount, 0);
  });
});
