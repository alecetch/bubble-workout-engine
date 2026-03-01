import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchProgramGenerationConfigByKey,
  fetchProgramGenerationConfigs,
} from "../programGenerationConfig.js";

test("fetchProgramGenerationConfigByKey queries active row by key and returns first row", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [{ config_key: "hypertrophy_default_v1", schema_version: 1 }],
      };
    },
  };

  const row = await fetchProgramGenerationConfigByKey(db, " hypertrophy_default_v1 ");
  assert.equal(row.config_key, "hypertrophy_default_v1");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE is_active = TRUE/i);
  assert.match(calls[0].sql, /config_key = \$1/i);
  assert.match(calls[0].sql, /ORDER BY schema_version DESC NULLS LAST, config_key ASC/i);
  assert.deepEqual(calls[0].params, ["hypertrophy_default_v1"]);
});

test("fetchProgramGenerationConfigs queries by program_type and schema_version or null", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [{ config_key: "a" }, { config_key: "b" }],
      };
    },
  };

  const rows = await fetchProgramGenerationConfigs(db, "hypertrophy", "1");
  assert.equal(rows.length, 2);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE is_active = TRUE/i);
  assert.match(calls[0].sql, /program_type = \$1/i);
  assert.match(calls[0].sql, /\(schema_version = \$2 OR schema_version IS NULL\)/i);
  assert.match(calls[0].sql, /ORDER BY schema_version DESC NULLS LAST, config_key ASC/i);
  assert.deepEqual(calls[0].params, ["hypertrophy", 1]);
});

test("fetchProgramGenerationConfigs throws for invalid schemaVersion", async () => {
  const db = { async query() { return { rows: [] }; } };
  await assert.rejects(
    () => fetchProgramGenerationConfigs(db, "hypertrophy", "abc"),
    /schemaVersion must be a finite integer/i,
  );
});

