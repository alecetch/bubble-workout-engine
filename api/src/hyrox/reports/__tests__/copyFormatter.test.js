import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatOverallStanding, regionalContextLine } from "../copyFormatter.js";

test("formatOverallStanding: low percentile shows Top X% not raw ordinal", () => {
  assert.equal(formatOverallStanding(40), "Top 60% overall");
  assert.equal(formatOverallStanding(25), "Top 75% overall");
  assert.equal(formatOverallStanding(10), "Top 90% overall");
});

test("formatOverallStanding: high percentile still shows Top X%", () => {
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

test("formatOverallStanding: no raw percentile ordinal in any output", () => {
  for (let p = 1; p <= 99; p += 1) {
    const result = formatOverallStanding(p);
    assert.ok(
      !result?.includes("percentile"),
      `percentile ${p} should not produce raw ordinal, got: ${result}`,
    );
  }
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
    assert.match(line, /top 55%/);
  });

  test("returns weaker-field sentence when regionalPct is higher by at least 5pp", () => {
    const line = regionalContextLine(make(70, 55));

    assert.match(line, /^Globally, where fields/);
    assert.match(line, /top 45%/);
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
