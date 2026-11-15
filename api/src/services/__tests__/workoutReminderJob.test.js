import test from "node:test";
import assert from "node:assert/strict";
import { startWorkoutReminderScheduler, shouldStartReminderScheduler } from "../workoutReminderJob.js";
function fixture({ locked = true, error = false, pending } = {}) {
  const queries = [], logs = []; let releases = 0, runs = 0;
  const client = { async query(sql) { queries.push(sql); return { rows: [{ locked }] }; }, release() { releases++; } };
  const db = { async connect() { return client; }, async query() { runs++; if (pending) await pending; if (error) throw Error("query failed"); return { rows: [] }; } };
  const logger = { info: log => logs.push(log), error: log => logs.push(log) };
  const scheduler = startWorkoutReminderScheduler({ db, notificationService: { send() { throw Error("unexpected send"); } }, logger, intervalMs: 3600000 });
  return { scheduler, queries, logs, get releases() { return releases; }, get runs() { return runs; } };
}
test("scheduler flag requires exactly true", () => {
  assert.equal(shouldStartReminderScheduler({ REMINDER_SCHEDULER_ENABLED: "true" }), true);
  for (const value of [undefined, "false", "TRUE", "1", true]) assert.equal(shouldStartReminderScheduler({ REMINDER_SCHEDULER_ENABLED: value }), false);
});
test("locked tick runs, logs counts, unlocks and releases", async t => {
  const f = fixture(); t.after(f.scheduler.stop);
  await f.scheduler.tick();
  assert.equal(f.runs, 2); assert.equal(f.releases, 1);
  assert.match(f.queries[0], /pg_try_advisory_lock/); assert.match(f.queries[1], /pg_advisory_unlock/);
  assert.equal(f.logs[0].event, "notification.reminder.run");
  assert.equal(f.logs[0].not_due, 0); assert.equal(typeof f.logs[0].duration_ms, "number");
});
test("busy lock skips job without unlocking another owner's lock", async t => {
  const f = fixture({ locked: false }); t.after(f.scheduler.stop);
  await f.scheduler.tick(); assert.equal(f.runs, 0); assert.equal(f.releases, 1); assert.equal(f.queries.length, 1); assert.equal(f.logs.length, 0);
});
test("query errors still unlock and release and log run_error", async t => {
  const f = fixture({ error: true }); t.after(f.scheduler.stop);
  await f.scheduler.tick(); assert.equal(f.releases, 1); assert.match(f.queries[1], /pg_advisory_unlock/);
  assert.deepEqual(f.logs[0], { event: "notification.reminder.run_error", err: "query failed" });
});
test("overlapping and stopped ticks skip", async t => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const f = fixture({ pending }); t.after(f.scheduler.stop);
  const first = f.scheduler.tick(); await new Promise(setImmediate);
  await f.scheduler.tick(); assert.equal(f.runs, 1);
  resolve(); await first; assert.equal(f.runs, 2); assert.equal(f.releases, 1);
  f.scheduler.stop(); await f.scheduler.tick(); assert.equal(f.runs, 2);
});
