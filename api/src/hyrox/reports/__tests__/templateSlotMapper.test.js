import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHyroxRaceCardData } from "../raceCardDataMapper.js";
import { buildCarouselPage } from "../carouselPageBuilder.js";
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

function worldwideComparisonAnalysis(benchmarkContextOverrides = {}) {
  return analysis({
    benchmarkContext: {
      primaryBenchmarkGroup: { key: "open:male:45-49", label: "Open Male 45-49" },
      goalBenchmarkGroup: null,
      comparisonOptions: [
        { id: "global", label: "Global", groupKey: "open_male", percentile: 96, topPercent: 4, sampleSize: 5000 },
      ],
      ...benchmarkContextOverrides,
    },
    segments: [
      segment("total_time", { type: "aggregate", fieldPercentile: 99, percentile: 99, userSeconds: 3600 }),
      segment("wall_balls", { timeGapToMedianSeconds: 60, percentile: 45 }),
    ],
  });
}

describe("buildTemplateA", () => {
  it("uses the athlete name in the first-slide percentile line", () => {
    const carousel = buildTemplateA(analysis(), [], { displayName: "Marcus Fernandes" });

    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes is in the Top 10%");
  });

  it("uses the race-card global comparison option for WORLDWIDE percentile copy", () => {
    const divergentPercentiles = worldwideComparisonAnalysis({
      comparisonOptions: [
        { id: "global", label: "Global", groupKey: "open_male", percentile: 96, topPercent: 4, sampleSize: 5000 },
        { id: "age_group", label: "Age group 45-49", groupKey: "open_male_45_49", percentile: 99, topPercent: 1, sampleSize: 300 },
      ],
    });

    const carousel = buildTemplateA(divergentPercentiles, [], { displayName: "Marcus Fernandes" });
    const raceCard = buildHyroxRaceCardData(divergentPercentiles, { displayName: "Marcus Fernandes" });

    assert.equal(raceCard.percentileText, "TOP 4% WORLDWIDE");
    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes is in the TOP 4% WORLDWIDE");
    assert.doesNotMatch(carousel.slides[0].percentile, /TOP 1% WORLDWIDE/);
  });

  it("marks low-confidence carousel percentiles as directional", () => {
    const carousel = buildTemplateA(
      worldwideComparisonAnalysis({ confidenceLabel: "insufficient" }),
      [],
      { displayName: "Marcus Fernandes" },
    );

    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes is in the TOP 4% WORLDWIDE (directional)");
  });

  it("marks doubles-benchmarked-as-singles carousel percentiles as directional", () => {
    const carousel = buildTemplateA(
      worldwideComparisonAnalysis({ doublesBenchmarkedAsSingles: true }),
      [],
      { displayName: "Marcus Fernandes" },
    );

    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes is in the TOP 4% WORLDWIDE (directional)");
  });

  it("does not mark high-confidence carousel percentiles as directional", () => {
    const carousel = buildTemplateA(
      worldwideComparisonAnalysis({ confidenceLabel: "strong", doublesBenchmarkedAsSingles: false }),
      [],
      { displayName: "Marcus Fernandes" },
    );

    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes is in the TOP 4% WORLDWIDE");
    assert.doesNotMatch(carousel.slides[0].percentile, /\(directional\)/);
  });

  it("keeps explicit world-rank copy ahead of derived comparison percentiles", () => {
    const carousel = buildTemplateA(analysis({
      benchmarkContext: {
        comparisonOptions: [
          { id: "global", label: "Global", groupKey: "open_male", percentile: 96, topPercent: 4, sampleSize: 5000 },
        ],
      },
    }), [], { displayName: "Marcus Fernandes", worldRank: 27 });

    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes has a top rank worldwide");
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

  it("uses frame-adjusted gaps before goal-derived gaps in carousel rows", () => {
    const carousel = buildTemplateA(analysis({
      calculatorMode: "analyse",
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "open:male:35-39", label: "Open Male 35-39" },
        goalBenchmarkGroup: { targetFinishSeconds: 3300, label: "55:00 target" },
      },
      segments: [
        segment("total_time", { type: "aggregate", userSeconds: 3600, frameGapSeconds: 300, percentile: 70 }),
        segment("run_1", {
          userSeconds: 300,
          goalBenchmarkSeconds: 250,
          frameGapSeconds: -12,
          timeGapToMedianSeconds: 20,
          percentile: 70,
        }),
        segment("wall_balls", {
          userSeconds: 360,
          goalBenchmarkSeconds: 300,
          frameGapSeconds: 45,
          timeGapToMedianSeconds: 80,
          percentile: 40,
        }),
      ],
    }), [], { displayName: "Marcus Fernandes" });
    const rows = carousel.slides[1].stations;

    assert.equal(rows.find((row) => row.name === "RUN 1").delta, "-0:12");
    assert.equal(rows.find((row) => row.name === "WALL BALLS").delta, "+0:45");
    assert.notEqual(rows.find((row) => row.name === "RUN 1").delta, "+0:50");
  });

  it("uses the frame-adjusted strength gap for slide A3 position gain", () => {
    const carousel = buildTemplateA(analysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "open:male:sub_90", label: "Open Male Sub 90" },
        goalBenchmarkGroup: null,
      },
      strengths: [{
        segmentKey: "sled_pull",
        label: "Sled Pull",
        type: "station",
        userSeconds: 210,
        percentile: 91,
        timeAdvantageSeconds: 35,
        timeGapToMedianSeconds: -35,
        frameGapSeconds: -8,
      }],
      segments: [
        segment("total_time", { type: "aggregate", percentile: 90, userSeconds: 3600 }),
        segment("sled_pull", {
          label: "Sled Pull",
          userSeconds: 210,
          percentile: 91,
          timeAdvantageSeconds: 35,
          timeGapToMedianSeconds: -35,
          frameGapSeconds: -8,
        }),
        segment("wall_balls", { userSeconds: 360, timeGapToMedianSeconds: 60, frameGapSeconds: 60, percentile: 45 }),
      ],
    }), [], { displayName: "Marcus Fernandes" });

    const flowRow = carousel.slides[1].stations.find((row) => row.name === "SLED PULL");

    assert.equal(flowRow.delta, "-0:08");
    assert.equal(carousel.slides[2].position_gain, "+0:08");
    assert.equal(carousel.slides[2].position_gain_label, "TIME AHEAD OF MEDIAN");
    assert.notEqual(carousel.slides[2].position_gain, "+0:35");
  });

  it("renders doubles athlete names with both partners in carousel copy and page title", () => {
    const carousel = buildTemplateA(analysis(), [], { displayName: "SMITH, John & DOE, Jane" });
    const html = buildCarouselPage(carousel);

    assert.equal(carousel.slides[0].athlete_name, "John Smith & Jane Doe");
    assert.equal(carousel.slides[4].athlete_first_name, "John & Jane");
    assert.match(carousel.slides[4].insight, /John & Jane/);
    assert.match(html, /<title>HYROX Analysis . John Smith &amp; Jane Doe \| FORMA<\/title>/);
    assert.doesNotMatch(html, /SMITH, John &amp; DOE, Jane/);
  });

  it("uses the engine headline limiter when a run gap is larger than every station gap", () => {
    const runLimitedAnalysis = analysis({
      timePotential: { headlineGainSeconds: 45 },
      headline: {
        biggestLimiter: { segmentKey: "run_5", label: "Run 5", type: "run", timeGapSeconds: 45, percentile: 22 },
      },
      limiters: [{ segmentKey: "run_5", label: "Run 5", type: "run", timeGapSeconds: 45, percentile: 22 }],
      segments: [
        segment("total_time", { type: "aggregate", percentile: 45, userSeconds: 4200 }),
        segment("run_5", {
          type: "run",
          label: "Run 5",
          userSeconds: 390,
          timeGapToMedianSeconds: 45,
          frameGapSeconds: 45,
          percentile: 22,
        }),
        segment("wall_balls", {
          label: "Wall Balls",
          userSeconds: 360,
          timeGapToMedianSeconds: 30,
          frameGapSeconds: 30,
          percentile: 35,
        }),
        segment("sled_push", {
          label: "Sled Push",
          userSeconds: 145,
          timeGapToMedianSeconds: 15,
          frameGapSeconds: 15,
          percentile: 45,
        }),
      ],
    });

    const carousel = buildTemplateA(runLimitedAnalysis, [], { displayName: "Marcus Fernandes" });

    assert.equal(carousel.slides[0].biggest_limiter, "RUN 5");
    assert.equal(carousel.slides[0].limiter_word, "RUN 5");
    assert.equal(carousel.slides[3].station, "RUN 5");
    assert.equal(carousel.slides[4].loss_station, "run 5");
    assert.notEqual(carousel.slides[0].biggest_limiter, "WALL BALLS");
  });

  it("uses a canonical RoxZone limiter in carousel opportunity slots", () => {
    const roxLimitedAnalysis = analysis({
      timePotential: { headlineGainSeconds: 200 },
      headline: {
        biggestLimiter: { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 200, percentile: 18 },
      },
      limiters: [{ segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 200, percentile: 18 }],
      segments: [
        segment("total_time", { type: "aggregate", percentile: 45, userSeconds: 4200 }),
        segment("roxzone_time", {
          type: "aggregate",
          label: "RoxZone",
          userSeconds: 420,
          frameGapSeconds: 200,
          timeGapToMedianSeconds: 200,
          percentile: 18,
        }),
        segment("sled_pull", {
          label: "Sled Pull",
          userSeconds: 220,
          timeGapToMedianSeconds: 63,
          frameGapSeconds: 63,
          percentile: 35,
        }),
      ],
    });

    const carousel = buildTemplateA(roxLimitedAnalysis, [], { displayName: "Marcus Fernandes" });

    assert.equal(carousel.slides[0].biggest_limiter, "ROXZONE");
    assert.equal(carousel.slides[0].limiter_word, "ROXZONE");
    assert.equal(carousel.slides[3].station, "ROXZONE");
    assert.equal(carousel.slides[3].potential_gain, "3:20");
    assert.equal(carousel.slides[4].loss_station, "roxzone");
    assert.notEqual(carousel.slides[0].biggest_limiter, "SLED PULL");
  });

  it("uses penalties as the carousel headline opportunity when penalties dominate the total gap", () => {
    const carousel = buildTemplateA(analysis({
      race: { finishTimeSeconds: 5600, targetTimeSeconds: 5000 },
      benchmarkContext: {
        goalBenchmarkGroup: { targetFinishSeconds: 5000, label: "Target" },
        primaryBenchmarkGroup: { key: "open:male", label: "Open Male" },
      },
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 },
      },
      timePotential: { headlineGainSeconds: 90 },
      penalties: [{ station: "run_5", penaltySeconds: 200 }],
      segments: [
        segment("total_time", { type: "aggregate", userSeconds: 5600, frameGapSeconds: 600, percentile: 45 }),
        segment("wall_balls", { label: "Wall Balls", userSeconds: 380, frameGapSeconds: 90, timeGapToMedianSeconds: 90, percentile: 35 }),
      ],
    }), [], { displayName: "Alex Smith" });

    assert.equal(carousel.slides[0].biggest_limiter, "PENALTIES");
    assert.equal(carousel.slides[0].limiter_word, "PENALTIES");
    assert.equal(carousel.slides[3].station, "PENALTIES");
    assert.equal(carousel.slides[3].label, "Fastest Win");
    assert.equal(carousel.slides[3].potential_gain, "3:20");
    assert.equal(carousel.slides[4].loss_station, "penalties");
    assert.notEqual(carousel.slides[0].biggest_limiter, "WALL BALLS");
  });

  it("keeps a slide 1 hero image for target-mode athletes who beat all station medians (stationBreakdown fallback)", () => {
    // Athletes who beat every station median have no positive timeGapToMedianSeconds, so
    // limiterKey returns null. The hero image must still be resolved from stationBreakdown.
    const eliteTargetMode = analysis({
      stationBreakdown: [
        { segmentKey: "sled_push", label: "Sled Push", timeGapSeconds: -30, percentile: 72, confidence: "high" },
        { segmentKey: "ski_erg", label: "SkiErg", timeGapSeconds: -90, percentile: 88, confidence: "high" },
      ],
      segments: [
        segment("total_time", { type: "aggregate", percentile: 75, userSeconds: 3600 }),
        segment("run_1", { type: "run", timeGapToMedianSeconds: -40, percentile: 70 }),
        segment("run_2", { type: "run", timeGapToMedianSeconds: -35, percentile: 68 }),
        segment("sled_push", { timeGapToMedianSeconds: -30, percentile: 72 }),
        segment("ski_erg", { timeGapToMedianSeconds: -90, percentile: 88 }),
      ],
    });
    const carousel = buildTemplateA(eliteTargetMode, [], { displayName: "Alice Bauer", sex: "female", calculatorMode: "target" });

    // sled_push has the highest (least-negative) timeGapSeconds → relatively weakest station
    assert.match(carousel.slides[0].athlete_image, /hyrox-sled-push-female\.png$/);
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

  it("adds regional context to the athlete hook slide when material", () => {
    const carousel = buildTemplateA(analysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "open:male:35-39", label: "Open Male 35-39" },
        goalBenchmarkGroup: null,
        regionalBenchmark: {
          available: true,
          region: "europe",
          regionLabel: "Europe",
          fieldPercentile: 45,
        },
      },
      segments: [
        segment("total_time", { type: "aggregate", fieldPercentile: 55, percentile: 55, userSeconds: 3600 }),
        segment("wall_balls", { timeGapToMedianSeconds: 60, percentile: 45 }),
      ],
    }), [], { displayName: "Marcus Fernandes", sex: "male", calculatorMode: "analyse" });

    assert.match(carousel.slides[0].regional_context, /Europe events attract/);
    assert.match(carousel.slides[0].regional_context, /top 55%/);
  });

  it("includes age_group_context in A1_ATHLETE_HOOK when fieldPercentile is available", () => {
    const carousel = buildTemplateA(analysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "open:male:40-44", label: "Open Male 40-44" },
        goalBenchmarkGroup: null,
        ageBenchmark: { available: true, ageGroup: "40-44", fieldPercentile: 65 },
      },
    }), [], {});

    assert.equal(carousel.slides[0].age_group_context, "Top 35% in your 40-44 age group");
  });

  it("sets age_group_context to null when ageBenchmark is not available", () => {
    const carousel = buildTemplateA(analysis({
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "open:male:40-44", label: "Open Male 40-44" },
        goalBenchmarkGroup: null,
        ageBenchmark: { available: false },
      },
    }), [], {});

    assert.equal(carousel.slides[0].age_group_context, null);
  });
});
