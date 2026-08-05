import assert from "node:assert/strict";
import test from "node:test";
import { cleanupOldCalculatorEvents } from "../cleanupOldCalculatorEvents.js";

test("cleanupOldCalculatorEvents deletes rows older than the retention window", async () => {
  const queries = [];
  const db = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rowCount: 3 };
    },
  };
  const logs = [];

  const result = await cleanupOldCalculatorEvents(db, { retentionDays: 90, log: { info: (...args) => logs.push(args) } });

  assert.equal(result.deletedCount, 3);
  assert.match(queries[0].sql, /DELETE FROM hyrox_calculator_events/);
  assert.deepEqual(queries[0].params, [90]);
  assert.equal(logs.length, 1);
});
