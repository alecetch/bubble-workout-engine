import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import { adminSyncRouter, getSyncStatus, normalizeSnapshot, SYNC_TARGETS } from "../src/routes/adminSync.js";

const snapshots = SYNC_TARGETS.map((file, i) => ({ file, rows: i + 1,
  content: `-- Generated: today\n-- Row count: ${i + 1}\nSELECT ${i};\n` }));
const diskContent = s => s.content.replace("today", "yesterday").replace(/\n/g, "\r\n");
function fixture(t, matching = true, auditRows = [{ ts: "2026-05-17T10:10:00Z" }]) {
  const migrationsDir = mkdtempSync(join(tmpdir(), "sync-"));
  t.after(() => rmSync(migrationsDir, { recursive: true, force: true }));
  if (matching) for (const s of snapshots) writeFileSync(join(migrationsDir, s.file), diskContent(s));
  const db = { async query(sql) {
    assert.match(sql, /FROM admin_audit_log/);
    assert.doesNotMatch(sql, /MAX\(updated_at\)/);
    return { rows: auditRows };
  } };
  const calls = [];
  const buildSnapshots = async passedDb => { assert.equal(passedDb, db); return snapshots; };
  return { migrationsDir, db, buildSnapshots, calls };
}
async function request(t, f, method = "GET") {
  const app = express();
  Object.assign(app.locals, { pool: f.db, migrationsDir: f.migrationsDir,
    syncSnapshotBuilder: f.buildSnapshots, syncAuditLog: async (_req, entry) => f.calls.push(entry) });
  app.use("/admin", adminSyncRouter);
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/admin/${method === "GET" ? "sync-status" : "sync-all-to-flyway"}`, { method });
  return { status: response.status, body: await response.json() };
}
test("normalization ignores Generated lines and CRLF but retains row counts", () => {
  assert.equal(normalizeSnapshot(snapshots[0].content), normalizeSnapshot(diskContent(snapshots[0])));
  assert.notEqual(normalizeSnapshot(snapshots[0].content), normalizeSnapshot(snapshots[0].content.replace("Row count: 1", "Row count: 2")));
});
test("matching files are clean", async t => {
  const f = fixture(t); const status = await getSyncStatus(f.db, f);
  assert.equal(status.status, "clean"); assert.equal(status.dirty, false);
  assert.equal(status.last_synced_at, "2026-05-17T10:10:00.000Z");
  assert.deepEqual(status.changed_files, []);
  assert.deepEqual(status.files, snapshots.map(s => ({ file: s.file, rows: s.rows, status: "in_sync" })));
});
test("matching files are clean even when never synced", async t => {
  const f = fixture(t, true, []); const status = await getSyncStatus(f.db, f);
  assert.equal(status.status, "clean"); assert.equal(status.dirty, false); assert.equal(status.last_synced_at, null);
});
test("changed body is dirty and names its file", async t => {
  const f = fixture(t); writeFileSync(join(f.migrationsDir, SYNC_TARGETS[0]), "SELECT 99;");
  const status = await getSyncStatus(f.db, f);
  assert.equal(status.status, "dirty"); assert.equal(status.dirty, true);
  assert.equal(status.files[0].status, "changed"); assert.deepEqual(status.changed_files, [SYNC_TARGETS[0]]);
  assert.ok(status.message.includes(SYNC_TARGETS[0]));
});
test("missing file is dirty", async t => {
  const f = fixture(t); unlinkSync(join(f.migrationsDir, SYNC_TARGETS[0]));
  const status = await getSyncStatus(f.db, f);
  assert.equal(status.status, "dirty"); assert.equal(status.dirty, true); assert.equal(status.files[0].status, "missing");
  assert.deepEqual(status.changed_files, [SYNC_TARGETS[0]]);
});
test("absent directory is unavailable without building snapshots", async t => {
  const f = fixture(t); f.migrationsDir = join(f.migrationsDir, "absent");
  f.buildSnapshots = () => assert.fail("must not generate snapshots");
  const status = await getSyncStatus(f.db, f);
  assert.equal(status.status, "unavailable"); assert.equal(status.dirty, false);
  assert.deepEqual(status.files, []); assert.deepEqual(status.changed_files, []);
});
test("GET exposes content comparison response shape", async t => {
  const { status, body } = await request(t, fixture(t)); assert.equal(status, 200);
  assert.equal(typeof body.status, "string"); assert.equal(typeof body.dirty, "boolean");
  assert.ok(Array.isArray(body.files)); assert.ok(Array.isArray(body.changed_files));
  assert.equal(typeof body.message, "string"); assert.equal("latest_edit_at" in body, false);
});
test("POST writes only two differing files and records audit", async t => {
  const f = fixture(t);
  for (const s of snapshots.slice(2)) writeFileSync(join(f.migrationsDir, s.file), "changed");
  const { status, body } = await request(t, f, "POST");
  assert.equal(status, 200); assert.equal(body.ok, true); assert.equal(body.written_count, 2);
  assert.deepEqual(body.files.map(s => s.written), [false, false, true, true]);
  snapshots.forEach((s, i) => assert.equal(readFileSync(join(f.migrationsDir, s.file), "utf8"), i < 2 ? diskContent(s) : s.content));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].action, "sync_all_to_flyway");
  assert.deepEqual(f.calls[0].detail.results, body.files);
});
test("POST creates all four missing files", async t => {
  const f = fixture(t, false); const { status, body } = await request(t, f, "POST");
  assert.equal(status, 200); assert.equal(body.written_count, 4);
  assert.ok(body.files.every(s => s.ok && s.written && s.error === null));
  for (const s of snapshots) assert.equal(readFileSync(join(f.migrationsDir, s.file), "utf8"), s.content);
});
test("read errors take precedence over dirty status", async t => {
  const f = fixture(t); const path = join(f.migrationsDir, SYNC_TARGETS[0]); unlinkSync(path); mkdirSync(path);
  const status = await getSyncStatus(f.db, f);
  assert.equal(status.status, "error"); assert.equal(status.dirty, false);
  assert.equal(status.files[0].status, "error"); assert.equal(typeof status.files[0].error, "string");
  assert.ok(status.message.includes(SYNC_TARGETS[0]));
});
test("unchanged POST still audits without rewriting", async t => {
  const f = fixture(t); const { body } = await request(t, f, "POST");
  assert.equal(body.written_count, 0); assert.equal(f.calls.length, 1);
  for (const s of snapshots) assert.equal(readFileSync(join(f.migrationsDir, s.file), "utf8"), diskContent(s));
});
test("POST reports per-file write failures with 207", async t => {
  const f = fixture(t); f.migrationsDir = join(f.migrationsDir, "absent");
  const { status, body } = await request(t, f, "POST");
  assert.equal(status, 207); assert.equal(body.ok, false); assert.equal(body.written_count, 0);
  assert.ok(body.files.every(s => !s.ok && !s.written && s.error)); assert.equal(f.calls.length, 1);
});
test("snapshot generation failures return 500", async t => {
  const f = fixture(t); f.buildSnapshots = async () => { throw new Error("generation failed"); };
  for (const method of ["GET", "POST"]) assert.equal((await request(t, f, method)).status, 500);
});
