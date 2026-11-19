import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CHECKED_TABLES, verifyRestore, restoreConnectionConfig } from "../verify-restore.mjs";
const { Client } = createRequire(new URL("../../api/package.json", import.meta.url))("pg");
const skip = !(process.env.PGPASSWORD || process.env.DATABASE_URL) && "requires local test database";
function baseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL("postgresql://localhost");
  url.hostname = process.env.PGHOST || "127.0.0.1"; url.port = process.env.PGPORT || "5432";
  url.username = process.env.PGUSER || "workout"; url.password = process.env.PGPASSWORD || "";
  url.pathname = process.env.PGDATABASE || "workout_test"; url.searchParams.set("sslmode", "disable");
  return url.toString();
}
async function fixture(t) {
  // Two isolated schemas avoid needing CREATE DATABASE permission in CI. URL
  // search_path options exercise the same real connections as the production CLI.
  const client = new Client(restoreConnectionConfig(baseUrl())); client.on("error", () => {}); await client.connect();
  const schemas = [0, 1].map(index => `restore_${randomUUID().replaceAll("-", "")}_${index}`);
  t.after(async () => { try { for (const schema of schemas) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await client.end(); } });
  for (const schema of schemas) {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`CREATE TABLE "${schema}".flyway_schema_history (installed_rank int, version text, success boolean)`);
    await client.query(`INSERT INTO "${schema}".flyway_schema_history VALUES (1,'2.10',true),(2,null,true),(3,'99',false)`);
    for (const table of CHECKED_TABLES) {
      const column = table.timestamps?.[0];
      await client.query(`CREATE TABLE "${schema}"."${table.name}" (email text${column ? `, "${column}" timestamptz DEFAULT '2026-11-18T12:00:00Z'` : ""})`);
      await client.query(`INSERT INTO "${schema}"."${table.name}" (email) VALUES ('private@example.test'),('second@example.test')`);
    }
  }
  const url = schema => { const url = new URL(baseUrl()); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); };
  return { client, targetUrl: url(schemas[0]), referenceUrl: url(schemas[1]),
    target: `"${schemas[0]}"`, reference: `"${schemas[1]}"` };
}
test("identical snapshots and the same database pass including repeatable Flyway rows", { skip }, async t => {
  const f = await fixture(t);
  assert.equal((await verifyRestore(f)).ok, true);
  const result = await verifyRestore({ targetUrl: f.targetUrl, referenceUrl: f.targetUrl });
  assert.equal(result.ok, true); assert.equal(result.target.version, "2.10");
  assert.equal(result.target.tables.length, CHECKED_TABLES.length);
});
test("empty required table fails", { skip }, async t => {
  const f = await fixture(t); await f.client.query(`DELETE FROM ${f.target}.app_user`);
  const result = await verifyRestore(f); assert.equal(result.ok, false); assert.match(result.errors.join(), /Empty required table app_user/);
});
test("missing table fails", { skip }, async t => {
  const f = await fixture(t); await f.client.query(`DROP TABLE ${f.target}.media_assets`);
  const result = await verifyRestore(f); assert.equal(result.ok, false); assert.match(result.errors.join(), /Missing table media_assets/);
});
test("older numeric Flyway version fails even when string sorting would disagree", { skip }, async t => {
  const f = await fixture(t); await f.client.query(`UPDATE ${f.target}.flyway_schema_history SET version='2.9' WHERE version='2.10'`);
  const result = await verifyRestore(f); assert.equal(result.ok, false); assert.match(result.errors.join(), /older than reference/);
});
test("different reference-table counts fail", { skip }, async t => {
  const f = await fixture(t); await f.client.query(`INSERT INTO ${f.target}.exercise_catalogue(email) VALUES ('extra@example.test')`);
  assert.match((await verifyRestore(f)).errors.join(), /Reference count differs: exercise_catalogue/);
});
test("fewer user rows pass with a note while extra user rows fail", { skip }, async t => {
  const f = await fixture(t); await f.client.query(`DELETE FROM ${f.target}.app_user WHERE email='second@example.test'`);
  const fewer = await verifyRestore(f); assert.equal(fewer.ok, true); assert.match(fewer.notes.join(), /Fewer user rows/);
  await f.client.query(`INSERT INTO ${f.target}.app_user(email) VALUES ('extra@example.test'),('another@example.test')`);
  const extra = await verifyRestore(f); assert.equal(extra.ok, false); assert.match(extra.errors.join(), /more user rows/);
});
test("the actual verification connection rejects INSERT and stays read-only", { skip }, async t => {
  const f = await fixture(t); let checked = false;
  const result = await verifyRestore({ ...f, onConnected: async client => {
    await assert.rejects(client.query("INSERT INTO app_user(email) VALUES ('never@example.test')"), { code: "25006" });
    assert.equal((await client.query("SHOW default_transaction_read_only")).rows[0].default_transaction_read_only, "on"); checked = true;
  } });
  assert.equal(checked, true); assert.equal(result.ok, true);
});
test("CLI JSON contains aggregates, not personal data or URLs, and uses nonzero failure exits", { skip }, async t => {
  const f = await fixture(t); const script = fileURLToPath(new URL("../verify-restore.mjs", import.meta.url));
  const run = () => spawnSync(process.execPath, [script, "--target", f.targetUrl, "--reference", f.referenceUrl, "--json"], { encoding: "utf8" });
  const success = run(); assert.equal(success.status, 0, success.stderr);
  assert.ok(!success.stdout.includes("@")); assert.ok(!success.stdout.includes("private")); assert.ok(!success.stdout.includes("postgresql:"));
  const result = JSON.parse(success.stdout); assert.equal(result.ok, true); assert.ok(result.target.tables.some(table => table.latest));
  await f.client.query(`DELETE FROM ${f.target}.app_user`);
  const failure = run(); assert.equal(failure.status, 1); assert.equal(JSON.parse(failure.stdout).ok, false);
});
test("timestamp fallback handles older log schemas", { skip }, async t => {
  const f = await fixture(t); await f.client.query(`ALTER TABLE ${f.target}.segment_exercise_log RENAME COLUMN updated_at TO created_at`);
  const result = await verifyRestore(f); assert.equal(result.ok, true);
  assert.ok(result.target.tables.find(table => table.name === "segment_exercise_log").latest);
});
test("connection errors and invalid CLI inputs do not reveal supplied URLs", async () => {
  const result = await verifyRestore({ targetUrl: "invalid-private@example.test" });
  assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes("@"));
});
test("local defaults and explicit SSL modes are honored", () => {
  assert.equal(restoreConnectionConfig("postgres://localhost/test").ssl, false);
  assert.equal(restoreConnectionConfig("postgres://remote.test/test?sslmode=disable").ssl, false);
  assert.deepEqual(restoreConnectionConfig("postgres://localhost/test?sslmode=require").ssl, { rejectUnauthorized: false });
  assert.deepEqual(restoreConnectionConfig("postgres://remote.test/test").ssl, { rejectUnauthorized: false });
});
