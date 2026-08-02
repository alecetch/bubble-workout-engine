import { afterEach, describe, expect, test } from "vitest";
import type { HyroxPredictionResponse } from "../../types";
import { clearLastPrediction, loadLastPrediction, saveLastPrediction } from "../predictorStorage";

const prediction: HyroxPredictionResponse = {
  predictionId: "pred-1",
  predictedFinishSeconds: 5400,
  predictedFinishFormatted: "1:30:00",
  rangeLowSeconds: 4860,
  rangeLowFormatted: "1:21:00",
  rangeHighSeconds: 5940,
  rangeHighFormatted: "1:39:00",
  confidenceScore: 0.64,
  confidenceLabel: "moderate",
  predictionMode: "better",
  segments: [],
  topLimiters: [],
  topOpportunities: [],
  keyAssumptions: [],
  predictionVersion: "v1.0",
};

describe("predictor result storage", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  test("round-trips the last prediction through sessionStorage", () => {
    saveLastPrediction(prediction);

    expect(loadLastPrediction()).toEqual(prediction);
  });

  test("returns null when no prediction has been saved", () => {
    sessionStorage.clear();

    expect(loadLastPrediction()).toBeNull();
  });

  test("clears a previously saved prediction", () => {
    saveLastPrediction(prediction);
    clearLastPrediction();

    expect(loadLastPrediction()).toBeNull();
  });
});
