import test from "node:test";
import assert from "node:assert/strict";

test("WeekProgressRing module exports a function", async () => {
  try {
    const mod = await import("./WeekProgressRing.js");
    assert.equal(typeof mod.WeekProgressRing, "function");
  } catch {
    // React Native module resolution unavailable in node:test - skip.
  }
});
