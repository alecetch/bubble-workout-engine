import test from "node:test";
import assert from "node:assert/strict";
import { fetchActiveMediaAssets } from "../mediaAssets.js";

test("fetchActiveMediaAssets returns rows and queries active assets", async () => {
  const calls = [];
  const dbClient = {
    async query(sql) {
      calls.push(sql);
      return { rows: [{ id: "a1" }] };
    },
  };

  const rows = await fetchActiveMediaAssets(dbClient);
  assert.deepEqual(rows, [{ id: "a1" }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /FROM public\.media_assets/i);
  assert.match(calls[0], /WHERE is_active = TRUE/i);
});

test("fetchActiveMediaAssets returns [] when query result has no rows", async () => {
  const dbClient = {
    async query() {
      return {};
    },
  };

  const rows = await fetchActiveMediaAssets(dbClient);
  assert.deepEqual(rows, []);
});

test("fetchActiveMediaAssets propagates DB errors", async () => {
  const dbClient = {
    async query() {
      throw new Error("db failed");
    },
  };

  await assert.rejects(() => fetchActiveMediaAssets(dbClient), /db failed/i);
});

test("fetchActiveMediaAssets throws if dbClient missing", async () => {
  await assert.rejects(() => fetchActiveMediaAssets(null), /db client with query\(\) required/i);
});
