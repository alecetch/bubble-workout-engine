import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTemplateA } from "../../reports/templateSlotMapper.js";
import { buildCaption } from "../captionBuilder.js";

describe("buildCaption", () => {
  it("renders full caption data", () => {
    const analysisJson = {
      headline: { biggestStrength: { segmentKey: "sled_pull", label: "Sled Pull", type: "station" } },
      strengths: [{ segmentKey: "sled_pull", label: "Sled Pull", type: "station" }],
      penalties: { totalPenaltySeconds: 90 },
      segments: [
        { segmentKey: "sled_pull", label: "Sled Pull", type: "station", userSeconds: 210, frameGapSeconds: -30 },
      ],
    };
    const caption = buildCaption({
      slide0: {
        overall_time: "1:02:10",
        biggest_limiter: "Wall Balls",
        best_station: "Sled Pull",
      },
      athleteContext: { targetFinishTimeSeconds: 3300 },
      analysisJson,
    });

    assert.match(caption, /Finish time: 1:02:10/);
    assert.match(caption, /Target: 55:00/);
    assert.match(caption, /Penalties: 1:30 to clean up/);
    assert.match(caption, /Biggest opportunity: Wall Balls/);
    assert.match(caption, /Biggest strength: SLED PULL/);
  });

  it("omits target when no target time exists", () => {
    const caption = buildCaption({ slide0: { overall_time: "1:02:10" } });
    assert.equal(caption.includes("Target:"), false);
  });

  it("omits penalties below 60 seconds", () => {
    const caption = buildCaption({ slide0: { overall_time: "1:02:10" }, analysisJson: { penalties: { totalPenaltySeconds: 30 } } });
    assert.equal(caption.includes("Penalties:"), false);
  });

  it("omits strength when best station is missing", () => {
    const caption = buildCaption({ slide0: { overall_time: "1:02:10", biggest_limiter: "Wall Balls" } });
    assert.equal(caption.includes("Biggest strength:"), false);
  });

  it("uses Best relative split for fastest-ahead-only captions", () => {
    const analysisJson = {
      race: { finishTimeSeconds: 3600 },
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Male" }, goalBenchmarkGroup: null },
      headline: { biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 60 }, biggestStrength: null },
      strengths: [],
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 3600, frameGapSeconds: 60 },
        { segmentKey: "run_8", type: "run", label: "Run 8", userSeconds: 207, frameGapSeconds: -33, timeGapToMedianSeconds: -33 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 390, frameGapSeconds: 60, timeGapToMedianSeconds: 60 },
      ],
    };
    const carousel = buildTemplateA(analysisJson, [], { displayName: "Marcus Fernandes" });
    const caption = buildCaption({ slide0: carousel.slides[0], athleteContext: {}, analysisJson });

    assert.match(caption, /Best relative split: RUN 8/);
    assert.doesNotMatch(caption, /Biggest strength: RUN 8/);
  });

  it("does not emit a false strength line when no reliable strength exists", () => {
    const caption = buildCaption({
      slide0: { overall_time: "1:02:10", biggest_limiter: "Wall Balls", best_station: "NO RELIABLE STRENGTH" },
      analysisJson: {
        headline: { biggestStrength: null },
        strengths: [],
        segments: [
          { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 390, frameGapSeconds: 60, timeGapToMedianSeconds: 60 },
        ],
      },
    });

    assert.doesNotMatch(caption, /Biggest strength:/);
    assert.doesNotMatch(caption, /Best relative split:/);
  });

  it("uses the carousel's run limiter in the Instagram caption", () => {
    const analysisJson = {
      race: { finishTimeSeconds: 4200 },
      benchmarkContext: { primaryBenchmarkGroup: { label: "Open Male" }, goalBenchmarkGroup: null },
      timePotential: { headlineGainSeconds: 45 },
      headline: {
        biggestLimiter: { segmentKey: "run_5", label: "Run 5", type: "run", timeGapSeconds: 45, percentile: 22 },
        biggestStrength: { segmentKey: "sled_pull", label: "Sled Pull", percentile: 82 },
      },
      limiters: [{ segmentKey: "run_5", label: "Run 5", type: "run", timeGapSeconds: 45, percentile: 22 }],
      strengths: [{ segmentKey: "sled_pull", label: "Sled Pull", type: "station", percentile: 82, timeGapToMedianSeconds: -30 }],
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4200, percentile: 45 },
        { segmentKey: "run_5", type: "run", label: "Run 5", userSeconds: 390, timeGapToMedianSeconds: 45, frameGapSeconds: 45, percentile: 22 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 360, timeGapToMedianSeconds: 30, frameGapSeconds: 30, percentile: 35 },
        { segmentKey: "sled_pull", type: "station", label: "Sled Pull", userSeconds: 100, timeGapToMedianSeconds: -30, frameGapSeconds: -30, percentile: 82 },
      ],
    };
    const carousel = buildTemplateA(analysisJson, [], { displayName: "Marcus Fernandes" });
    const caption = buildCaption({ slide0: carousel.slides[0], athleteContext: {}, analysisJson });

    assert.equal(carousel.slides[0].biggest_limiter, "RUN 5");
    assert.match(caption, /Biggest opportunity: RUN 5/);
    assert.doesNotMatch(caption, /Biggest opportunity: WALL BALLS/);
  });

  it("handles empty input", () => {
    const caption = buildCaption();
    assert.match(caption, /Finish time: -/);
    assert.match(caption, /#HYROX/);
  });
});
