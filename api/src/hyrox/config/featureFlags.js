export const featureFlags = {
  get doublesBenchmarkSource() {
    const value = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE ?? null;
    if (["legacy", "enriched", "auto"].includes(value)) return value;
    if (process.env.USE_DOUBLES_BENCHMARK_DATASET === "true") return "enriched";
    return "legacy";
  },

  get useDoublesBenchmarkDataset() {
    return this.doublesBenchmarkSource !== "legacy";
  },
};
