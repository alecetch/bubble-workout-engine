export const featureFlags = {
  get useDoublesBenchmarkDataset() {
    return process.env.USE_DOUBLES_BENCHMARK_DATASET === "true";
  },
};
