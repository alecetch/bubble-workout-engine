import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { opportunityFraming } from "../opportunityFraming.js";

describe("opportunityFraming", () => {
  it("exposes penalty win, fitness limiter, category gap, and segment gap as separate concepts", () => {
    const framing = opportunityFraming({
      headline: {
        biggestLimiter: { segmentKey: "run_8", label: "Run 8", type: "run", timeGapSeconds: 106 },
      },
      penalties: [{ station: "wall_balls", penaltySeconds: 190 }],
      segments: [
        { segmentKey: "total_time", label: "Total Time", type: "aggregate", frameGapSeconds: 400 },
        { segmentKey: "run_time", label: "Running", type: "aggregate", frameGapSeconds: 260 },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", frameGapSeconds: 80 },
        { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", frameGapSeconds: 40 },
        { segmentKey: "run_8", label: "Run 8", type: "run", frameGapSeconds: 106 },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", frameGapSeconds: 75 },
      ],
    });

    assert.equal(framing.primaryOpportunity.label, "Penalties");
    assert.equal(framing.fastestControllableWin.label, "Penalties");
    assert.equal(framing.largestFitnessLimiter.label, "Run 8");
    assert.equal(framing.largestCategoryGap.label, "Running");
    assert.equal(framing.largestSegmentGap.label, "Run 8");
    assert.equal(framing.hasPenaltyDominantOpportunity, true);
    assert.equal(framing.artifactHeadlineMode, "penalty_first");
  });

  it("exposes material penalties as a secondary fastest win without making them primary", () => {
    const framing = opportunityFraming({
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90 },
      },
      penalties: [{ segmentKey: "farmers_carry", station: "farmers_carry", penaltySeconds: 180 }],
      segments: [
        { segmentKey: "total_time", label: "Total Time", type: "aggregate", frameGapSeconds: 900 },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", frameGapSeconds: 240 },
        { segmentKey: "run_time", label: "Running", type: "aggregate", frameGapSeconds: 120 },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", frameGapSeconds: 90, timeGapSeconds: 90 },
      ],
    });

    assert.equal(framing.primaryOpportunity.label, "Wall Balls");
    assert.equal(framing.fastestControllableWin.label, "Penalties");
    assert.equal(framing.fastestControllableWin.isPrimary, false);
    assert.equal(framing.largestFitnessLimiter.label, "Wall Balls");
    assert.equal(framing.artifactHeadlineMode, "fitness_first_with_penalty_win");
    assert.equal(framing.hasPenaltyDominantOpportunity, false);
  });

  it("falls back to the largest segment when headline limiter is unavailable", () => {
    const framing = opportunityFraming({
      headline: { biggestLimiter: null },
      penalties: [],
      segments: [
        { segmentKey: "run_time", label: "Running", type: "aggregate", frameGapSeconds: 120 },
        { segmentKey: "work_time", label: "Stations", type: "aggregate", frameGapSeconds: 180 },
        { segmentKey: "run_1", label: "Run 1", type: "run", frameGapSeconds: 55 },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", frameGapSeconds: 95 },
      ],
    });

    assert.equal(framing.primaryOpportunity.label, "Wall Balls");
    assert.equal(framing.largestCategoryGap.label, "Stations");
    assert.equal(framing.largestSegmentGap.label, "Wall Balls");
    assert.equal(framing.fastestControllableWin, null);
  });
});
