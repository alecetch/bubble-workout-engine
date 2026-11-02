import { describe, expect, it } from "vitest";
import { paceLine, summaryCountCopy, restDayCopy, doneCopy, proRatedNote } from "./yearCopy";

describe("year copy", () => {
  it("describes ahead and on-pace projections", () => {
    expect(paceLine({ pace_status: "ahead", pace_delta: 3.8, projected_year_end: 212 })).toBe("3 ahead · on track for ~212");
    expect(paceLine({ pace_status: "on_pace", pace_delta: 0.5, projected_year_end: 201 })).toBe("On pace · on track for ~201");
  });
  it("rounds up the gap and gives singular or plural guidance", () => {
    expect(paceLine({ pace_status: "behind", pace_delta: -0.9, projected_year_end: 100 })).toBe("1 behind · one extra session this week closes it");
    expect(paceLine({ pace_status: "behind", pace_delta: -1.5, projected_year_end: 100 })).toBe("2 behind · two extra sessions this fortnight closes it");
    expect(paceLine({ pace_status: "behind", pace_delta: -3.5, projected_year_end: 100 })).toBe("4 behind · four extra sessions this fortnight closes it");
  });
  it.each([
    [88, 200, "That's 88. 112 to go."], [200, 200, "That's 200. You're in for 2026."],
    [50, 50, "That's 50. You're in for 2026."], [214, 200, "That's 214. Club 250 is 36 away."],
    [301, 200, "That's 301. Club 300 — elite year."], [51, 50, "That's 51. Club 100 is 49 away."],
  ])("summarises %i against target %i", (count, target, text) => {
    expect(summaryCountCopy(count, target, 2026)).toBe(text);
  });
  it("describes rest, completion and a pro-rated target", () => {
    expect(restDayCopy({ pace_status: "behind", pace_delta: -1.5 })).toBe("You're 2 behind. A bonus session today closes the gap.");
    expect(restDayCopy({ pace_status: "ahead", pace_delta: 3 })).toBe("You're ahead. Rest is training too.");
    expect(restDayCopy({ pace_status: "on_pace", pace_delta: -0.3 })).toBe("On pace. Rest is training too.");
    expect(doneCopy(88)).toBe("Day 88 is in.");
    expect(proRatedNote({ pro_rated: true, target: 50, year: 2026 })).toBe("Your 2026 target: 50 days. Next year it's 200.");
    expect(proRatedNote({ pro_rated: false, target: 200, year: 2026 })).toBeNull();
  });
  it("keeps every copy branch free of punitive language", () => {
    const outputs = [doneCopy(88), proRatedNote({ pro_rated: true, year: 2026, target: 50 })!,
      ...[0, 50, 88, 200, 214, 301].map(count => summaryCountCopy(count, 200, 2026))];
    for (const pace_status of ["ahead", "on_pace", "behind"] as const) {
      const p = { pace_status, pace_delta: pace_status === "behind" ? -4 : 3, projected_year_end: 212 };
      outputs.push(paceLine(p), restDayCopy(p));
    }
    for (const output of outputs) expect(output).not.toMatch(/fail|missed|lost/i);
  });
});
