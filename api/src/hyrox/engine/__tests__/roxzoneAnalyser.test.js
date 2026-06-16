import assert from "node:assert/strict";
import test from "node:test";
import { analyseRoxzone } from "../roxzoneAnalyser.js";
import { normaliseSubmission } from "../segmentNormaliser.js";

const stations = ["ski_erg", "sled_push", "sled_pull", "burpee_broad_jump", "row", "farmers_carry", "sandbag_lunges", "wall_balls"];

function submissionWithReplay(entrySeconds = [8, 4, 14, 34, 39, 47, 61, null], exitSeconds = [29, 36, 29, 22, 18, 19, 78, null]) {
  return normaliseSubmission({
    race: { finishTimeSeconds: 5000 },
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

test("no entry/exit splits reports unavailable", () => {
  const result = analyseRoxzone(normaliseSubmission({ race: { finishTimeSeconds: 5000 }, splits: [] }), {});
  assert.equal(result.entryExitAvailable, false);
});
