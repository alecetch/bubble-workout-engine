import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTemplateA } from "../templateSlotMapper.js";

function segment(segmentKey, overrides = {}) {
  return {
    segmentKey,
    label: segmentKey.replace(/_/g, " "),
    type: segmentKey.startsWith("run_") ? "run" : "station",
    userSeconds: 300,
    benchmarkMedianSeconds: 360,
    goalBenchmarkSeconds: 330,
    exactTargetSeconds: null,
    timeGapToMedianSeconds: -60,
    percentile: 75,
    confidence: "high",
    ...overrides,
  };
}

function analysis(overrides = {}) {
  return {
    race: { finishTimeSeconds: 3600 },
    benchmarkContext: {
      primaryBenchmarkGroup: { key: "open:male:35-39", label: "Open Male 35-39" },
      goalBenchmarkGroup: { key: "open:male:top-10", label: "Open Male Top 10%" },
    },
    timePotential: { headlineGainSeconds: 0 },
    segments: [
      segment("total_time", { type: "aggregate", percentile: 90, userSeconds: 3600 }),
      segment("run_1", {
        userSeconds: 300,
        benchmarkMedianSeconds: 360,
        goalBenchmarkSeconds: 330,
        exactTargetSeconds: 315,
        timeGapToMedianSeconds: -60,
        timeGapToExactTargetSeconds: -15,
      }),
      segment("ski_erg", {
        userSeconds: 300,
        benchmarkMedianSeconds: 360,
        goalBenchmarkSeconds: 270,
        exactTargetSeconds: null,
        timeGapToMedianSeconds: -60,
      }),
      segment("wall_balls", {
        userSeconds: 360,
        benchmarkMedianSeconds: 420,
        goalBenchmarkSeconds: 330,
        exactTargetSeconds: 300,
        timeGapToMedianSeconds: -60,
        timeGapToExactTargetSeconds: 60,
        percentile: 45,
      }),
    ],
    ...overrides,
  };
}

describe("buildTemplateA", () => {
  it("uses the athlete name in the first-slide percentile line", () => {
    const carousel = buildTemplateA(analysis(), [], { displayName: "Marcus Fernandes" });

    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes is in the Top 10%");
  });

  it("uses exact target gaps before goal benchmark and median gaps in carousel rows", () => {
    const carousel = buildTemplateA(analysis(), [], { displayName: "Marcus Fernandes" });
    const rows = carousel.slides[1].stations;

    assert.equal(carousel.slides[1].comparison_basis, "TARGET");
    assert.equal(rows.find((row) => row.name === "RUN 1").delta, "-0:15");
    assert.equal(rows.find((row) => row.name === "RUN 1").target_time, "5:15");
    assert.equal(rows.find((row) => row.name === "SKIERG").delta, "+0:30");
    assert.equal(rows.find((row) => row.name === "SKIERG").target_time, "4:30");
    assert.equal(carousel.slides[1].biggest_gain.delta, "-0:15");
    assert.equal(carousel.slides[1].biggest_loss.delta, "+1:00");
  });

  it("keeps a slide 1 hero image for analyse-mode high performers", () => {
    const highPerformer = analysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "open:male:35-39", label: "Open Male 35-39" },
        goalBenchmarkGroup: null,
      },
      stationBreakdown: [
        { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: -120, percentile: 92, confidence: "high" },
        { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", timeGapSeconds: -90, percentile: 88, confidence: "high" },
      ],
      segments: [
        segment("total_time", { type: "aggregate", percentile: 90, userSeconds: 3600 }),
        segment("run_1", { type: "run", timeGapToMedianSeconds: -60, percentile: 85 }),
        segment("run_2", { type: "run", timeGapToMedianSeconds: -50, percentile: 82 }),
        segment("wall_balls", { timeGapToMedianSeconds: -120, percentile: 92 }),
        segment("sandbag_lunges", { timeGapToMedianSeconds: -90, percentile: 88 }),
      ],
      headline: { biggestLimiter: null, biggestStrength: { segmentKey: "wall_balls", label: "Wall Balls", percentile: 92 } },
    });
    const carousel = buildTemplateA(highPerformer, [], { displayName: "Marcus Fernandes", sex: "male", calculatorMode: "analyse" });

    assert.match(carousel.slides[0].athlete_image, /hyrox-wall-balls-male\.png$/);
  });
});
