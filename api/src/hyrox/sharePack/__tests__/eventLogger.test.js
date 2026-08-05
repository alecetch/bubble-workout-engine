import assert from "node:assert/strict";
import test from "node:test";
import { logCalculatorEvent, safeLogCalculatorEvent } from "../eventLogger.js";

test("logCalculatorEvent inserts the expected calculator event row", async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 1 }; } };

  await logCalculatorEvent(db, {
    sessionId: "session-1",
    submissionId: "11111111-1111-4111-8111-111111111111",
    eventName: "asset_downloaded",
    status: "ok",
    cacheHit: true,
    durationMs: 42.4,
    metadata: { assetType: "zip" },
  });

  assert.match(calls[0].sql, /INSERT INTO hyrox_calculator_events/);
  assert.equal(calls[0].params[1], "session-1");
  assert.equal(calls[0].params[2], "11111111-1111-4111-8111-111111111111");
  assert.equal(calls[0].params[3], "asset_downloaded");
  assert.equal(calls[0].params[4], "ok");
  assert.equal(calls[0].params[5], true);
  assert.equal(calls[0].params[6], 42);
  assert.deepEqual(JSON.parse(calls[0].params[7]), { assetType: "zip" });
});

test("safeLogCalculatorEvent catches and logs DB failures", async () => {
  const errors = [];
  const db = { query: async () => { throw new Error("db down"); } };

  await assert.doesNotReject(() => safeLogCalculatorEvent(db, { eventName: "asset_downloaded" }, { error: (...args) => errors.push(args) }));

  assert.equal(errors.length, 1);
});
