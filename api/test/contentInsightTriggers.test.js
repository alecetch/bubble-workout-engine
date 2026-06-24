import test from "node:test";
import assert from "node:assert/strict";
import {
  closePodium,
  dominantWinner,
  fieldCompression,
  generateContentInsights,
  winningMarginLarge,
  winningMarginTight,
} from "../src/contentStudio/contentInsightEngine.js";

function analysisWithTimes(times, hasFullSplits = false) {
  return {
    athletes: times.map((finishTimeSeconds, index) => ({
      name: `Athlete ${index + 1}`,
      rank: index + 1,
      finishTimeSeconds,
      splits: {},
    })),
    raceStats: { segments: { finish_time: { median: times[Math.floor(times.length / 2)] } }, rankCorrelations: {} },
    narrativeStats: { hasFullSplits, fieldSize: times.length },
    historicalBenchmarks: {},
  };
}

test("winningMarginLarge fires when gap > 90s", () => {
  assert.equal(winningMarginLarge(analysisWithTimes([3600, 3700]))?.triggerKey, "winning_margin_large");
});

test("winningMarginLarge returns null when gap <= 90s", () => {
  assert.equal(winningMarginLarge(analysisWithTimes([3600, 3690])), null);
});

test("winningMarginTight fires when gap < 30s", () => {
  assert.equal(winningMarginTight(analysisWithTimes([3600, 3629]))?.triggerKey, "winning_margin_tight");
});

test("closePodium fires when 1st-3rd gap < 90s", () => {
  assert.equal(closePodium(analysisWithTimes([3600, 3650, 3689]))?.triggerKey, "close_podium");
});

test("fieldCompression fires when top-10 gap < 300s", () => {
  assert.equal(fieldCompression(analysisWithTimes([3600, 3620, 3640, 3660, 3680, 3700, 3720, 3740, 3760, 3899]))?.triggerKey, "field_compression");
});

test("dominantWinner fires when winner is under 85% of median", () => {
  assert.equal(dominantWinner(analysisWithTimes([3000, 4000, 4100, 4200, 4300]))?.triggerKey, "dominant_winner");
});

test("split-based triggers return null when hasFullSplits is false", () => {
  const insights = generateContentInsights({
    ...analysisWithTimes([3600, 3700, 3800, 3900, 4000, 4100, 4200, 4300, 4400, 4500], false),
    athletes: analysisWithTimes([3600, 3700, 3800, 3900, 4000, 4100, 4200, 4300, 4400, 4500], false).athletes.map((athlete) => ({
      ...athlete,
      runRank: 3,
      stationRank: 5,
      splitVariance: 0.1,
      runTotalSeconds: 2000,
      stationTotalSeconds: 1600,
    })),
    raceStats: {
      segments: {
        finish_time: { median: 4050 },
        wall_balls: { min: 100, max: 500, cv: 0.5 },
      },
      rankCorrelations: {
        combined_sled: 0.9,
        wall_balls: 0.9,
        run_total: 0.9,
        station_total: 0.2,
      },
    },
    narrativeStats: {
      hasFullSplits: false,
      mostDecisiveStation: "wall_balls",
      mostVariableStation: "wall_balls",
      fieldSize: 10,
    },
  });
  const splitDependentKeys = [
    "winner_not_strongest_station",
    "winner_not_fastest_runner",
    "most_consistent_won",
    "sled_decides_race",
    "wall_balls_decide_race",
    "running_decides_race",
    "most_decisive_station",
    "most_variable_station",
    "winner_station_historic",
    "podium_run_pace",
    "myth_sleds_decide",
    "myth_wallballs_decide",
    "myth_running_doesnt_matter",
    "myth_stations_decide",
  ];
  for (const key of splitDependentKeys) {
    assert.equal(insights.some((insight) => insight.triggerKey === key || insight.type === key), false, `${key} should not fire without splits`);
  }
});
