import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { featureFlags } from "../featureFlags.js";

let previousSource;
let previousLegacyFlag;

beforeEach(() => {
  previousSource = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  previousLegacyFlag = process.env.USE_DOUBLES_BENCHMARK_DATASET;
  delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  delete process.env.USE_DOUBLES_BENCHMARK_DATASET;
});

afterEach(() => {
  if (previousSource === undefined) delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  else process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = previousSource;
  if (previousLegacyFlag === undefined) delete process.env.USE_DOUBLES_BENCHMARK_DATASET;
  else process.env.USE_DOUBLES_BENCHMARK_DATASET = previousLegacyFlag;
});

describe("featureFlags.doublesBenchmarkSource", () => {
  it("defaults to legacy when env var is unset", () => {
    assert.equal(featureFlags.doublesBenchmarkSource, "legacy");
  });

  it("returns legacy for HYROX_DOUBLES_BENCHMARK_SOURCE=legacy", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "legacy";
    assert.equal(featureFlags.doublesBenchmarkSource, "legacy");
  });

  it("returns enriched for HYROX_DOUBLES_BENCHMARK_SOURCE=enriched", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    assert.equal(featureFlags.doublesBenchmarkSource, "enriched");
  });

  it("returns auto for HYROX_DOUBLES_BENCHMARK_SOURCE=auto", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "auto";
    assert.equal(featureFlags.doublesBenchmarkSource, "auto");
  });

  it("returns legacy for an unrecognised value", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "surprise";
    assert.equal(featureFlags.doublesBenchmarkSource, "legacy");
  });

  it("useDoublesBenchmarkDataset is false when source is legacy", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "legacy";
    assert.equal(featureFlags.useDoublesBenchmarkDataset, false);
  });

  it("useDoublesBenchmarkDataset is true when source is enriched", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    assert.equal(featureFlags.useDoublesBenchmarkDataset, true);
  });

  it("useDoublesBenchmarkDataset is true when source is auto", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "auto";
    assert.equal(featureFlags.useDoublesBenchmarkDataset, true);
  });

  it("keeps the old USE_DOUBLES_BENCHMARK_DATASET=true alias working", () => {
    process.env.USE_DOUBLES_BENCHMARK_DATASET = "true";
    assert.equal(featureFlags.doublesBenchmarkSource, "enriched");
  });
});

