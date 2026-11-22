import test from "node:test";
import assert from "node:assert/strict";
import { choosePaceMessage, dailyReminderBody } from "../paceMessages.js";

const base = { count: 147, target: 200, paceDelta: -2, todayLocal: "2026-10-01", windowEnd: "2026-12-31",
  nextMilestone: { threshold: 150, displayName: "Club 150" }, reachedTarget: false };
const cases = [
  ["December target takes priority", { todayLocal: "2026-12-07", count: 186, paceDelta: -8 }, "december", "The final stretch", "14 to go for 200, with 25 days left. Plenty of time."],
  ["December achievable Club 100", { todayLocal: "2026-12-07", count: 94, paceDelta: -90 }, "december_club", "Club 100 is in reach", "6 to go before the year ends."],
  ["December impossible target and club", { todayLocal: "2026-12-30", count: 90 }, null],
  ["December club already reached", { todayLocal: "2026-12-30", count: 101 }, null],
  ["December inclusive last day", { todayLocal: "2026-12-31", count: 199 }, "december", "The final stretch", "1 to go for 200, with 1 day left. Plenty of time."],
  ["pro-rated December", { todayLocal: "2026-12-01", count: 40, target: 50 }, "december", "The final stretch", "10 to go for 50, with 31 days left. Plenty of time."],
  ["behind three takes priority", { paceDelta: -3 }, "behind", "Catch up this week", "You're 3 behind pace. Three extra sessions this week and you're back."],
  ["rounds up to four", { paceDelta: -3.2 }, "behind", "Catch up this fortnight", "You're 4 behind pace. Three extra sessions this fortnight will help close the gap."],
  ["six is still a fortnight", { paceDelta: -6 }, "behind", "Catch up this fortnight", "You're 6 behind pace. Three extra sessions this fortnight will help close the gap."],
  ["seven switches to far behind", { paceDelta: -6.5 }, "far_behind", "Every session counts", "Day 147. Club 150 is 3 away."],
  ["large gap highlights a reachable milestone", { paceDelta: -80, count: 46, nextMilestone: { threshold: 50, displayName: "Club 50" } }, "far_behind", "Every session counts", "Day 46. Club 50 is 4 away."],
  ["large gap without a nearby milestone", { paceDelta: -103, count: 42, nextMilestone: { threshold: 100, displayName: "Club 100" } }, "far_behind", "Every session counts", "Day 42 of your year. Today could be day 43."],
  ["zero count gets a first-session invitation", { paceDelta: -100, count: 0, nextMilestone: null }, "far_behind", "Every session counts", "Today could be day 1 of your year."],
  ["zero count with a nearby milestone still invites day one", { paceDelta: -100, count: 0, nextMilestone: 1 }, "far_behind", "Every session counts", "Today could be day 1 of your year."],
  ["far behind is not blocked by few remaining days", { paceDelta: -7, todayLocal: "2026-11-30", windowEnd: "2026-11-30", count: 42, nextMilestone: { threshold: 50, displayName: "Club 50" } }, "far_behind", "Every session counts", "Day 42 of your year. Today could be day 43."],
  ["behind still requires enough days", { paceDelta: -3, todayLocal: "2026-11-30", windowEnd: "2026-11-30" }, null],
  ["far milestone ten away is included", { paceDelta: -100, count: 40, nextMilestone: 50 }, "far_behind", "Every session counts", "Day 40. Club 50 is 10 away."],
  ["far milestone eleven away uses invitation", { paceDelta: -100, count: 39, nextMilestone: 50 }, "far_behind", "Every session counts", "Day 39 of your year. Today could be day 40."],
  ["milestone close", {}, "milestone", "Club 150 is close", "Day 147. Club 150 is 3 away."],
  ["club display name", { count: 61, nextMilestone: { threshold: 63, displayName: "Club 250" } }, "milestone", "Club 250 is close", "Day 61. Club 250 is 2 away."],
  ["two behind without nearby milestone", { nextMilestone: null }, null],
  ["ahead even near milestone", { paceDelta: 3 }, null],
  ["within on-pace tolerance", { paceDelta: -0.9 }, null],
  ["rounded on-pace boundary", { paceDelta: -1 }, null],
  ["on pace even in December", { paceDelta: 0, todayLocal: "2026-12-07" }, null],
  ["reached target", { count: 200, reachedTarget: true, paceDelta: 0, todayLocal: "2026-12-07" }, null],
];
for (const [name, overrides, kind, title, body] of cases) test(name, () => {
  const result = choosePaceMessage({ ...base, ...overrides });
  assert.equal(result?.kind ?? null, kind);
  if (kind) { assert.equal(result.body, body); assert.equal(result.title, title); }
});

test("all pace variants have distinct short titles and never quote a large gap", () => {
  for (const [, overrides] of cases) {
    const result = choosePaceMessage({ ...base, ...overrides });
    if (!result) continue;
    assert.notEqual(result.title, result.body);
    assert.ok(result.title.length <= 30);
    assert.doesNotMatch(result.title, /behind|\d+ behind/i);
    if (result.kind === "far_behind") {
      assert.doesNotMatch(result.body, /behind|gap|extra sessions/i);
      // Day counts and milestone names are explicitly required by the copy.
      // Strip those allowed numbers before checking for an unexplained gap figure.
      const withoutProgress = result.body.replace(/Day \d+|day \d+|Club \d+|is \d+ away/g, "");
      assert.doesNotMatch(withoutProgress, /\d{2,} /);
    }
  }
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
