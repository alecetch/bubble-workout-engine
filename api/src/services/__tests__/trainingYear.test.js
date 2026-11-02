import test from "node:test";
import assert from "node:assert/strict";
import { localDateInZone, daysInYear, dayOfYear, targetWindow, clubThresholds, paceSummary, nextMilestone } from "../trainingYear.js";
import { resolveLocalDate, ValidationError } from "../trainingDayLedger.js";

for (const [year, joinLocalDate, target] of [
  [2026, "2026-10-01", 50], [2026, "2026-01-01", 200], [2026, "2025-10-01", 200],
  [2028, "2028-07-01", Math.round(200 * 184 / 366)], [2026, "2027-01-01", 0],
]) test(`target window ${year} joined ${joinLocalDate}`, () => {
  const window = targetWindow({ year, joinLocalDate });
  assert.equal(window.target, target);
  assert.equal(window.proRated, target !== 200);
});

test("calendar helpers handle leap years and local midnight", () => {
  assert.equal(daysInYear(2028), 366);
  assert.equal(dayOfYear("2028-03-01"), 61);
  assert.equal(localDateInZone("2026-03-01T03:30:00Z", "America/New_York"), "2026-02-28");
  assert.equal(localDateInZone("2026-03-01T03:30:00Z", "invalid"), "2026-03-01");
});

test("clubs scale with first-year ratio, with minimum one", () => {
  assert.deepEqual(clubThresholds(92 / 365).map(club => club.threshold), [25, 50, 63, 76]);
  assert.deepEqual(clubThresholds(0).map(club => club.threshold), [1, 1, 1, 1]);
});

test("pace uses inclusive target window and unrounded tolerance", () => {
  const window = targetWindow({ year: 2026, joinLocalDate: "2026-10-01" });
  const summary = count => paceSummary({ count, window, todayLocal: "2026-10-01", last28DaysCount: 4 });
  assert.equal(summary(0).pace_status, "on_pace");
  assert.equal(summary(2).pace_status, "ahead");
  assert.equal(summary(0).expected_to_date, 0.5);
  assert.equal(paceSummary({ count: 0, window, todayLocal: "2026-10-04", last28DaysCount: 0 }).pace_status, "behind");
  assert.equal(summary(2).projected_year_end, 15);
  assert.equal(paceSummary({ count: 50, window, todayLocal: "2027-01-01", last28DaysCount: 28 }).projected_year_end, 50);
});

test("no window/future window has zero elapsed pace", () => {
  for (const joinLocalDate of ["2027-01-01", "2026-10-01"]) {
    const window = targetWindow({ year: 2026, joinLocalDate });
    assert.equal(paceSummary({ count: 0, window, todayLocal: "2026-01-01", last28DaysCount: 0 }).expected_to_date, 0);
  }
  assert.equal(nextMilestone(0), 1);
  assert.equal(nextMilestone(25), 50);
  assert.equal(nextMilestone(300), null);
});

test("date resolution validates strict today/yesterday and valid zone fallback", () => {
  const args = { now: new Date("2026-03-01T03:30:00Z"), fallbackTimeZone: "America/New_York" };
  assert.deepEqual(resolveLocalDate(args), { localDate: "2026-02-28", timeZone: "America/New_York" });
  assert.equal(resolveLocalDate({ ...args, requestedLocalDate: "2026-02-27", requestedTimeZone: "bad" }).localDate, "2026-02-27");
  for (const requestedLocalDate of ["2026-02-26", "2026-03-01", "2026-02-30", "2026-2-28", null, []]) {
    assert.throws(() => resolveLocalDate({ ...args, requestedLocalDate }), ValidationError);
  }
});
