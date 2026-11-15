import test from "node:test";
import assert from "node:assert/strict";
import { reminderDue } from "../reminderSchedule.js";
const due = (time, instant, extra = {}) => reminderDue({ timezone: "UTC", reminder_time_local_hhmm: time, ...extra }, new Date(instant));
test("before, at and after chosen time, including midnight", () => {
  assert.equal(due("13:00", "2026-07-01T12:59Z"), false);
  assert.equal(due("13:00", "2026-07-01T13:00Z"), true);
  assert.equal(due("13:00", "2026-07-01T23:00Z"), true);
  assert.equal(due("08:00", "2026-07-01T00:00Z"), false);
});
test("missing and malformed times default to 08:00", () => {
  for (const time of [undefined, null, "", "24:00", "08:60", "8:00", "bad", 800]) {
    assert.equal(due(time, "2026-07-01T07:59Z"), false);
    assert.equal(due(time, "2026-07-01T08:00Z"), true);
  }
});
test("late times are capped at 23:30", () => {
  assert.equal(due("23:50", "2026-07-01T23:29Z"), false);
  assert.equal(due("23:50", "2026-07-01T23:30Z"), true);
});
test("uses local zones and falls back through reminder zone to UTC", () => {
  const instant = "2026-07-01T00:00Z";
  assert.equal(due("08:00", instant, { timezone: "Australia/Sydney" }), true);
  assert.equal(due("08:00", instant, { timezone: "Europe/London" }), false);
  assert.equal(due("08:00", instant, { timezone: "bad", reminder_timezone: "Australia/Sydney" }), true);
  assert.equal(due("08:00", instant, { timezone: "bad", reminder_timezone: "also bad" }), false);
});
