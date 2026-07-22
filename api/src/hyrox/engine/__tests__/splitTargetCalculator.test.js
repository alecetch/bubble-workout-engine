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

function customSegments({ race = [], runTime = null, workTime = null, roxzoneTime = null, totalTime }) {
  const rows = race.map(([key, type, goal, user]) => segment(key, type, goal, user));
  if (runTime) rows.push(segment("run_time", "aggregate", runTime.goal, runTime.user ?? runTime.goal + 10));
  if (workTime) rows.push(segment("work_time", "aggregate", workTime.goal, workTime.user ?? workTime.goal + 10));
  if (roxzoneTime) rows.push(segment("roxzone_time", "aggregate", roxzoneTime.goal, roxzoneTime.user ?? roxzoneTime.goal + 10));
  rows.push(segment("total_time", "aggregate", totalTime.goal, totalTime.user ?? totalTime.goal + 10));
  return rows;
}

function referenceCaseSegments() {
  return customSegments({
    race: [
      ["run_1", "run", 1748],
      ["ski_erg", "station", 1491],
    ],
    runTime: { goal: 1748 },
    workTime: { goal: 1491 },
    roxzoneTime: { goal: 246, user: 296 },
    totalTime: { goal: 3526 },
  });
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

  it("keeps RoxZone target close to its proportional target when component goals have a mismatch", () => {
    const targetFinishSeconds = 3300;
    const goalTotal = 3526;
    const roxzoneGoal = 246;
    const proportional = Math.round(roxzoneGoal * targetFinishSeconds / goalTotal);
    const oldResidual = targetFinishSeconds
      - Math.round(1748 * targetFinishSeconds / goalTotal)
      - Math.round(1490 * targetFinishSeconds / goalTotal);

    const result = computeExactTargetMap(referenceCaseSegments(), targetFinishSeconds, true);
    const roxzoneTarget = result.get("roxzone_time");

    assert.ok(Math.abs(roxzoneTarget - proportional) <= 5);
    assert.ok(roxzoneTarget < oldResidual);
    assert.ok(roxzoneTarget >= proportional);
  });

  it("reconciles aggregate targets exactly when component goals have a mismatch", () => {
    const result = computeExactTargetMap(referenceCaseSegments(), 3300, true);
    assert.equal(result.get("run_time") + result.get("work_time") + result.get("roxzone_time"), 3300);
  });

  it("keeps proportional RoxZone target when components already sum cleanly", () => {
    const input = customSegments({
      race: [
        ["run_1", "run", 2000],
        ["ski_erg", "station", 2500],
      ],
      runTime: { goal: 2000 },
      workTime: { goal: 2500 },
      roxzoneTime: { goal: 500 },
      totalTime: { goal: 5000 },
    });

    const result = computeExactTargetMap(input, 4000, true);
    assert.equal(result.get("roxzone_time"), Math.round(500 * 4000 / 5000));
    assert.equal(result.get("run_time") + result.get("work_time") + result.get("roxzone_time"), 4000);
  });

  it("reproduces the RoxZone target from the reference reconciliation case", () => {
    const result = computeExactTargetMap(referenceCaseSegments(), 3300, true);
    assert.ok(Math.abs(result.get("roxzone_time") - 232) <= 1);
    assert.equal(result.get("run_time"), 1656);
    assert.equal(result.get("work_time"), 1412);
    assert.equal(result.get("run_time") + result.get("work_time") + result.get("roxzone_time"), 3300);
  });

  it("falls back to residual RoxZone target when RoxZone benchmark data is missing", () => {
    const input = customSegments({
      race: [
        ["run_1", "run", 2000],
        ["ski_erg", "station", 1500],
      ],
      runTime: { goal: 2000 },
      workTime: { goal: 1500 },
      totalTime: { goal: 4000 },
    });
    const targetFinishSeconds = 3000;
    const result = computeExactTargetMap(input, targetFinishSeconds, true);
    const expectedRun = Math.round(2000 * targetFinishSeconds / 4000);
    const expectedWork = Math.round(1500 * targetFinishSeconds / 4000);

    assert.equal(result.get("roxzone_time"), Math.max(0, Math.round(targetFinishSeconds - expectedRun - expectedWork)));
  });

  it("never returns a negative RoxZone target", () => {
    const input = customSegments({
      race: [
        ["run_1", "run", 9000],
        ["ski_erg", "station", 9000],
      ],
      runTime: { goal: 9000 },
      workTime: { goal: 9000 },
      roxzoneTime: { goal: 100 },
      totalTime: { goal: 10000 },
    });

    const result = computeExactTargetMap(input, 100, true);
    assert.ok(result.get("roxzone_time") >= 0);
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
