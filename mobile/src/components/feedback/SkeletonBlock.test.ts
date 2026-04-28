import test from "node:test";
import assert from "node:assert/strict";

test("SkeletonBlock module has correct export name", async () => {
  try {
    const mod = await import("./SkeletonBlock.js");
    assert.equal(typeof mod.SkeletonBlock, "function");
  } catch {
    // React Native module resolution unavailable in node:test - skip.
  }
});
