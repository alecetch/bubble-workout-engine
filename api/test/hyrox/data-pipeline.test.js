import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SEGMENT_MAP, STATION_KEYS } from "../../src/hyrox/config/segmentMap.js";
import { buildBenchmarkGroups } from "../../src/hyrox/benchmarks/buildBenchmarkGroups.js";
import { computeBenchmarkStats, computeMetricPercentile } from "../../src/hyrox/benchmarks/computeBenchmarkStats.js";
import { normaliseResult } from "../../src/hyrox/ingestion/normaliseResult.js";
import { parseTimeToSeconds, formatSecondsToTime } from "../../src/hyrox/ingestion/timeParser.js";
import { markDuplicateRecords } from "../../src/hyrox/validation/duplicateDetection.js";
import { validateResult } from "../../src/hyrox/validation/validateResult.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/hyrox/raw");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

function validateFixture(name) {
  const record = normaliseResult(readFixture(name));
  return { record, validation: validateResult(record) };
}

function buildRawRecord(totalSeconds, index) {
  const workSeconds = 24 * 60;
  const roxzoneSeconds = 4 * 60;
  const runSeconds = totalSeconds - workSeconds - roxzoneSeconds;
  const runBase = Math.floor(runSeconds / 8);
  const runRemainder = runSeconds - runBase * 8;
  const raw = {
    ...readFixture("valid_complete_record.json"),
    event_id: `EVT${index}`,
    total_time: formatSecondsToTime(totalSeconds),
    run_time: formatSecondsToTime(runSeconds),
  };
  for (let i = 1; i <= 8; i += 1) {
    raw[`run_${i}`] = formatSecondsToTime(runBase + (i === 8 ? runRemainder : 0));
  }
  return raw;
}

function buildValidatedRecords(count) {
  return Array.from({ length: count }, (_, index) => {
    const record = normaliseResult(buildRawRecord(3600 + index * 10, index));
    return { ...record, validation: validateResult(record) };
  });
}

test("parses 0:59:07 to 3547", () => {
  assert.equal(parseTimeToSeconds("0:59:07"), 3547);
});

test("parses 1:08:42 to 4122", () => {
  assert.equal(parseTimeToSeconds("1:08:42"), 4122);
});

test("parses 4:12 to 252", () => {
  assert.equal(parseTimeToSeconds("4:12"), 252);
});

test("parses 0:00:00 to 0", () => {
  assert.equal(parseTimeToSeconds("0:00:00"), 0);
});

test("returns null for empty string", () => {
  assert.equal(parseTimeToSeconds(""), null);
});

test("returns null for \"NA\"", () => {
  assert.equal(parseTimeToSeconds("NA"), null);
});

test("returns null for \"4:99\" invalid seconds", () => {
  assert.equal(parseTimeToSeconds("4:99"), null);
});

test("valid_complete_record passes with status pass", () => {
  const { validation } = validateFixture("valid_complete_record.json");
  assert.equal(validation.status, "pass");
  assert.equal(validation.benchmarkEligibility.fullDetail, true);
});

test("missing_total_time fails with status fail", () => {
  const { validation } = validateFixture("missing_total_time.json");
  assert.equal(validation.status, "fail");
  assert.equal(validation.benchmarkEligibility.overall, false);
});

test("missing_station_split has benchmarkEligibility.station = false", () => {
  const { validation } = validateFixture("missing_station_split.json");
  assert.equal(validation.status, "partial");
  assert.equal(validation.benchmarkEligibility.station, false);
});

test("split_sum_mismatch excludes station benchmark when station delta is large", () => {
  const { validation } = validateFixture("split_sum_mismatch.json");
  assert.equal(validation.status, "partial");
  assert.equal(validation.benchmarkEligibility.station, false);
  assert.ok(validation.flags.includes("work_split_sum_mismatch_fail"));
});

test("impossible_run_time records plausibility warning", () => {
  const { validation } = validateFixture("impossible_run_time.json");
  assert.equal(validation.status, "warning");
  assert.ok(validation.flags.includes("plausibility_run_1"));
});

test("duplicate_records marks the second copy duplicate_exact", () => {
  const records = readFixture("duplicate_records.json").map((raw) => {
    const record = normaliseResult(raw);
    return { ...record, validation: validateResult(record) };
  });
  const marked = markDuplicateRecords(records);
  assert.ok(marked[1].validation.flags.includes("duplicate_exact"));
});

test("zero_roxzone_8 does not fail the record", () => {
  const { validation } = validateFixture("zero_roxzone_8.json");
  assert.notEqual(validation.status, "fail");
  assert.equal(validation.benchmarkEligibility.roxzone, true);
});

test("unknown_age_group sets status to partial and excludes from age-group benchmarks", () => {
  const { validation } = validateFixture("unknown_age_group.json");
  assert.equal(validation.status, "partial");
  assert.equal(validation.benchmarkEligibility.ageGroup, false);
});

test("doubles_record is stored and eligible for doubles overall benchmark sets", () => {
  const { validation } = validateFixture("doubles_record.json");
  assert.equal(validation.status, "partial");
  assert.equal(validation.benchmarkEligibility.overall, true);
  assert.equal(validation.benchmarkEligibility.run, false);
});

test("SEGMENT_MAP has exactly 40 entries", () => {
  assert.equal(SEGMENT_MAP.length, 40);
});

test("STATION_KEYS has exactly 8 entries", () => {
  assert.equal(STATION_KEYS.length, 8);
});

test("work_8 maps to segmentKey wall_balls", () => {
  assert.equal(SEGMENT_MAP.find((segment) => segment.rawField === "work_8")?.segmentKey, "wall_balls");
});

test("median total_time is within plausible range", () => {
  const records = buildValidatedRecords(20);
  const groups = buildBenchmarkGroups(records, { datasetVersion: "test_v1" });
  const exact = groups.find((group) => group.ageGroup === "30-34");
  const stats = computeBenchmarkStats([exact]).find((metric) => metric.metricKey === "total_time");
  assert.ok(stats.medianSeconds >= 3600);
  assert.ok(stats.medianSeconds <= 3790);
});

test("p10 < p50 < p90 for total_time", () => {
  const records = buildValidatedRecords(20);
  const groups = buildBenchmarkGroups(records, { datasetVersion: "test_v1" });
  const exact = groups.find((group) => group.ageGroup === "30-34");
  const stats = computeBenchmarkStats([exact]).find((metric) => metric.metricKey === "total_time");
  assert.ok(stats.p10Seconds < stats.p50Seconds);
  assert.ok(stats.p50Seconds < stats.p90Seconds);
});

test("percentile direction: faster time gets higher percentile", () => {
  const sortedValues = [3600, 3900, 4200, 4500];
  assert.ok(computeMetricPercentile(3600, sortedValues) > computeMetricPercentile(4500, sortedValues));
});
