import assert from "node:assert/strict";
import test from "node:test";
import { normaliseSubmission } from "../segmentNormaliser.js";
import { RUN_KEYS, STATION_KEYS } from "../../config/segmentMap.js";

const stationKeys = ["ski_erg", "sled_push", "sled_pull", "burpee_broad_jump", "row", "farmers_carry", "sandbag_lunges", "wall_balls"];

function raceSplits({ omit = [], runSeconds = 300, stationSeconds = 200 } = {}) {
  const omitted = new Set(omit);
  return [
    ...RUN_KEYS
      .filter((segmentKey) => !omitted.has(segmentKey))
      .map((segmentKey) => ({ segmentKey, type: "run", timeSeconds: runSeconds })),
    ...STATION_KEYS
      .filter((segmentKey) => !omitted.has(segmentKey))
      .map((segmentKey) => ({ segmentKey, type: "station", timeSeconds: stationSeconds })),
  ];
}

test("partial run splits do not create a total run time or inferred RoxZone", () => {
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 7061 },
    splits: [
      { segmentKey: "run_1", type: "run", timeSeconds: 379 },
      ...stationKeys.map((segmentKey) => ({ segmentKey, type: "station", timeSeconds: 300 })),
    ],
  });

  assert.equal(normalised.runTimeSeconds, null);
  assert.equal(normalised.roxzoneTimeSeconds, null);
  assert.equal(normalised.roxzoneMode, "none");
  assert.equal(normalised.aggregateSegments.some((segment) => segment.segmentKey === "run_time"), false);
});

test("official aggregate run and RoxZone totals are preserved", () => {
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 4800 },
    splits: [
      { segmentKey: "run_1", type: "run", timeSeconds: 300 },
      { segmentKey: "run_time", type: "aggregate", timeSeconds: 2400 },
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 420 },
      ...stationKeys.map((segmentKey) => ({ segmentKey, type: "station", timeSeconds: 240 })),
    ],
  });

  assert.equal(normalised.runTimeSeconds, 2400);
  assert.equal(normalised.roxzoneTimeSeconds, 420);
  assert.equal(normalised.roxzoneMode, "explicit_total");
  assert.equal(normalised.aggregateSegments.find((segment) => segment.segmentKey === "run_time")?.timeSeconds, 2400);
});

test("single missing station split is repaired from race total and explicit RoxZone", () => {
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 4520 },
    splits: [
      ...raceSplits({ omit: ["row"] }),
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 300 },
    ],
  });

  assert.equal(normalised.splitMap.get("row")?.timeSeconds, 420);
  assert.equal(normalised.splitMap.get("row")?.estimated, true);
  assert.equal(normalised.penaltyAdjustedSplitMap.get("row")?.estimated, true);
  assert.deepEqual(normalised.estimatedSplitKeys, ["row"]);
  assert.deepEqual(normalised.unrepairableMissingSplitKeys, []);
  assert.equal(normalised.runTimeSeconds + normalised.workTimeSeconds + normalised.roxzoneTimeSeconds, normalised.race.finishTimeSeconds);
});

test("single missing run split is repaired from race total and explicit RoxZone", () => {
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 4360 },
    splits: [
      ...raceSplits({ omit: ["run_4"] }),
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 300 },
    ],
  });

  assert.equal(normalised.splitMap.get("run_4")?.timeSeconds, 360);
  assert.equal(normalised.splitMap.get("run_4")?.estimated, true);
  assert.deepEqual(normalised.estimatedSplitKeys, ["run_4"]);
  assert.equal(normalised.runTimeSeconds + normalised.workTimeSeconds + normalised.roxzoneTimeSeconds, normalised.race.finishTimeSeconds);
});

test("two or more missing station splits are unrepairable and do not create station aggregate", () => {
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 4520 },
    splits: [
      ...raceSplits({ omit: ["row", "farmers_carry"] }),
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 300 },
    ],
  });

  assert.equal(normalised.workTimeSeconds, null);
  assert.equal([...normalised.splitMap.values()].some((split) => split.estimated), false);
  assert.deepEqual(normalised.estimatedSplitKeys, []);
  assert.deepEqual(normalised.unrepairableMissingSplitKeys, ["row", "farmers_carry"]);
});

test("repair is skipped when RoxZone would need to be inferred from total", () => {
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 4520 },
    splits: raceSplits({ omit: ["row"] }),
  });

  assert.equal(normalised.splitMap.has("row"), false);
  assert.equal(normalised.workTimeSeconds, null);
  assert.equal(normalised.roxzoneMode, "none");
  assert.deepEqual(normalised.estimatedSplitKeys, []);
  assert.deepEqual(normalised.unrepairableMissingSplitKeys, ["row"]);
});

test("repair is discarded when the residual split would be negative", () => {
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 1000 },
    splits: [
      ...raceSplits({ omit: ["row"], stationSeconds: 500 }),
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 300 },
    ],
  });

  assert.equal(normalised.splitMap.has("row"), false);
  assert.equal(normalised.workTimeSeconds, null);
  assert.deepEqual(normalised.estimatedSplitKeys, []);
  assert.deepEqual(normalised.unrepairableMissingSplitKeys, ["row"]);
});

test("missing split key arrays cover complete, repaired, and unrepairable submissions", () => {
  const complete = normaliseSubmission({
    race: { finishTimeSeconds: 4300 },
    splits: raceSplits(),
  });
  const repaired = normaliseSubmission({
    race: { finishTimeSeconds: 4520 },
    splits: [
      ...raceSplits({ omit: ["row"] }),
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 300 },
    ],
  });
  const unrepairable = normaliseSubmission({
    race: { finishTimeSeconds: 4520 },
    splits: [
      ...raceSplits({ omit: ["row", "run_4"] }),
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 300 },
    ],
  });

  assert.deepEqual(complete.estimatedSplitKeys, []);
  assert.deepEqual(complete.unrepairableMissingSplitKeys, []);
  assert.equal(complete.roxzoneMode, "inferred_total");
  assert.deepEqual(repaired.estimatedSplitKeys, ["row"]);
  assert.deepEqual(repaired.unrepairableMissingSplitKeys, []);
  assert.deepEqual(unrepairable.estimatedSplitKeys, []);
  assert.deepEqual(unrepairable.unrepairableMissingSplitKeys, ["run_4", "row"]);
});
