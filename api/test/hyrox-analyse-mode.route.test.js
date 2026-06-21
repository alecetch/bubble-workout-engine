import assert from "node:assert/strict";
import test from "node:test";
import { submissionInput } from "../src/hyrox/hyroxController.js";
import { buildBrowserSummary } from "../src/hyrox/reports/browserSummaryBuilder.js";

const analysisJson = {
  segments: [
    { segmentKey: "total_time", type: "aggregate", percentile: 60 },
    { segmentKey: "run_1", type: "run" },
    { segmentKey: "run_2", type: "run" },
    { segmentKey: "run_3", type: "run" },
    { segmentKey: "run_4", type: "run" },
    { segmentKey: "run_5", type: "run" },
    { segmentKey: "run_6", type: "run" },
    { segmentKey: "run_7", type: "run" },
    { segmentKey: "run_8", type: "run" },
    { segmentKey: "ski_erg", type: "station" },
    { segmentKey: "sled_push", type: "station" },
    { segmentKey: "sled_pull", type: "station" },
    { segmentKey: "burpee_broad_jump", type: "station" },
    { segmentKey: "row", type: "station" },
    { segmentKey: "farmers_carry", type: "station" },
    { segmentKey: "sandbag_lunges", type: "station" },
    { segmentKey: "wall_balls", type: "station" },
  ],
  benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-34" } },
  athleteArchetype: {
    key: "strong_runner_station_limited",
    label: "Strong runner, station limited",
    confidence: "medium",
  },
  workRunBalance: {
    runShare: 0.55,
    workShare: 0.35,
    profileType: "runner_dominant",
  },
};

test("submissionInput carries analyse calculatorMode without requiring target time", () => {
  const input = submissionInput({
    calculatorMode: "analyse",
    athlete: { email: "alex@example.com", sex: "male", ageGroup: "30-34" },
    race: { division: "open", finishTimeSeconds: 5520 },
    splits: [],
  });

  assert.equal(input.calculatorMode, "analyse");
  assert.equal(input.athleteContext.calculatorMode, "analyse");
  assert.equal(input.athleteContext.targetFinishTimeSeconds, null);
});

test("browser summary exposes analyse mode archetype and work/run balance", () => {
  const summary = buildBrowserSummary(analysisJson, [], {}, "analyse");

  assert.equal(summary.calculatorMode, "analyse");
  assert.equal(summary.athleteArchetype.key, "strong_runner_station_limited");
  assert.equal(summary.athleteArchetype.label, "Strong runner, station limited");
  assert.equal(summary.workRunBalance.runSharePct, 55);
  assert.equal(summary.workRunBalance.workSharePct, 35);
  assert.equal(summary.workRunBalance.profileType, "runner_dominant");
});

test("browser summary defaults calculatorMode to target", () => {
  const summary = buildBrowserSummary(analysisJson);

  assert.equal(summary.calculatorMode, "target");
});

