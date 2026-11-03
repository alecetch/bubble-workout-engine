import test from "node:test";
import assert from "node:assert/strict";
import { bestMonth, busiestWeekday, longestOnPaceWeeks } from "../yearRecap.js";
import { targetWindow, offsetLocalDate } from "../trainingYear.js";

test("best month counts distinct dates and gives the earlier month a tie", () => {
  assert.deepEqual(bestMonth(["2026-02-01", "2026-01-03", "2026-02-01"]), { month: 1, count: 1 });
  assert.deepEqual(bestMonth(["2026-02-01", "2026-02-02", "2026-01-03"]), { month: 2, count: 2 });
  assert.equal(bestMonth([]), null);
});
test("busiest weekday counts dates once and breaks ties Monday first", () => {
  assert.equal(busiestWeekday(["2026-01-06", "2026-01-05", "2026-01-05"]), "Monday");
  assert.equal(busiestWeekday(["2026-01-06", "2026-01-13", "2026-01-05"]), "Tuesday");
  assert.equal(busiestWeekday([]), null);
});
test("on-pace runs reset after a below-pace week and include the closed year-end partial week", () => {
  const dates = [1, 4, 12, 13, 14, 15, 20, 21].map(day => `2026-01-${String(day).padStart(2, "0")}`);
  const window = { start: "2026-01-01", end: "2026-01-31", target: 8 };
  assert.equal(longestOnPaceWeeks({ dates, window }), 3);
  assert.equal(longestOnPaceWeeks({ dates, window, throughDate: "2026-01-24" }), 1);
});
test("pro-rated windows start mid-ISO-week and do not count pre-join weeks", () => {
  const window = targetWindow({ year: 2026, joinLocalDate: "2026-10-01" });
  const dates = Array.from({ length: 50 }, (_, day) => offsetLocalDate("2026-10-01", day));
  assert.equal(window.target, 50);
  assert.equal(longestOnPaceWeeks({ dates, window }), 14);
});
test("weekly comparisons use unrounded expectations rather than the display's one decimal", () => {
  const window = targetWindow({ year: 2026, joinLocalDate: "2020-01-01" });
  const dates = Array.from({ length: 6 }, (_, day) => offsetLocalDate("2026-01-01", day));
  assert.equal(longestOnPaceWeeks({ dates, window, throughDate: "2026-01-11" }), 1);
});
test("empty years, out-of-window dates and duplicate dates do not inflate an on-pace run", () => {
  const window = { start: "2026-12-16", end: "2026-12-31", target: 4 };
  assert.equal(longestOnPaceWeeks({ dates: [], window }), 0);
  assert.equal(longestOnPaceWeeks({ dates: ["2025-12-16"], window }), 0);
  const dates = ["2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19"];
  assert.equal(longestOnPaceWeeks({ dates: [...dates, ...dates], window }), 3);
});
