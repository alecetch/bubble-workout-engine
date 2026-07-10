import assert from "node:assert/strict";
import test from "node:test";
import { normaliseSubmission } from "../segmentNormaliser.js";

const stationKeys = ["ski_erg", "sled_push", "sled_pull", "burpee_broad_jump", "row", "farmers_carry", "sandbag_lunges", "wall_balls"];

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
