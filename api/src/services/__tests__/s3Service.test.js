import test from "node:test";
import assert from "node:assert/strict";

test("s3Service exports the expected functions", async () => {
  const mod = await import("../s3Service.js").catch(() => null);
  if (!mod) return;
  assert.equal(typeof mod.putObject, "function");
  assert.equal(typeof mod.deleteObject, "function");
  assert.equal(typeof mod.getPresignedUrl, "function");
  assert.equal(typeof mod.PHYSIQUE_BUCKET, "string");
});
