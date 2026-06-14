export function buildBenchmarkDatasets(records) {
  const eligible = (key) => records.filter((record) => Boolean(record.validation?.benchmarkEligibility?.[key]));

  return {
    overall_benchmark: eligible("overall"),
    run_benchmark: eligible("run"),
    station_benchmark: eligible("station"),
    roxzone_benchmark: eligible("roxzone"),
    full_detail_benchmark: eligible("fullDetail"),
  };
}
