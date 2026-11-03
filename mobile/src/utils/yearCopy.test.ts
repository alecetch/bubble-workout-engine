import { describe, expect, it } from "vitest";
import { CLUB_TIERS, paceLine, summaryCountCopy, restDayCopy, doneCopy, proRatedNote } from "./yearCopy";

const dates = { today_local: "2026-01-01", window_end: "2026-12-31" };
const clubs = [{ tier: 100, threshold: 25 }, { tier: 200, threshold: 50 }, { tier: 250, threshold: 63 }, { tier: 300, threshold: 75 }];
const paceCases = [
  [-0.9, dates, "1 behind \u00b7 one extra session this week closes it"],
  [-1.5, dates, "2 behind \u00b7 two extra sessions this fortnight closes it"],
  [-3.5, dates, "4 behind \u00b7 four extra sessions this fortnight closes it"],
  [-5, dates, "5 behind \u00b7 one extra session a week closes it in 5 weeks"],
  [-12, { today_local: "2026-08-14", window_end: "2026-12-31" }, "12 behind \u00b7 one extra session a week closes it in 12 weeks"],
  [-80, { today_local: "2026-11-06", window_end: "2026-12-31" }, "80 behind \u00b7 on track for ~105"],
  [-5, { today_local: "2026-11-27", window_end: "2026-12-31" }, "5 behind \u00b7 one extra session a week closes it in 5 weeks"],
  [-5, { today_local: "2026-11-28", window_end: "2026-12-31" }, "5 behind \u00b7 on track for ~105"],
  [-5, { today_local: "2026-12-31", window_end: "2026-12-31" }, "5 behind \u00b7 on track for ~105"],
] as const;
const clubCases = [
  [51, "That's 51. Club 250 is 12 away."],
  [50, "That's 50. You're in for 2026."],
  [75, "That's 75. Club 300 \u2014 elite year."],
  [76, "That's 76. Club 300 \u2014 elite year."],
  [20, "That's 20. 30 to go."],
] as const;

describe("year copy", () => {
  it("describes ahead and on-pace projections", () => {
    expect(paceLine({ ...dates, pace_status: "ahead", pace_delta: 3.8, projected_year_end: 212 })).toBe("3 ahead · on track for ~212");
    expect(paceLine({ ...dates, pace_status: "on_pace", pace_delta: 0.5, projected_year_end: 201 })).toBe("On pace · on track for ~201");
  });
  it("rounds up the gap and gives singular or plural guidance", () => {
    expect(paceLine({ ...dates, pace_status: "behind", pace_delta: -0.9, projected_year_end: 100 })).toBe("1 behind · one extra session this week closes it");
    expect(paceLine({ ...dates, pace_status: "behind", pace_delta: -1.5, projected_year_end: 100 })).toBe("2 behind · two extra sessions this fortnight closes it");
    expect(paceLine({ ...dates, pace_status: "behind", pace_delta: -3.5, projected_year_end: 100 })).toBe("4 behind · four extra sessions this fortnight closes it");
  });
  it.each([
    [88, 200, "That's 88. 112 to go."], [200, 200, "That's 200. You're in for 2026."],
    [50, 50, "That's 50. You're in for 2026."], [214, 200, "That's 214. Club 250 is 36 away."],
    [301, 200, "That's 301. Club 300 — elite year."], [300, 200, "That's 300. Club 300 \u2014 elite year."],
  ])("summarises %i against target %i", (count, target, text) => {
    expect(summaryCountCopy(count, target, 2026)).toBe(text);
  });
  it.each(paceCases)("uses achievable guidance for delta %s", (pace_delta, window, text) => {
    expect(paceLine({ ...window, pace_status: "behind", pace_delta, projected_year_end: 105 })).toBe(text);
  });
  it.each(clubCases)("uses pro-rated thresholds at count %i", (count, text) => {
    expect(summaryCountCopy(count, 50, 2026, clubs)).toBe(text);
  });
  it("sorts thresholds without changing the supplied clubs and falls back for an empty list", () => {
    const unsorted = [clubs[3], clubs[1], clubs[2], clubs[0]];
    expect(summaryCountCopy(51, 50, 2026, unsorted)).toBe("That's 51. Club 250 is 12 away.");
    expect(unsorted.map(c => c.tier)).toEqual([300, 200, 250, 100]);
    expect(summaryCountCopy(214, 200, 2026, [])).toBe("That's 214. Club 250 is 36 away.");
    expect(CLUB_TIERS).toEqual([100, 200, 250, 300]);
  });
  it.each([1, 2, 80])("describes a bonus session for gap %i", (gap) => {
    expect(restDayCopy({ pace_status: "behind", pace_delta: -gap })).toBe(gap === 1
      ? "You're 1 behind. A bonus session today closes the gap."
      : `You're ${gap} behind. A bonus session today makes it ${gap - 1}.`);
  });
  it("describes rest, completion and a pro-rated target", () => {
    expect(restDayCopy({ pace_status: "behind", pace_delta: -1.5 })).toBe("You're 2 behind. A bonus session today makes it 1.");
    expect(restDayCopy({ pace_status: "ahead", pace_delta: 3 })).toBe("You're ahead. Rest is training too.");
    expect(restDayCopy({ pace_status: "on_pace", pace_delta: -1 })).toBe("On pace. Rest is training too.");
    expect(doneCopy(88)).toBe("Day 88 is in.");
    expect(proRatedNote({ pro_rated: true, target: 50, year: 2026 })).toBe("Your 2026 target: 50 days. Next year it's 200.");
    expect(proRatedNote({ pro_rated: false, target: 200, year: 2026 })).toBeNull();
  });
  it("keeps every copy branch free of punitive language", () => {
    const outputs = [doneCopy(88), proRatedNote({ pro_rated: true, year: 2026, target: 50 })!,
      ...[0, 50, 88, 200, 214, 301].map(count => summaryCountCopy(count, 200, 2026))];
    for (const pace_status of ["ahead", "on_pace", "behind"] as const) {
      const p = { ...dates, pace_status, pace_delta: pace_status === "behind" ? -4 : 3, projected_year_end: 212 };
      outputs.push(paceLine(p), restDayCopy(p));
    }
    for (const [pace_delta, window] of paceCases) {
      const p = { ...window, pace_delta, pace_status: "behind" as const, projected_year_end: 105 };
      outputs.push(paceLine(p), restDayCopy(p));
    }
    outputs.push(restDayCopy({ pace_status: "behind", pace_delta: -1 }));
    outputs.push(...clubCases.map(([count]) => summaryCountCopy(count, 50, 2026, clubs)));
    for (const output of outputs) expect(output).not.toMatch(/fail|missed|lost/i);
  });
});
