import test from "node:test";
import assert from "node:assert/strict";
import { reminderCalendar, reminderYearProgress } from "../reminderYearProgress.js";

test("calendar uses valid user zone, then reminder zone, then UTC", () => {
  const instant = new Date("2027-01-01T01:00Z");
  const user = { created_at: "2020-01-01", timezone: "Pacific/Honolulu", reminder_timezone: "Pacific/Kiritimati" };
  assert.equal(reminderCalendar(user, instant).todayLocal, "2026-12-31");
  assert.equal(reminderCalendar({ ...user, timezone: "invalid" }, instant).todayLocal, "2027-01-01");
  assert.equal(reminderCalendar({ ...user, timezone: "invalid", reminder_timezone: "invalid" }, instant).todayLocal, "2027-01-01");
});

test("batch uses local-year bounds and pro-rated club display names", async () => {
  const users = [{ user_id: "a", created_at: "2020-01-01", onboarding_completed_at: "2026-10-01T12:00Z", timezone: "UTC" },
    { user_id: "b", created_at: "2020-01-01", timezone: "Pacific/Honolulu" }];
  let calls = 0;
  const db = { async query(sql, params) {
    calls++;
    assert.match(sql, /COUNT\(DISTINCT ts.local_date\)/);
    assert.deepEqual(params, [["a", "b"], ["2026-01-01", "2026-01-01"], ["2026-12-31", "2026-12-31"], ["2026-11-01", "2026-10-31"]]);
    return { rows: [{ user_id: "a", count: 24, recent_count: 4 }, { user_id: "b", count: 120, recent_count: 10 }] };
  } };
  const result = await reminderYearProgress(db, users, new Date("2026-11-01T01:00Z"));
  assert.equal(calls, 1);
  assert.equal(result.get("a").target, 50);
  assert.deepEqual(result.get("a").nextMilestone, { threshold: 25, displayName: "Club 100", club100Threshold: 25 });
});

test("empty job does not query counts", async () => {
  assert.equal((await reminderYearProgress({ query() { throw Error("unexpected"); } }, [], new Date())).size, 0);
});
