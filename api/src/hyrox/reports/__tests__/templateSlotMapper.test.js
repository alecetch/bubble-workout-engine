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

  it("uses contract-owned Forma Score for analyse-mode slide 1 metric without repeating standing copy", () => {
    const carousel = buildTemplateA(analysis({
      calculatorMode: "analyse",
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "open:male:35-39", label: "Open Male 35-39" },
        goalBenchmarkGroup: null,
        comparisonOptions: {
          options: [{ id: "global", label: "Global Open Male", percentile: 82, topPercent: 18 }],
        },
      },
    }), [], { displayName: "Marcus Fernandes", calculatorMode: "analyse" });

    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes is in the TOP 18% WORLDWIDE");
    assert.equal(carousel.slides[0].metric2_label, "FORMA SCORE");
    assert.equal(carousel.slides[0].metric2_value, "82/100");
    assert.equal(carousel.slides[0].world_rank, "82/100");
    assert.notEqual(carousel.slides[0].metric2_label, "WORLD RANK");
    assert.notEqual(carousel.slides[0].metric2_label, "OVERALL STANDING");
    assert.notEqual(carousel.slides[0].metric2_value, "TOP 18% WORLDWIDE");
    assert.doesNotMatch(String(carousel.slides[0].world_rank), /^(?:|-|null|undefined)$/i);
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

  it("does not report a positive biggest_gain when every carousel split is slower than comparison", () => {
    const carousel = buildTemplateA(analysis({
      segments: [
        segment("total_time", { type: "aggregate", percentile: 2, userSeconds: 7061 }),
        segment("run_1", {
          userSeconds: 400,
          benchmarkMedianSeconds: 360,
          goalBenchmarkSeconds: 330,
          exactTargetSeconds: 315,
          timeGapToExactTargetSeconds: 85,
        }),
        segment("ski_erg", {
          userSeconds: 360,
          benchmarkMedianSeconds: 300,
          goalBenchmarkSeconds: 270,
          exactTargetSeconds: 330,
          timeGapToMedianSeconds: 60,
        }),
        segment("wall_balls", {
          userSeconds: 420,
          benchmarkMedianSeconds: 360,
          goalBenchmarkSeconds: 330,
          exactTargetSeconds: 300,
          timeGapToExactTargetSeconds: 120,
          percentile: 10,
        }),
      ],
    }), [], { displayName: "Marcus Fernandes" });

    assert.equal(carousel.slides[1].biggest_gain.station, "NO SPLIT AHEAD");
    assert.equal(carousel.slides[1].biggest_gain.delta, "0");
    assert.equal(carousel.slides[1].no_split_ahead, true);
    assert.ok(carousel.slides[1].closest_split.station);
    assert.match(carousel.slides[1].closest_split.delta, /^\+/);
    assert.equal(carousel.slides[1].biggest_loss.delta, "+2:00");
  });

  it("uses bottom/ordinal percentile language for slow global results across race card and carousel", () => {
    const slowAnalysis = worldwideComparisonAnalysis({
      comparisonOptions: [
        { id: "global", label: "Global", groupKey: "open_male", percentile: 2, topPercent: 98, sampleSize: 5000 },
      ],
      confidenceLabel: "insufficient",
    });

    const carousel = buildTemplateA(slowAnalysis, [], { displayName: "Marcus Fernandes" });
    const raceCard = buildHyroxRaceCardData(slowAnalysis, { displayName: "Marcus Fernandes" });

    assert.equal(raceCard.percentileText, "BOTTOM 2% WORLDWIDE");
    assert.equal(carousel.slides[0].percentile, "Marcus Fernandes is in the BOTTOM 2% WORLDWIDE (directional)");
    assert.doesNotMatch(raceCard.percentileText, /TOP 98/i);
    assert.doesNotMatch(carousel.slides[0].percentile, /TOP 98/i);
  });

  it("suppresses race-card and carousel percentile claims when benchmark data is unavailable", () => {
    const noBenchmarkAnalysis = worldwideComparisonAnalysis({
      primaryBenchmarkGroup: null,
      goalBenchmarkGroup: null,
      comparisonOptions: [
        { id: "stale", label: "Stale", groupKey: "open_male", percentile: 99, topPercent: 1, sampleSize: 5000 },
      ],
      available: false,
    });
    noBenchmarkAnalysis.analysisScope = "no_benchmark_data";

    const carousel = buildTemplateA(noBenchmarkAnalysis, [], { displayName: "Marcus Fernandes", overallPercentile: 99 });
    const raceCard = buildHyroxRaceCardData(noBenchmarkAnalysis, { displayName: "Marcus Fernandes", overallPercentile: 99 });

    assert.equal(raceCard.percentileText, null);
    assert.equal(raceCard.formaScore, null);
    assert.equal(carousel.slides[0].percentile, "Benchmark data is not available for this race format");
    assert.equal(carousel.slides[0].metric2_label, "BENCHMARK");
    assert.equal(carousel.slides[0].metric2_value, "UNAVAILABLE");
    assert.equal(carousel.slides[0].world_rank, "UNAVAILABLE");
    assert.doesNotMatch(carousel.slides[0].percentile, /TOP 1% WORLDWIDE/);
    assert.ok(!carousel.slides[5].features.includes("Percentile Ranking"));
    assert.ok(!carousel.slides[5].features.includes("Strongest Station"));
  });

  it("uses the race-card comparison profile label for analyse-mode carousel benchmark copy", () => {
    const medianAnalysis = analysis({
      calculatorMode: "analyse",
      benchmarkContext: {
        analysisFrame: { frame: "current_band", comparisonBand: "sub_65" },
        primaryBenchmarkGroup: { key: "open:male:sub_65", label: "Open Male Sub 65" },
        goalBenchmarkGroup: null,
      },
      segments: [
        segment("total_time", { type: "aggregate", percentile: 70, userSeconds: 3900 }),
        segment("run_1", {
          userSeconds: 300,
          benchmarkMedianSeconds: 330,
          timeGapToMedianSeconds: -30,
          exactTargetSeconds: null,
        }),
        segment("wall_balls", {
          userSeconds: 360,
          benchmarkMedianSeconds: 330,
          timeGapToMedianSeconds: 30,
          exactTargetSeconds: null,
          percentile: 45,
        }),
      ],
    });

    const carousel = buildTemplateA(medianAnalysis, [], { displayName: "Marcus Fernandes" });
    const slide2 = carousel.slides[1];

    assert.equal(slide2.comparison_basis, "SUB 60-65 MEDIAN");
    assert.equal(slide2.legend_text, "BLUE = FASTER THAN SUB 60-65 MEDIAN    RED = SLOWER THAN SUB 60-65 MEDIAN");
    assert.ok(slide2.stations.length > 0);
    assert.ok(slide2.stations.every((row) => row.comparison_basis === "SUB 60-65 MEDIAN"));
    assert.equal(carousel.slides[2].position_gain_label, "TIME AHEAD OF SUB 60-65 MEDIAN");
  });

  it("uses 120+ MEDIAN for open-ended slow analyse bands in carousel copy", () => {
    const carousel = buildTemplateA(analysis({
      calculatorMode: "analyse",
      benchmarkContext: {
        analysisFrame: { frame: "current_band", comparisonBand: "over_120" },
        goalBenchmarkGroup: null,
      },
      segments: [
        segment("total_time", { type: "aggregate", percentile: 20, userSeconds: 7500 }),
        segment("wall_balls", { userSeconds: 480, benchmarkMedianSeconds: 420, timeGapToMedianSeconds: 60, exactTargetSeconds: null }),
      ],
    }), [], { displayName: "Marcus Fernandes" });

    assert.equal(carousel.slides[1].comparison_basis, "120+ MEDIAN");
    assert.equal(carousel.slides[1].legend_text, "BLUE = FASTER THAN 120+ MEDIAN    RED = SLOWER THAN 120+ MEDIAN");
    assert.ok(carousel.slides[1].stations.every((row) => row.comparison_basis === "120+ MEDIAN"));
  });

  it("keeps target-mode carousel comparison copy as TARGET", () => {
    const carousel = buildTemplateA(analysis(), [], { displayName: "Marcus Fernandes", targetFinishTimeSeconds: 3300 });

    assert.equal(carousel.slides[0].metric2_label, "TARGET");
    assert.equal(carousel.slides[0].metric2_value, "55:00");
    assert.equal(carousel.slides[0].world_rank, "55:00");
    assert.equal(carousel.slides[1].comparison_basis, "TARGET");
    assert.equal(carousel.slides[1].legend_text, "BLUE = FASTER THAN TARGET    RED = SLOWER THAN TARGET");
    assert.ok(carousel.slides[1].stations.every((row) => row.comparison_basis === "TARGET"));
  });

  it("falls back to MEDIAN for unknown analyse bands without leaking undefined copy", () => {
    const carousel = buildTemplateA(analysis({
      calculatorMode: "analyse",
      benchmarkContext: {
        analysisFrame: { frame: "current_band", comparisonBand: "mystery_band" },
        goalBenchmarkGroup: null,
      },
      segments: [
        segment("total_time", { type: "aggregate", percentile: 55, userSeconds: 4500 }),
        segment("wall_balls", { userSeconds: 360, benchmarkMedianSeconds: 330, timeGapToMedianSeconds: 30, exactTargetSeconds: null }),
      ],
    }), [], { displayName: "Marcus Fernandes" });

    assert.equal(carousel.slides[1].comparison_basis, "MEDIAN");
    assert.equal(carousel.slides[1].legend_text, "BLUE = FASTER THAN MEDIAN    RED = SLOWER THAN MEDIAN");
    assert.doesNotMatch(JSON.stringify(carousel), /undefined MEDIAN|undefined|null MEDIAN/);
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
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 420,
        percentile: 18,
        timeGapToMedianSeconds: 200,
        entryExitAvailable: true,
      },
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
    assert.equal(carousel.slides[3].action_text, "TIGHTEN ENTRY/EXIT FLOW");
    assert.match(carousel.slides[3].confidence_note, /specific entry\/exit flow/i);
    assert.deepEqual(carousel.slides[0].roxzone_action, {
      label: "TIGHTEN ENTRY/EXIT FLOW",
      claim_confidence: "firm",
      action_evidence_level: "race_replay_detail",
      detail: "Race Replay detail is available, so focus on the specific entry/exit flow.",
    });
    assert.equal(carousel.slides[4].loss_station, "roxzone");
    assert.notEqual(carousel.slides[0].biggest_limiter, "SLED PULL");
  });

  it("marks inferred RoxZone carousel opportunities as partial and route-focused", () => {
    const carousel = buildTemplateA(analysis({
      timePotential: { headlineGainSeconds: 65 },
      headline: {
        biggestLimiter: { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 65, percentile: 28 },
      },
      roxzoneAnalysis: {
        available: true,
        mode: "inferred_total",
        totalSeconds: 420,
        percentile: 28,
        timeGapToMedianSeconds: 65,
      },
      segments: [
        segment("total_time", { type: "aggregate", percentile: 45, userSeconds: 4200 }),
        segment("roxzone_time", {
          type: "aggregate",
          label: "RoxZone",
          userSeconds: 420,
          frameGapSeconds: 65,
          timeGapToMedianSeconds: 65,
          percentile: 28,
        }),
      ],
    }), [], { displayName: "Marcus Fernandes" });

    assert.equal(carousel.slides[0].roxzone_action.label, "ROXZONE DETAIL PARTIAL - REHEARSE ROUTES");
    assert.equal(carousel.slides[0].roxzone_action.action_evidence_level, "estimated_only");
    assert.match(carousel.slides[0].roxzone_action.detail, /directional transition signal/i);
    assert.equal(carousel.slides[3].action_text, "ROXZONE DETAIL PARTIAL - REHEARSE ROUTES");
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
    assert.equal(carousel.slides[0].biggest_limiter_label, "FASTEST CONTROLLABLE WIN");
    assert.deepEqual(carousel.slides[0].fastest_controllable_win, {
      station: "PENALTIES",
      potential_gain: "3:20",
      label: "FASTEST CONTROLLABLE WIN",
    });
    assert.deepEqual(carousel.slides[0].largest_fitness_limiter, {
      station: "WALL BALLS",
      time_gap: "1:30",
      label: "LARGEST FITNESS LIMITER",
    });
    assert.equal(carousel.slides[0].limiter_word, "PENALTIES");
    assert.equal(carousel.slides[3].station, "PENALTIES");
    assert.equal(carousel.slides[3].label, "Fastest Win");
    assert.equal(carousel.slides[3].potential_gain, "3:20");
    assert.equal(carousel.slides[4].loss_station, "penalties");
    assert.notEqual(carousel.slides[0].biggest_limiter, "WALL BALLS");
    assert.equal(carousel.slides[5].headline, "FIX THE FASTEST WIN");
  });

  it("pins a PENALTIES row to the top of the slide 2 station table, mirroring the email's split table", () => {
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

    const stations = carousel.slides[1].stations;
    assert.equal(stations[0].name, "PENALTIES");
    assert.equal(stations[0].time, "3:20");
    assert.equal(stations[0].delta, "+3:20");
    assert.equal(stations[0].tone, "penalty");
    assert.equal(stations.filter((row) => row.name === "PENALTIES").length, 1, "penalty row should appear exactly once");
  });

  it("does not add a PENALTIES row to the slide 2 table when there are no penalties", () => {
    const carousel = buildTemplateA(analysis({
      penalties: [],
    }), [], { displayName: "Alex Smith" });

    const stations = carousel.slides[1].stations;
    assert.equal(stations.some((row) => row.name === "PENALTIES"), false);
  });

  it("shows material non-dominant penalties as a secondary fastest-win track in the carousel", () => {
    const carousel = buildTemplateA(analysis({
      race: { finishTimeSeconds: 5732 },
      benchmarkContext: {
        primaryBenchmarkGroup: { key: "open:female:sub_95", label: "Open Female Sub 95" },
        goalBenchmarkGroup: null,
      },
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 },
      },
      limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 90, percentile: 35 }],
      timePotential: { headlineGainSeconds: 90 },
      penalties: [{ segmentKey: "farmers_carry", station: "farmers_carry", penaltySeconds: 180 }],
      segments: [
        segment("total_time", { type: "aggregate", userSeconds: 5732, frameGapSeconds: 900, percentile: 45 }),
        segment("wall_balls", { label: "Wall Balls", userSeconds: 390, frameGapSeconds: 90, timeGapToMedianSeconds: 90, percentile: 35 }),
        segment("farmers_carry", { label: "Farmers Carry", userSeconds: 232, frameGapSeconds: 120, frameGapNetOfPenaltySeconds: -60, timeGapToMedianSeconds: 120, percentile: 88 }),
      ],
    }), [], { displayName: "Kate Wagstaff", calculatorMode: "analyse" });

    assert.equal(carousel.slides[0].biggest_limiter, "WALL BALLS");
    assert.equal(carousel.slides[0].biggest_limiter_label, "BIGGEST LIMITER");
    assert.deepEqual(carousel.slides[0].fastest_controllable_win, {
      station: "PENALTIES",
      potential_gain: "3:00",
      label: "FASTEST CONTROLLABLE WIN",
    });
    assert.deepEqual(carousel.slides[0].largest_fitness_limiter, {
      station: "WALL BALLS",
      time_gap: "1:30",
      label: "LARGEST FITNESS LIMITER",
    });
    assert.equal(carousel.slides[0].artifact_headline_mode, "fitness_first_with_penalty_win");
    assert.equal(carousel.slides[3].station, "WALL BALLS");
    assert.equal(carousel.slides[3].label, "Opportunity");
  });

  it("uses context-aware carousel CTA headlines", () => {
    const roxCarousel = buildTemplateA(analysis({
      timePotential: { headlineGainSeconds: 200 },
      headline: { biggestLimiter: { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 200 } },
      roxzoneAnalysis: { available: true, mode: "explicit_splits", totalSeconds: 420, timeGapToMedianSeconds: 200, entryExitAvailable: true },
      segments: [
        segment("total_time", { type: "aggregate", percentile: 45, userSeconds: 4200 }),
        segment("roxzone_time", { type: "aggregate", label: "RoxZone", userSeconds: 420, frameGapSeconds: 200, timeGapToMedianSeconds: 200 }),
      ],
    }), [], { displayName: "Marcus Fernandes" });
    const eliteCarousel = buildTemplateA(analysis({
      race: { finishTimeSeconds: 3560 },
      benchmarkContext: { achievedBand: "sub_60", goalBenchmarkGroup: null },
      headline: { biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 20 } },
      segments: [
        segment("total_time", { type: "aggregate", percentile: 92, userSeconds: 3560 }),
        segment("wall_balls", { label: "Wall Balls", frameGapSeconds: 20, timeGapToMedianSeconds: 20 }),
      ],
    }), [], { displayName: "Elite Athlete" });

    assert.equal(roxCarousel.slides[5].headline, "TIGHTEN YOUR RACE FLOW");
    assert.equal(eliteCarousel.slides[5].headline, "FIND YOUR NEXT MARGINAL GAIN");
    assert.notEqual(eliteCarousel.slides[5].headline, "FIND YOUR BOTTLENECK");
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
	assert.match(carousel.slides[0].regional_context, /around the 45th percentile/);
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
