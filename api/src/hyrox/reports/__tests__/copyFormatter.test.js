import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ageGroupContextLine, bandScoreLabel, formatOrdinal, formatOverallStanding, formatPercentileRank, regionalContextLine } from "../copyFormatter.js";

describe("formatOrdinal", () => {
  test("formats ordinal suffix edge cases", () => {
    assert.equal(formatOrdinal(1), "1st");
    assert.equal(formatOrdinal(2), "2nd");
    assert.equal(formatOrdinal(3), "3rd");
    assert.equal(formatOrdinal(4), "4th");
    assert.equal(formatOrdinal(11), "11th");
    assert.equal(formatOrdinal(12), "12th");
    assert.equal(formatOrdinal(13), "13th");
    assert.equal(formatOrdinal(21), "21st");
  });

  test("returns null for invalid input", () => {
    assert.equal(formatOrdinal(null), null);
    assert.equal(formatOrdinal(undefined), null);
    assert.equal(formatOrdinal("abc"), null);
    assert.equal(formatOrdinal(Number.NaN), null);
  });

  test("formatPercentileRank uses the same ordinal rules", () => {
    assert.equal(formatPercentileRank(1), "1st percentile");
    assert.equal(formatPercentileRank(2), "2nd percentile");
    assert.equal(formatPercentileRank(3), "3rd percentile");
    assert.equal(formatPercentileRank(11), "11th percentile");
    assert.equal(formatPercentileRank(12), "12th percentile");
    assert.equal(formatPercentileRank(13), "13th percentile");
    assert.equal(formatPercentileRank(21), "21st percentile");
  });
});

test("formatOverallStanding: slow and mid-pack percentiles avoid top-share wording", () => {
  assert.equal(formatOverallStanding(40), "around the 40th percentile overall");
  assert.equal(formatOverallStanding(25), "25th percentile overall");
  assert.equal(formatOverallStanding(10), "Bottom 10% overall");
  assert.equal(formatOverallStanding(2), "Bottom 2% overall");
});

test("formatOverallStanding: strong percentiles still show Top X%", () => {
  assert.equal(formatOverallStanding(90), "Top 10% overall");
  assert.equal(formatOverallStanding(75), "Top 25% overall");
  assert.equal(formatOverallStanding(99), "Top 1% overall");
  assert.equal(formatOverallStanding(100), "Top 1% overall");
});

test("formatOverallStanding: null/non-finite returns null", () => {
  assert.equal(formatOverallStanding(null), null);
  assert.equal(formatOverallStanding(undefined), null);
  assert.equal(formatOverallStanding("abc"), null);
});

test("formatOverallStanding: never calls a slow result Top 98%", () => {
  assert.doesNotMatch(formatOverallStanding(2) ?? "", /Top 98/i);
});

describe("regionalContextLine", () => {
  const make = (regionalPct, globalPct) => ({
    benchmarkContext: {
      regionalBenchmark: { available: true, region: "europe", regionLabel: "Europe", fieldPercentile: regionalPct },
    },
    segments: [{ segmentKey: "total_time", fieldPercentile: globalPct }],
  });

  test("returns null when regional benchmark is not available", () => {
    assert.equal(regionalContextLine({ benchmarkContext: { regionalBenchmark: { available: false } } }), null);
  });

  test("returns null when gap is less than 5pp", () => {
    assert.equal(regionalContextLine(make(52, 55)), null);
  });

  test("returns null when gap is exactly 4pp", () => {
    assert.equal(regionalContextLine(make(51, 55)), null);
  });

  test("returns tougher-field sentence when regionalPct is lower by at least 5pp", () => {
    const line = regionalContextLine(make(45, 55));

    assert.match(line, /^Europe events attract/);
    assert.match(line, /around the 45th percentile/);
  });

  test("returns weaker-field sentence when regionalPct is higher by at least 5pp", () => {
    const line = regionalContextLine(make(70, 55));

    assert.match(line, /^Globally, where fields/);
    assert.match(line, /around the 55th percentile/);
  });

  test("uses regionLabel in the tougher-field sentence", () => {
    const line = regionalContextLine({
      benchmarkContext: {
        regionalBenchmark: { available: true, region: "americas", regionLabel: "Americas", fieldPercentile: 40 },
      },
      segments: [{ segmentKey: "total_time", fieldPercentile: 55 }],
    });

    assert.match(line, /^Americas events attract/);
  });
});

describe("ageGroupContextLine", () => {
  test("returns formatted string when fieldPercentile is available", () => {
    const result = ageGroupContextLine({
      benchmarkContext: {
        ageBenchmark: { available: true, ageGroup: "35-39", fieldPercentile: 72 },
      },
    });

    assert.equal(result, "Top 28% in your 35-39 age group");
  });

  test("returns null when ageBenchmark is not available", () => {
    assert.equal(
      ageGroupContextLine({ benchmarkContext: { ageBenchmark: { available: false } } }),
      null,
    );
  });

  test("returns null when fieldPercentile is missing", () => {
    assert.equal(
      ageGroupContextLine({ benchmarkContext: { ageBenchmark: { available: true, ageGroup: "35-39", fieldPercentile: null } } }),
      null,
    );
  });

  test("clamps to top 1% minimum", () => {
    const result = ageGroupContextLine({
      benchmarkContext: {
        ageBenchmark: { available: true, ageGroup: "35-39", fieldPercentile: 99.8 },
      },
    });

    assert.equal(result, "Top 1% in your 35-39 age group");
  });

  test("uses bottom wording instead of top-share wording for low age-group percentiles", () => {
    const result = ageGroupContextLine({
      benchmarkContext: {
        ageBenchmark: { available: true, ageGroup: "35-39", fieldPercentile: 2 },
      },
    });

    assert.equal(result, "Bottom 2% in your 35-39 age group");
    assert.doesNotMatch(result, /Top 98/i);
  });
});

describe("bandScoreLabel", () => {
  test("classifies split gaps by percentage of comparison time", () => {
    assert.equal(bandScoreLabel(-50, 1000), "Strength");
    assert.equal(bandScoreLabel(-20, 1000), "Good");
    assert.equal(bandScoreLabel(50, 1000), "On benchmark");
    assert.equal(bandScoreLabel(150, 1000), "Opportunity");
    assert.equal(bandScoreLabel(151, 1000), "Priority");
  });

  test("uses seconds fallback when comparison time is unavailable", () => {
    assert.equal(bandScoreLabel(-30), "Strength");
    assert.equal(bandScoreLabel(-10), "Good");
    assert.equal(bandScoreLabel(30), "On benchmark");
    assert.equal(bandScoreLabel(90), "Opportunity");
    assert.equal(bandScoreLabel(91), "Priority");
  });

  test("returns null for missing split gap", () => {
    assert.equal(bandScoreLabel(null, 1000), null);
    assert.equal(bandScoreLabel("abc", 1000), null);
  });
});
