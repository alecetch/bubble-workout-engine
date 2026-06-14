export function buildValidationAudit(record) {
  return {
    source: record.sourceFile ?? "hyrox_results.csv",
    validationStatus: record.validation?.status ?? "fail",
    qualityScore: record.validation?.qualityScore ?? 0,
    flags: record.validation?.flags ?? [],
    parsedTimes: record.parsedTimes ?? {},
    consistency: record.validation?.consistency ?? {},
    benchmarkEligibility: record.validation?.benchmarkEligibility ?? {},
  };
}
