import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOverallStanding } from "../copyFormatter.js";

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
