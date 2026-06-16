import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeExactTargetMap, attachExactTargets } from "../splitTargetCalculator.js";

const raceRows = [
  ["run_1", "run", 238],
  ["ski_erg", "station", 252],
  ["run_2", "run", 262],
  ["sled_push", "station", 156],
  ["run_3", "run", 284],
  ["sled_pull", "station", 240],
  ["run_4", "run", 282],
  ["burpee_broad_jump", "station", 238],
  ["run_5", "run", 289],
  ["row", "station", 269],
  ["run_6", "run", 283],
  ["farmers_carry", "station", 110],
  ["run_7", "run", 282],
  ["sandbag_lunges", "station", 245],
  ["run_8", "run", 313],
  ["wall_balls", "station", 304],
];

function segment(segmentKey, type, goalBenchmarkSeconds, userSeconds = goalBenchmarkSeconds + 10) {
  return {
    segmentKey,
    type,
    goalBenchmarkSeconds,
    userSeconds,
  };
}

function segments() {
  const rows = raceRows.map(([key, type, goal]) => segment(key, type, goal));
  rows.push(segment("run_time", "aggregate", 2233, 2775));
  rows.push(segment("work_time", "aggregate", 1814, 2533));
  rows.push(segment("roxzone_time", "aggregate", 399, 430));
  rows.push(segment("total_time", "aggregate", 4446, 5738));
  return rows;
}

describe("splitTargetCalculator", () => {
  it("computeExactTargetMap returns null when hasGoalGroup is false", () => {
    assert.equal(computeExactTargetMap(segments(), 4800, false), null);
  });

  it("computeExactTargetMap returns null when targetFinishSeconds is null", () => {
    assert.equal(computeExactTargetMap(segments(), null, true), null);
  });

  it("computeExactTargetMap returns null when goalTotal is missing", () => {
    assert.equal(computeExactTargetMap(segments().filter((row) => row.segmentKey !== "total_time"), 4800, true), null);
  });

  it("applies the scale factor correctly", () => {
    const result = computeExactTargetMap(segments(), 4800, true);
    assert.equal(result.get("run_1"), Math.round(238 * 4800 / 4446));
  });

  it("aggregate targets sum to targetFinishSeconds", () => {
    const result = computeExactTargetMap(segments(), 4800, true);
    assert.equal(result.get("run_time") + result.get("work_time") + result.get("roxzone_time"), 4800);
  });

  it("total_time exact target equals targetFinishSeconds exactly", () => {
    const result = computeExactTargetMap(segments(), 4800, true);
    assert.equal(result.get("total_time"), 4800);
  });

  it("attachExactTargets with null map sets null fields", () => {
    const result = attachExactTargets(segments().slice(0, 2), null);
    assert.equal(result[0].exactTargetSeconds, null);
    assert.equal(result[0].timeGapToExactTargetSeconds, null);
    assert.equal(result[1].exactTargetSeconds, null);
    assert.equal(result[1].timeGapToExactTargetSeconds, null);
  });

  it("attachExactTargets with valid map calculates gap", () => {
    const map = new Map([["run_1", 257]]);
    const result = attachExactTargets([segment("run_1", "run", 238, 305)], map);
    assert.equal(result[0].exactTargetSeconds, 257);
    assert.equal(result[0].timeGapToExactTargetSeconds, 48);
  });

  it("attachExactTargets does not mutate original segments", () => {
    const input = [segment("run_1", "run", 238, 305)];
    const result = attachExactTargets(input, new Map([["run_1", 257]]));
    assert.notEqual(result[0], input[0]);
    assert.equal(Object.hasOwn(input[0], "exactTargetSeconds"), false);
    assert.equal(Object.hasOwn(input[0], "timeGapToExactTargetSeconds"), false);
  });
});
