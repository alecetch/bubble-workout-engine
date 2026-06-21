import assert from "node:assert/strict";
import test from "node:test";
import { lookupHyroxEventByKey } from "../hyroxEventsService.js";

function mockPool(rowsByKey) {
  return {
    async query(_sql, params) {
      return { rows: rowsByKey.get(params[0]) ? [rowsByKey.get(params[0])] : [] };
    },
  };
}

test("lookupHyroxEventByKey returns event date details for known key", async () => {
  const pool = mockPool(new Map([
    ["2025 London Excel", {
      start_date: new Date("2025-12-04T00:00:00.000Z"),
      end_date: new Date("2025-12-07T00:00:00.000Z"),
      event_name: "HYROX London Excel",
    }],
  ]));

  assert.deepEqual(await lookupHyroxEventByKey(pool, "2025 London Excel"), {
    startDate: "2025-12-04",
    endDate: "2025-12-07",
    eventName: "HYROX London Excel",
  });
});

test("lookupHyroxEventByKey returns null for unknown key", async () => {
  const pool = mockPool(new Map());
  assert.equal(await lookupHyroxEventByKey(pool, "2025 Unknown"), null);
});

test("lookupHyroxEventByKey returns null dates when row dates are null", async () => {
  const pool = mockPool(new Map([
    ["2025 Stockholm", {
      start_date: null,
      end_date: null,
      event_name: "HYROX Stockholm",
    }],
  ]));

  assert.deepEqual(await lookupHyroxEventByKey(pool, "2025 Stockholm"), {
    startDate: null,
    endDate: null,
    eventName: "HYROX Stockholm",
  });
});
