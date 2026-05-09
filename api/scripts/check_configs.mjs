#!/usr/bin/env node
/**
 * compiledConfig validation smoke check.
 *
 * Fetches every active program_generation_config row from the DB, assembles
 * each into a compiledConfig object via resolveCompiledConfig, and runs
 * validateCompiledConfig against it. Exits 0 on all-pass, 1 on any failure,
 * 2 on configuration error.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/check_configs.mjs
 *   npm run qa:config
 *
 * Local docker-compose:
 *   DATABASE_URL=postgres://app:app@localhost:5432/app npm run qa:config
 */

import "dotenv/config";
import pg from "pg";
import { resolveCompiledConfig } from "../engine/resolveCompiledConfig.js";
import { validateCompiledConfig, ConfigValidationError } from "../engine/configValidation.js";

const { Pool } = pg;

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(2);
}

function createPool(useSsl) {
  return new Pool({
    connectionString: DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 1,
  });
}

async function run() {
  let pool = createPool(true);
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    const message = err?.message || String(err);
    if (!message.includes("does not support SSL")) {
      console.error(`ERROR: Could not connect to database: ${message}`);
      process.exit(2);
    }
    await pool.end().catch(() => {});
    pool = createPool(false);
    try {
      client = await pool.connect();
    } catch (retryErr) {
      console.error(`ERROR: Could not connect to database: ${retryErr.message}`);
      process.exit(2);
    }
  }

  let configRows;
  try {
    const result = await client.query(`
      SELECT config_key, program_type, schema_version
      FROM program_generation_config
      WHERE is_active = TRUE
      ORDER BY config_key ASC
    `);
    configRows = result.rows;
  } catch (err) {
    console.error(`ERROR: Could not fetch configs: ${err.message}`);
    client.release();
    await pool.end();
    process.exit(2);
  }

  if (configRows.length === 0) {
    console.error("ERROR: No active program_generation_config rows found - seed migrations may not have run");
    client.release();
    await pool.end();
    process.exit(2);
  }

  const results = [];
  for (const row of configRows) {
    try {
      const compiled = await resolveCompiledConfig(client, {
        programType: row.program_type,
        schemaVersion: row.schema_version ?? 1,
        request: { config_key: row.config_key },
      });
      validateCompiledConfig(compiled);
      results.push({ key: row.config_key, status: "PASS", errors: [] });
    } catch (err) {
      const errors = err instanceof ConfigValidationError
        ? err.details
        : [err?.message || String(err)];
      results.push({ key: row.config_key, status: "FAIL", errors });
    }
  }

  client.release();
  await pool.end();

  const nameWidth = Math.max(...results.map((result) => result.key.length));
  const divider = "-".repeat(nameWidth + 12);

  console.log("\ncompiledConfig validation");
  console.log(divider);

  let failCount = 0;
  for (const result of results) {
    const pass = result.status === "PASS";
    const marker = pass ? "OK" : "XX";
    const label = result.key.padEnd(nameWidth + 2);
    console.log(`  ${marker} ${label} ${result.status}`);
    if (!pass) {
      for (const error of result.errors) {
        console.log(`     - ${error}`);
      }
      failCount++;
    }
  }

  console.log(divider);

  if (failCount > 0) {
    console.error(`\n  ${failCount} config(s) FAILED validation - fix the seed migration before deploying.\n`);
    process.exit(1);
  }

  console.log(`\n  All ${results.length} configs valid.\n`);
}

run().catch((err) => {
  console.error(`ERROR: Unexpected failure: ${err.message}`);
  process.exit(1);
});
