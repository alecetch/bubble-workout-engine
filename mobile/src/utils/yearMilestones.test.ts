import { describe, expect, it } from "vitest";
import { highestMilestone } from "./yearMilestones";
const row = (slug: string, threshold: number) => ({ id: slug, slug, threshold, year: 2026 });
describe("highestMilestone", () => {
  it("selects the highest actual threshold without mutating the queue", () => {
    const rows = [row("day_1", 1), row("club_250", 63), row("day_50", 50)];
    expect(highestMilestone(rows)?.slug).toBe("club_250");
    expect(rows[0].slug).toBe("day_1");
  });
  it("prefers day 100 over Club 100, and the target over a tied day milestone", () => {
    expect(highestMilestone([row("club_100", 100), row("day_100", 100)])?.slug).toBe("day_100");
    expect(highestMilestone([row("day_50", 50), row("club_200", 50)])?.slug).toBe("club_200");
  });
  it("returns no overlay for an empty list", () => { expect(highestMilestone([])).toBeUndefined(); });
});
