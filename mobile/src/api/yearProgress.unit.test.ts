import { describe, expect, it, vi } from "vitest";
import { normalizeYearProgress, getYearProgress, claimYearMilestone, markYearMilestoneSeen } from "./yearProgress";
import { authGetJson, authPostJson } from "./client";

vi.mock("./client", () => ({ authGetJson: vi.fn(), authPostJson: vi.fn() }));

describe("year progress transport", () => {
  it("normalizes milestone history and claims/acknowledges through authenticated endpoints", async () => {
    const milestone = { id: "m1", slug: "day_25", threshold: 25, year: 2026 };
    const progress = normalizeYearProgress({ unseen_milestones: [milestone, null], milestones: [{ slug: "day_25", threshold: 25, reached_on: "2026-03-01" }] });
    expect(progress.unseen_milestones).toEqual([milestone]);
    expect(progress.milestones).toEqual([{ slug: "day_25", threshold: 25, reached_on: "2026-03-01" }]);
    vi.mocked(authPostJson).mockResolvedValueOnce({ milestone, coalesced_ids: ["older", null] });
    expect(await claimYearMilestone(2026)).toEqual({ milestone, coalesced_ids: ["older"] });
    expect(authPostJson).toHaveBeenCalledWith("/api/users/me/year-milestones/claim", { year: 2026 });
    vi.mocked(authPostJson).mockResolvedValueOnce(undefined);
    await markYearMilestoneSeen("m1");
    expect(authPostJson).toHaveBeenCalledWith("/api/users/me/year-milestones/m1/seen", {});
  });
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
