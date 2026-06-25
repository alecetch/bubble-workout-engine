import test from "node:test";
import assert from "node:assert/strict";
import { interpolatePercentile } from "../src/contentStudio/utils.js";

const benchmarks = {
  p10_seconds: 4000,
  p25_seconds: 4500,
  p50_seconds: 5000,
  p75_seconds: 5500,
  p90_seconds: 6000,
  p95_seconds: 6500,
};

test("value at p50 returns 50", () => {
  assert.equal(interpolatePercentile(5000, benchmarks), 50);
});

test("value between p25 and p50 interpolates correctly", () => {
  const result = interpolatePercentile(4750, benchmarks);
  assert.ok(result >= 37 && result <= 38, `Expected 37-38, got ${result}`);
});

test("value faster than p10 extrapolates below 10", () => {
  assert.equal(interpolatePercentile(3500, benchmarks), 1);
});

test("value slightly faster than p10 extrapolates to 5-9", () => {
  const result = interpolatePercentile(3900, benchmarks);
  assert.ok(result >= 5 && result <= 9, `Expected 5-9, got ${result}`);
});

test("value at p10 exactly returns 10", () => {
  assert.equal(interpolatePercentile(4000, benchmarks), 10);
});

test("value at p95 exactly returns 95", () => {
  assert.equal(interpolatePercentile(6500, benchmarks), 95);
});

test("value slower than p95 extrapolates above 95", () => {
  assert.equal(interpolatePercentile(7000, benchmarks), 99);
});

test("null value returns null", () => {
  assert.equal(interpolatePercentile(null, benchmarks), null);
});

test("null benchmarks returns null", () => {
  assert.equal(interpolatePercentile(5000, null), null);
});

test("benchmarks with fewer than 2 valid points returns null", () => {
  assert.equal(interpolatePercentile(5000, { p50_seconds: 5000 }), null);
});

test("p95_seconds absent falls back to p90 as max point", () => {
  const noPct95 = {
    p10_seconds: 4000,
    p25_seconds: 4500,
    p50_seconds: 5000,
    p75_seconds: 5500,
    p90_seconds: 6000,
  };
  assert.equal(interpolatePercentile(6000, noPct95), 90);
});
