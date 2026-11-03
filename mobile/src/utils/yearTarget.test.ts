import { describe, expect, it } from "vitest";
import { firstYearTarget, projectedDays } from "./yearTarget";

describe("year targets", () => {
  it("includes join day and gives 50 for 1 October 2026", () => {
    expect(firstYearTarget("2026-10-01")).toEqual({ year: 2026, target: 50, proRated: true });
  });
  it("gives the full target on 1 January and one on 31 December", () => {
    expect(firstYearTarget("2026-01-01")).toEqual({ year: 2026, target: 200, proRated: false });
    expect(firstYearTarget("2026-12-31")).toEqual({ year: 2026, target: 1, proRated: true });
  });
  it("uses all 366 days in leap years", () => {
    expect(firstYearTarget("2028-01-01").target).toBe(200);
    expect(firstYearTarget("2028-07-01").target).toBe(Math.round(200 * 184 / 366));
    expect(firstYearTarget("2028-02-29").target).toBe(Math.round(200 * 307 / 366));
  });
  it.each([[2, 104], [3, 156], [4, 208], [5, 260]])("projects %i days per week to %i in a full year", (days, expected) => {
    expect(projectedDays(days)).toBe(expected);
  });
  it("projects only the inclusive remaining days when a start date is supplied", () => {
    expect(projectedDays(4, "2026-10-01")).toBe(53);
    expect(projectedDays(4, "2028-07-01")).toBe(Math.round(4 * 184 / 7));
    expect(projectedDays(4, "2026-12-31")).toBe(1);
    expect(projectedDays(0, "2026-10-01")).toBe(0);
  });
  it("rejects malformed calendar dates and invalid weekly rates", () => {
    for (const date of ["2026-02-29", "2026-02-30", "2026-1-01", "invalid"]) expect(() => firstYearTarget(date)).toThrow(RangeError);
    for (const days of [-1, 8, Infinity, NaN]) expect(() => projectedDays(days)).toThrow(RangeError);
  });
});
