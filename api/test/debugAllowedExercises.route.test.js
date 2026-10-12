import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pool, ensureDb, seedPair, appWithLogging, withServer } from "./helpers/profileOwnership.js";
const { requireAuth } = await import("../src/middleware/requireAuth.js");
const { adminOnly } = await import("../src/middleware/chains.js");
const { debugAllowedExercisesRouter } = await import("../src/routes/debugAllowedExercises.js");
after(() => pool.end());
function app() {
  const app = appWithLogging();
  app.get("/api/client_profile/:id/allowed_exercises", (_req, res) => res.sendStatus(404));
  app.use("/api", requireAuth);
  app.use("/admin/debug", ...adminOnly, debugAllowedExercisesRouter);
  return app;
}
test("debug route is removed from public /api and requires internal admin auth", async () => {
  const serverSource = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(serverSource, /app\.use\("\/admin\/debug", \.\.\.adminOnly, debugAllowedExercisesRouter\)/);
  assert.doesNotMatch(serverSource, /app\.use\("\/api", debugAllowedExercisesRouter\)/);
  const retiredMount = 'app.get("/api/client_profile/:id/allowed_exercises", (_req, res) => res.sendStatus(404));';
  assert.ok(serverSource.includes(retiredMount));
  assert.ok(serverSource.indexOf(retiredMount) < serverSource.indexOf('app.use("/api", ...userAuth, physiqueReadRouter)'));
  await withServer(app(), async base => {
    const path = `/client_profile/${randomUUID()}/allowed_exercises`;
    assert.equal((await fetch(base + "/api" + path)).status, 404);
    const denied = await fetch(base + "/admin/debug" + path);
    assert.equal(denied.status, 401); assert.equal((await denied.json()).code, "unauthorized");
  });
});
test("admin token can read allowed-exercise diagnostics", async t => {
  if (!await ensureDb(t)) return;
  const [a] = await seedPair(t); const previous = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "profile-debug-admin-test-token";
  try {
    await withServer(app(), async base => {
      const res = await fetch(`${base}/admin/debug/client_profile/${a.profileId}/allowed_exercises`, { headers: { "X-Internal-Token": process.env.INTERNAL_API_TOKEN } });
      assert.equal(res.status, 200); const body = await res.json();
      assert.equal(body.ok, true); assert.equal(body.client_profile_id, a.profileId); assert.ok(Array.isArray(body.allowed_ids_preview));
    });
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = previous;
  }
});
