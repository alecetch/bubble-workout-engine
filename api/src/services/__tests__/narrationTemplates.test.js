import test from "node:test";
import assert from "node:assert/strict";
import { fetchActiveNarrationTemplates } from "../narrationTemplates.js";

test("fetchActiveNarrationTemplates queries active templates and returns rows", async () => {
  const calls = [];
  const dbClient = {
    async query(sql) {
      calls.push({ sql });
      return {
        rows: [{ template_id: "intro_1", priority: 1 }],
      };
    },
  };

  const rows = await fetchActiveNarrationTemplates(dbClient);
  assert.deepEqual(rows, [{ template_id: "intro_1", priority: 1 }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM public\.narration_template/i);
  assert.match(calls[0].sql, /WHERE is_active = TRUE/i);
});

test("fetchActiveNarrationTemplates returns an empty array when query rows are missing", async () => {
  const dbClient = {
    async query() {
      return {};
    },
  };

  const rows = await fetchActiveNarrationTemplates(dbClient);
  assert.deepEqual(rows, []);
});

test("fetchActiveNarrationTemplates propagates query errors", async () => {
  const dbClient = {
    async query() {
      throw new Error("db down");
    },
  };

  await assert.rejects(() => fetchActiveNarrationTemplates(dbClient), /db down/i);
});
