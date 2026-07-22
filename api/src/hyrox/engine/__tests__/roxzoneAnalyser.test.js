import assert from "node:assert/strict";
import test from "node:test";
import { analyseRoxzone } from "../roxzoneAnalyser.js";
import { normaliseSubmission } from "../segmentNormaliser.js";

const stations = ["ski_erg", "sled_push", "sled_pull", "burpee_broad_jump", "row", "farmers_carry", "sandbag_lunges", "wall_balls"];

function submissionWithReplay(entrySeconds = [8, 4, 14, 34, 39, 47, 61, null], exitSeconds = [29, 36, 29, 22, 18, 19, 78, null]) {
  return normaliseSubmission({
    race: { finishTimeSeconds: 5000 },
    // Entry/exit data is only trusted for a station whose own split is present and not
    // itself a repaired estimate - real submissions always have both from the same page,
    // so give every station a plausible split time here to isolate the entry/exit behaviour
    // under test rather than tripping the missing-split exclusion.
    splits: stations.map((station) => ({ segmentKey: station, type: "station", timeSeconds: 280 })),
    raceReplay: stations.map((station, index) => ({
      station,
      entrySeconds: entrySeconds[index],
      exitSeconds: exitSeconds[index],
    })),
  });
}

test("entry/exit available populates replay fields", () => {
  const result = analyseRoxzone(submissionWithReplay(), {});
  assert.equal(result.entryExitAvailable, true);
  assert.ok(result.entryTrend);
  assert.ok(result.worstEntry);
  assert.ok(result.worstExit);
  assert.ok(result.stationOverhead.length > 0);
});

test("entryTrend rising when entry times increase", () => {
  const result = analyseRoxzone(submissionWithReplay([8, 12, 18, 24, 32, 45, 61, null]), {});
  assert.equal(result.entryTrend, "rising");
});

test("worstExit is sandbag_lunges for example race", () => {
  const result = analyseRoxzone(submissionWithReplay(), {});
  assert.equal(result.worstExit.stationKey, "sandbag_lunges");
});

test("builds roxzone narrative with replay total, official difference, and display rows", () => {
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 5000 },
    splits: [
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 273 },
      ...stations.map((station) => ({ segmentKey: station, type: "station", timeSeconds: 280 })),
    ],
    raceReplay: stations.map((station, index) => ({
      station,
      entrySeconds: [5, 3, 11, 13, 17, 45, 49, 278][index],
      exitSeconds: [31, 24, 24, 6, 17, 11, 15, null][index],
    })),
  });
  const result = analyseRoxzone(normalised, {});
  assert.equal(result.roxzoneNarrative.available, true);
  assert.equal(result.roxzoneNarrative.replayTotalSeconds, 271);
  assert.equal(result.roxzoneNarrative.officialTotalSeconds, 273);
  assert.equal(result.roxzoneNarrative.roundingDifferenceSeconds, 2);
  assert.equal(result.roxzoneNarrative.displayRows.length, 8);
  assert.deepEqual(result.roxzoneNarrative.displayRows[7], {
    stationKey: "wall_balls",
    label: "Wall Balls",
    entrySeconds: null,
    exitSeconds: null,
    roxzoneSeconds: null,
    measurable: false,
  });
  assert.ok(result.roxzoneNarrative.scenarioTags.includes("late_race_drift"));
});

test("no entry/exit splits reports unavailable", () => {
  const result = analyseRoxzone(normaliseSubmission({ race: { finishTimeSeconds: 5000 }, splits: [] }), {});
  assert.equal(result.entryExitAvailable, false);
});

test("excludes entry/exit data for a station whose own split is missing (unrepairable)", () => {
  // Two stations missing (row, sled_pull) so the residual repair can't fire - matches the
  // real-world case where a station's own boundary marker is also missing from the replay,
  // producing a corrupted combined transition time if not excluded.
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 5000 },
    splits: stations.filter((s) => s !== "row" && s !== "sled_pull").map((station) => ({ segmentKey: station, type: "station", timeSeconds: 280 })),
    raceReplay: stations.map((station, index) => ({
      station,
      entrySeconds: [8, 4, 14, 34, 46, 47, 61, null][index],
      exitSeconds: [29, 36, 49, 22, 3605, 19, 78, null][index],
    })),
  });
  const result = analyseRoxzone(normalised, {});
  assert.equal(result.stationOverhead.some((row) => row.stationKey === "row"), false);
  assert.equal(result.stationOverhead.some((row) => row.stationKey === "sled_pull"), false);
  assert.equal(result.entryBreakdown.some((row) => row.stationKey === "row"), false);
  assert.equal(result.exitBreakdown.some((row) => row.stationKey === "row"), false);
});

test("excludes entry/exit data for a station whose split was repaired via residual estimate", () => {
  // Only row missing - triggers the single-missing-split repair (estimated: true) rather
  // than leaving it unrepairable. The repaired split is still not trustworthy enough to
  // anchor a specific transition-time claim, so its entry/exit data should still be excluded.
  const normalised = normaliseSubmission({
    race: { finishTimeSeconds: 5762 },
    roxzoneMode: "explicit_total",
    splits: [
      ...stations.filter((s) => s !== "row").map((station) => ({ segmentKey: station, type: "station", timeSeconds: 280 })),
      { segmentKey: "run_1", type: "run", timeSeconds: 300 },
      { segmentKey: "run_2", type: "run", timeSeconds: 300 },
      { segmentKey: "run_3", type: "run", timeSeconds: 300 },
      { segmentKey: "run_4", type: "run", timeSeconds: 300 },
      { segmentKey: "run_5", type: "run", timeSeconds: 300 },
      { segmentKey: "run_6", type: "run", timeSeconds: 300 },
      { segmentKey: "run_7", type: "run", timeSeconds: 300 },
      { segmentKey: "run_8", type: "run", timeSeconds: 300 },
      { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 500 },
    ],
    raceReplay: stations.map((station, index) => ({
      station,
      entrySeconds: [8, 4, 14, 34, 46, 47, 61, null][index],
      exitSeconds: [29, 36, 49, 22, 3605, 19, 78, null][index],
    })),
  });
  assert.equal(normalised.splitMap.get("row")?.estimated, true);
  const result = analyseRoxzone(normalised, {});
  assert.equal(result.stationOverhead.some((row) => row.stationKey === "row"), false);
});
