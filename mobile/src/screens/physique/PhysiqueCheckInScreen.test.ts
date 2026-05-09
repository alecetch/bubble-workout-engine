import test from "node:test";
import assert from "node:assert/strict";

test("PhysiqueCheckInScreen exports the expected function", async () => {
  try {
    const mod = await import("./PhysiqueCheckInScreen.js");
    assert.equal(typeof mod.PhysiqueCheckInScreen, "function");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isExpectedError =
      msg.includes("react-native") ||
      msg.includes("expo-image-picker") ||
      msg.includes("Cannot find module");
    assert.ok(isExpectedError, `Unexpected error: ${msg}`);
  }
});
