#!/usr/bin/env node
/**
 * Dev-only Program Data Reset
 *
 * Safe usage:
 *   NODE_ENV=development npm run dev:reset-program-data -- --confirm-dev-reset
 *
 * Skip prompt:
 *   NODE_ENV=development npm run dev:reset-program-data -- --confirm-dev-reset --force
 */

import dotenv from "dotenv";
import pg from "pg";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

dotenv.config();

const { Client } = pg;

const TABLES = [
  "generation_run",
  "program",
  "program_calendar_day",
  "program_day",
  "program_exercise",
  "program_week",
  "segment_exercise_log",
  "workout_segment",
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

function assertSafetyGuards() {
  if (process.env.NODE_ENV !== "development") {
    fail("Refusing to run: NODE_ENV must be exactly 'development'.");
  }

  if (!hasArg("--confirm-dev-reset")) {
    fail("Refusing to run: missing required flag --confirm-dev-reset.");
  }

  if (process.env.FLY_APP_NAME) {
    fail("Refusing to run: FLY_APP_NAME is set (Fly.io environment detected).");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail("Refusing to run: DATABASE_URL is required.");
  }

  let hostname = "";
  try {
    const parsed = new URL(databaseUrl);
    hostname = (parsed.hostname ?? "").toLowerCase();
  } catch {
    fail("Refusing to run: DATABASE_URL is not a valid URL.");
  }

  if (hostname.includes("prod") || hostname.includes("staging")) {
    fail(`Refusing to run: DATABASE_URL host appears non-dev (${hostname}).`);
  }
}

async function confirmIfNeeded() {
  if (hasArg("--force")) return;

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Type RESET to continue: ");
    if (answer !== "RESET") {
      throw new Error("Confirmation failed. Aborting reset.");
    }
  } finally {
    rl.close();
  }
}

async function fetchCurrentDatabaseName(client) {
  const result = await client.query("SELECT current_database() AS name");
  return result.rows[0]?.name ?? "(unknown)";
}

async function countRowsByTable(client) {
  const counts = {};
  for (const table of TABLES) {
    const result = await client.query(`SELECT COUNT(*)::bigint AS cnt FROM ${table}`);
    counts[table] = Number(result.rows[0]?.cnt ?? 0);
  }
  return counts;
}

async function resetIdSequences(client) {
  for (const table of TABLES) {
    const seqResult = await client.query(
      "SELECT pg_get_serial_sequence($1, 'id') AS seq_name",
      [table],
    );
    const sequenceName = seqResult.rows[0]?.seq_name;
    if (!sequenceName) continue;
    await client.query(`ALTER SEQUENCE ${sequenceName} RESTART WITH 1`);
  }
}

async function run() {
  assertSafetyGuards();

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();

    const dbName = await fetchCurrentDatabaseName(client);
    console.log(`Connected to database: ${dbName}`);
    await confirmIfNeeded();

    await client.query("BEGIN");
    const countsBefore = await countRowsByTable(client);

    await client.query("SAVEPOINT before_truncate");
    try {
      await client.query(`
        TRUNCATE TABLE
          segment_exercise_log,
          workout_segment,
          program_exercise,
          program_calendar_day,
          program_day,
          program_week,
          program,
          generation_run
        RESTART IDENTITY CASCADE
      `);
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT before_truncate");

      // Ordered fallback for environments where TRUNCATE is blocked.
      await client.query("DELETE FROM segment_exercise_log");
      await client.query("DELETE FROM workout_segment");
      await client.query("DELETE FROM program_exercise");
      await client.query("DELETE FROM program_calendar_day");
      await client.query("DELETE FROM program_day");
      await client.query("DELETE FROM program_week");
      await client.query("DELETE FROM program");
      await client.query("DELETE FROM generation_run");
      await resetIdSequences(client);
    }

    await client.query("COMMIT");

    console.log("\u2714 Dev program data reset complete.");
    console.log("Tables cleared:");
    for (const table of TABLES) {
      console.log(`- ${table}`);
    }
    console.log("Row counts cleared:");
    for (const table of TABLES) {
      console.log(`- ${table}: ${countsBefore[table]}`);
    }

    process.exit(0);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback-on-failure error
    }
    console.error("Reset failed.");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch {
      // ignore close error
    }
  }
}

await run();
