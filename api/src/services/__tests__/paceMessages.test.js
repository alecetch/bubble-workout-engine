import test from "node:test";
import assert from "node:assert/strict";
import { choosePaceMessage, dailyReminderBody } from "../paceMessages.js";

const base = { count: 147, target: 200, paceDelta: -2, todayLocal: "2026-10-01", windowEnd: "2026-12-31",
  nextMilestone: { threshold: 150, displayName: "Club 150" }, reachedTarget: false };
const cases = [
  ["December target takes priority", { todayLocal: "2026-12-07", count: 186, paceDelta: -8 }, "december", "14 to go for 200, with 25 days left. Plenty of time."],
  ["December achievable Club 100", { todayLocal: "2026-12-07", count: 94, paceDelta: -90 }, "december_club", "Club 100 is in reach — 6 to go."],
  ["December impossible target and club", { todayLocal: "2026-12-30", count: 90 }, null],
  ["December club already reached", { todayLocal: "2026-12-30", count: 101 }, null],
  ["December inclusive last day", { todayLocal: "2026-12-31", count: 199 }, "december", "1 to go for 200, with 1 day left. Plenty of time."],
  ["pro-rated December", { todayLocal: "2026-12-01", count: 40, target: 50 }, "december", "10 to go for 50, with 31 days left. Plenty of time."],
  ["behind three takes priority", { paceDelta: -3 }, "behind", "You're 3 behind pace. Three extra sessions this week and you're back."],
  ["rounds up and caps fortnight sessions", { paceDelta: -3.2 }, "behind", "You're 4 behind pace. Three extra sessions this fortnight will help close the gap."],
  ["large gap is not an impossible ask", { paceDelta: -80 }, "behind", "You're 80 behind pace. Three extra sessions this fortnight will help close the gap."],
  ["milestone close", {}, "milestone", "Day 147. Club 150 is 3 away."],
  ["club display name", { count: 61, nextMilestone: { threshold: 63, displayName: "Club 250" } }, "milestone", "Day 61. Club 250 is 2 away."],
  ["two behind without nearby milestone", { nextMilestone: null }, null],
  ["ahead even near milestone", { paceDelta: 3 }, null],
  ["on pace even in December", { paceDelta: 0, todayLocal: "2026-12-07" }, null],
  ["reached target", { count: 200, reachedTarget: true, paceDelta: 0, todayLocal: "2026-12-07" }, null],
];
for (const [name, overrides, kind, body] of cases) test(name, () => {
  const result = choosePaceMessage({ ...base, ...overrides });
  assert.equal(result?.kind ?? null, kind);
  if (kind) { assert.equal(result.body, body); assert.equal(result.title, body); }
});
test("daily reminder with a known or unknown count", () => {
  assert.equal(dailyReminderBody({ dayLabel: "Pull", count: 100, target: 200 }), "Your Pull session is ready. Today could be day 101.");
  assert.equal(dailyReminderBody({ dayLabel: "Pull", count: 0 }), "Your Pull session is ready. Today could be day 1.");
  assert.equal(dailyReminderBody({ dayLabel: "Pull" }), "Your Pull session is ready. Get it done.");
  assert.equal(dailyReminderBody({ count: null }), "Your workout session is ready. Get it done.");
});
test("all copy branches avoid punitive language", () => {
  const outputs = cases.map(([, overrides]) => choosePaceMessage({ ...base, ...overrides })).filter(Boolean);
  for (const result of outputs) assert.doesNotMatch(`${result.title} ${result.body}`, /fail|missed|lost/i);
  for (const count of [undefined, 0, 100]) assert.doesNotMatch(dailyReminderBody({ dayLabel: "Pull", count }), /fail|missed|lost/i);
});
