import { describe, expect, it, vi } from "vitest";
import { normalizeYearProgress, getYearProgress } from "./yearProgress";
import { authGetJson } from "./client";

vi.mock("./client", () => ({ authGetJson: vi.fn() }));

describe("year progress transport", () => {
  it("normalizes missing and malformed fields without throwing", () => {
    for (const value of [null, undefined, [], "bad", {}]) {
      expect(normalizeYearProgress(value)).toMatchObject({ count: 0, target: 0, clubs: [], years: [], training_dates: [], next_milestone: null });
    }
  });

  it("preserves valid partial data and safely defaults nested fields", () => {
    const result = normalizeYearProgress({ year: 2026, count: 87, pace_status: "behind", training_dates: ["2026-01-01", null],
      clubs: [{ tier: 100 }, { tier: 200, threshold: 50, reached_on: "2026-11-19" }], years: [{ year: 2026, best_club: 200 }, null] });
    expect(result.clubs).toEqual([{ tier: 100, threshold: 0, reached_on: null }, { tier: 200, threshold: 50, reached_on: "2026-11-19" }]);
    expect(result.training_dates).toEqual(["2026-01-01"]);
    expect(result.years[0].best_club).toBe(200);
    expect(result.count).toBe(87);
    expect(result.pace_status).toBe("behind");
  });

  it("sends the requested year and device timezone, and normalizes the result", async () => {
    vi.mocked(authGetJson).mockResolvedValue({ year: 2026, count: 5 });
    expect((await getYearProgress(2026)).count).toBe(5);
    const url = new URL(vi.mocked(authGetJson).mock.calls.at(-1)![0], "https://example.test");
    expect(url.searchParams.get("year")).toBe("2026");
    expect(url.searchParams.get("timezone")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    await getYearProgress();
    expect(vi.mocked(authGetJson).mock.calls.at(-1)![0]).not.toContain("year=");
  });
});
