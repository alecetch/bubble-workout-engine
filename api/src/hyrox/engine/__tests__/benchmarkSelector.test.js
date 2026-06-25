import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { setBenchmarkData } from "../benchmarkService.js";
import {
  confidenceLabelFromSampleSize,
  nextPerformanceBand,
  performanceBandForGoal,
  selectBenchmarkGroups,
} from "../benchmarkSelector.js";

const DATASET = "historical_hyrox_2026_06_v1";
const DEMOGRAPHIC_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:all";
const SUB_60_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_60:open:male";
const SUB_75_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_75:open:male";
const SUB_70_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_70:open:male";

function metric(groupKey, metricKey = "total_time", sampleSize = 500) {
  return {
    groupKey,
    metricKey,
    sampleSize,
    meanSeconds: 3600,
    medianSeconds: 3600,
    p50Seconds: 3600,
    cv: 0.1,
    missingnessRate: 0,
  };
}

function seedBenchmarks() {
  setBenchmarkData({
    groups: [
      { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", sampleSize: 500 },
      { groupKey: SUB_60_KEY, datasetVersion: DATASET, division: "open", gender: "male", performanceBand: "sub_60", sampleSize: 500 },
      { groupKey: SUB_75_KEY, datasetVersion: DATASET, division: "open", gender: "male", performanceBand: "sub_75", sampleSize: 500 },
      { groupKey: SUB_70_KEY, datasetVersion: DATASET, division: "open", gender: "male", performanceBand: "sub_70", sampleSize: 500 },
    ],
    metrics: [
      metric(DEMOGRAPHIC_KEY),
      metric(SUB_60_KEY),
      metric(SUB_75_KEY),
      metric(SUB_70_KEY),
    ],
  });
}

function submission(finishTimeSeconds) {
  return {
    athlete: { division: "open", sex: "male" },
    race: { division: "open", finishTimeSeconds },
  };
}

beforeEach(() => {
  seedBenchmarks();
});

describe("performance band helpers", () => {
  it("maps finish times to achieved bands", () => {
    assert.equal(performanceBandForGoal(59 * 60 + 8), "sub_60");
    assert.equal(performanceBandForGoal(74 * 60 + 20), "sub_75");
    assert.equal(performanceBandForGoal(106 * 60), null);
  });

  it("maps each band to the next faster band", () => {
    assert.equal(nextPerformanceBand("sub_75"), "sub_70");
    assert.equal(nextPerformanceBand("sub_65"), "sub_60");
    assert.equal(nextPerformanceBand("sub_60"), null);
  });

  it("labels sample-size confidence", () => {
    assert.equal(confidenceLabelFromSampleSize(120), "strong");
    assert.equal(confidenceLabelFromSampleSize(30), "directional");
    assert.equal(confidenceLabelFromSampleSize(24), "low-confidence");
    assert.equal(confidenceLabelFromSampleSize(0), "insufficient");
  });
});

describe("selectBenchmarkGroups analyse mode", () => {
  it("uses the achieved performance band as the primary benchmark", () => {
    const result = selectBenchmarkGroups(submission(59 * 60 + 8), { calculatorMode: "analyse" });

    assert.equal(result.available, true);
    assert.equal(result.achievedBand, "sub_60");
    assert.equal(result.primaryBenchmarkGroup.key, SUB_60_KEY);
    assert.equal(result.primaryBenchmarkGroup.performanceBand, "sub_60");
    assert.equal(result.demographicBenchmarkGroup.key, DEMOGRAPHIC_KEY);
    assert.equal(result.nextBand, null);
    assert.equal(result.goalBenchmarkGroup, null);
    assert.equal(result.confidenceLabel, "strong");
  });

  it("keeps target mode on the demographic primary benchmark", () => {
    const result = selectBenchmarkGroups({
      ...submission(74 * 60 + 20),
      race: { ...submission(74 * 60 + 20).race, targetTimeSeconds: 70 * 60 },
    }, { calculatorMode: "target" });

    assert.equal(result.achievedBand, null);
    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
    assert.equal(result.goalBenchmarkGroup.key, SUB_70_KEY);
  });

  it("records the next faster band when one exists", () => {
    const result = selectBenchmarkGroups(submission(74 * 60 + 20), { calculatorMode: "analyse" });

    assert.equal(result.achievedBand, "sub_75");
    assert.equal(result.primaryBenchmarkGroup.key, SUB_75_KEY);
    assert.equal(result.nextBand, "sub_70");
    assert.equal(result.nextBandGroup.key, SUB_70_KEY);
  });
});
