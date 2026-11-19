import test from "node:test";
import assert from "node:assert/strict";
import { withJobHeartbeat, heartbeatSchedule } from "../jobHeartbeat.js";

function fixture(t, dsn = true) {
  const previous = process.env.SENTRY_DSN;
  if (dsn) process.env.SENTRY_DSN = "test-dsn"; else delete process.env.SENTRY_DSN;
  t.after(() => { if (previous === undefined) delete process.env.SENTRY_DSN; else process.env.SENTRY_DSN = previous; });
  const calls = [], pings = [], warnings = [];
  return { calls, pings, warnings, options: { monitorSlug: "test-job", schedule: "*/5 * * * *",
    checkinMarginMinutes: 10, maxRuntimeMinutes: 4,
    sentry: { captureCheckIn(...args) { calls.push(args); return "check-in-id"; } },
    fetchImpl: async (...args) => { pings.push(args); return { ok: true }; }, log: { warn: fields => warnings.push(fields) } } };
}
test("unconfigured heartbeat runs the callback without sending", async t => {
  const f = fixture(t); delete f.options.monitorSlug;
  assert.equal(await withJobHeartbeat(f.options, async () => 42), 42);
  assert.equal(f.calls.length, 0); assert.equal(f.pings.length, 0);
});
test("slug without DSN does not send Sentry check-ins", async t => {
  const f = fixture(t, false); await withJobHeartbeat(f.options, async () => {}); assert.equal(f.calls.length, 0);
});
test("Sentry start and success share ID and include config and duration", async t => {
  const f = fixture(t); await withJobHeartbeat(f.options, async () => {});
  assert.deepEqual(f.calls[0], [{ monitorSlug: "test-job", status: "in_progress" }, {
    schedule: { type: "crontab", value: "*/5 * * * *" }, checkinMargin: 10, maxRuntime: 4, timezone: "Etc/UTC",
  }]);
  assert.deepEqual(f.calls[1][0], { monitorSlug: "test-job", checkInId: "check-in-id", status: "ok", duration: f.calls[1][0].duration });
  assert.ok(f.calls[1][0].duration >= 0);
});
test("callback failure reports error and preserves the original error", async t => {
  const f = fixture(t), error = Error("job failed");
  f.options.pingUrl = "https://example.test/private-token?secret=hidden";
  await assert.rejects(withJobHeartbeat(f.options, async () => { throw error; }), e => e === error);
  assert.equal(f.calls[1][0].status, "error"); assert.equal(f.calls[1][0].checkInId, "check-in-id");
  assert.equal(f.pings[0][0], "https://example.test/private-token/fail?secret=hidden");
});
for (const mode of ["timeout", "500", "sentry"]) test(`monitoring ${mode} failure does not fail a job or log credentials`, async t => {
  const f = fixture(t); f.options.pingUrl = "https://example.test/private-token";
  if (mode === "sentry") f.options.sentry.captureCheckIn = () => { throw Error("private-token"); };
  else f.options.fetchImpl = async () => { if (mode === "timeout") throw new DOMException("private-token", "TimeoutError"); return { ok: false, status: 500 }; };
  assert.equal(await withJobHeartbeat(f.options, async () => 7), 7);
  assert.ok(f.warnings.length); assert.ok(!JSON.stringify(f.warnings).includes("private-token"));
});
test("ping success is GET with a five-second abort signal", async t => {
  const f = fixture(t, false); f.options.pingUrl = "https://example.test/ping/";
  await withJobHeartbeat(f.options, async () => {});
  assert.equal(f.pings[0][0], f.options.pingUrl); assert.equal(f.pings[0][1].method, "GET");
  assert.ok(f.pings[0][1].signal instanceof AbortSignal);
});
test("monitor failures while reporting a failed job preserve that job's error", async t => {
  const f = fixture(t); f.options.pingUrl = "https://example.test/ping";
  f.options.fetchImpl = async () => { throw Error("monitor down"); };
  const error = Error("original"); await assert.rejects(withJobHeartbeat(f.options, async () => { throw error; }), e => e === error);
});
test("referral schedules cover default, fractional and long intervals", () => {
  assert.equal(heartbeatSchedule(900000).schedule, "*/15 * * * *");
  assert.equal(heartbeatSchedule(3600000).schedule, "0 */1 * * *");
  assert.equal(heartbeatSchedule(86400000).schedule, "0 0 * * *");
  assert.ok(heartbeatSchedule(95000).checkinMarginMinutes >= 2);
});
