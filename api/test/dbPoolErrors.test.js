import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { createPool } from "../src/db.js";

const skip = !(process.env.PGPASSWORD || process.env.DATABASE_URL) && "requires test database";
const connection = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {};

function event(emitter, name) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { emitter.off(name, listener); reject(new Error(`Timed out waiting for ${name}`)); }, 5000);
    function listener(value) { clearTimeout(timeout); resolve(value); }
    emitter.once(name, listener);
  });
}

async function fixture(run) {
  const applicationName = `pool-errors-${randomUUID()}`;
  const warnings = [], breadcrumbs = [], uncaught = [];
  const pool = createPool({ ...connection, application_name: applicationName, max: 1 }, {
    log: { warn: fields => warnings.push(fields) }, addBreadcrumb: value => breadcrumbs.push(value),
  });
  const control = new pg.Client(connection);
  // The control connection is deliberately separate from the pool being killed.
  control.on("error", error => uncaught.push(error));
  const onUncaught = error => uncaught.push(error);
  process.on("uncaughtException", onUncaught);
  try {
    await control.connect();
    await run({ pool, control, warnings, breadcrumbs, applicationName });
    await delay(20);
    assert.deepEqual(uncaught, [], "no unhandled connection errors reach the process");
    assert.equal((await pool.query("SELECT 1 AS alive")).rows[0].alive, 1);
  } finally {
    process.off("uncaughtException", onUncaught);
    await control.end();
    await pool.end();
  }
}

async function terminate(control, applicationName) {
  const result = await control.query(
    "SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE application_name = $1",
    [applicationName],
  );
  assert.equal(result.rowCount, 1, "only the uniquely named test connection is targeted");
  assert.equal(result.rows[0].terminated, true);
}

test("idle backend termination is handled and the pool keeps serving queries", { skip }, () => fixture(async ({ pool, control, warnings, breadcrumbs, applicationName }) => {
  await pool.query("SELECT 1");
  const error = event(pool, "error");
  await terminate(control, applicationName);
  assert.equal((await error).code, "57P01");
  assert.deepEqual(warnings.map(w => w.event), ["db.pool.idle_client_error"]);
  assert.deepEqual(breadcrumbs, [{ category: "db", level: "warning", message: "57P01" }]);
}));

test("checked-out backend termination is handled between queries", { skip }, () => fixture(async ({ pool, control, warnings, applicationName }) => {
  const client = await pool.connect();
  try {
    const error = event(client, "error");
    await terminate(control, applicationName);
    assert.equal((await error).code, "57P01");
    assert.equal(warnings[0].event, "db.client.error");
  } finally { client.release(true); }
}));

test("terminating a running query still rejects the query", { skip }, () => fixture(async ({ pool, control, applicationName }) => {
  const client = await pool.connect();
  try {
    const error = event(client, "error");
    const query = client.query("SELECT pg_sleep(5)");
    // Attach rejection handling immediately, before awaiting any control query.
    const rejected = assert.rejects(query, err => err.code === "57P01" || /connection.*(terminated|closed)/i.test(err.message));
    let running = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await control.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND state='active' AND wait_event='PgSleep'", [applicationName]);
      if (result.rowCount) { running = true; break; }
      await delay(10);
    }
    assert.equal(running, true, "the sleep query must be running before termination");
    await terminate(control, applicationName);
    await rejected;
    await error;
  } finally { client.release(true); }
}));

test("warnings are limited per code for ten seconds and report suppressed counts", async () => {
  let now = 0;
  const warnings = [], breadcrumbs = [];
  const pool = createPool({}, { now: () => now, log: { warn: fields => warnings.push(fields) }, addBreadcrumb: value => breadcrumbs.push(value) });
  try {
    const dropped = Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
    pool.emit("error", dropped); pool.emit("error", dropped);
    assert.equal(warnings.length, 1);
    now = 9999; pool.emit("error", dropped);
    assert.equal(warnings.length, 1);
    pool.emit("error", Object.assign(new Error("connection lost"), { code: "08006" }));
    assert.equal(warnings.length, 2, "another code has an independent window");
    now = 10000; pool.emit("error", dropped);
    assert.deepEqual(warnings.at(-1), { event: "db.pool.idle_client_error", code: "57P01", message: dropped.message, suppressed: 2 });
    assert.equal(breadcrumbs.length, 3);
    assert.deepEqual(Object.keys(warnings[0]).sort(), ["code", "event", "message", "suppressed"]);
  } finally { await pool.end(); }
});
