import assert from "node:assert/strict";
import test from "node:test";
import { analyseRunFade } from "../runFadeAnalyser.js";

function makeSplitMap(times) {
  const keys = ["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8"];
  const map = new Map();
  times.forEach((timeSeconds, index) => {
    if (timeSeconds != null) map.set(keys[index], { timeSeconds });
  });
  return map;
}

test("run1PacingDiagnosis is started_too_fast when Run 1 is >7% faster than median and fade >= 8", () => {
  const result = analyseRunFade(
    { splitMap: makeSplitMap([240, 290, 295, 300, 305, 310, 315, 320]) },
    { primaryBenchmarkGroup: null },
  );

  assert.equal(result.run1PacingDiagnosis, "started_too_fast");
  assert.ok(result.run1VsMedianPct > 7);
});

test("run1PacingDiagnosis is appropriate when Run 1 is close to median", () => {
  const result = analyseRunFade(
    { splitMap: makeSplitMap([290, 290, 295, 295, 300, 305, 305, 310]) },
    { primaryBenchmarkGroup: null },
  );

  assert.equal(result.run1PacingDiagnosis, "appropriate");
});

test("run1PacingDiagnosis is unavailable when fewer than 4 splits present", () => {
  const result = analyseRunFade(
    { splitMap: makeSplitMap([285, 290, null, null, null, null, null, 320]) },
    { primaryBenchmarkGroup: null },
  );

  assert.equal(result.run1PacingDiagnosis, "unavailable");
});

test("run1PacingDiagnosis is started_slightly_fast when run1VsMedianPct is 5-7%", () => {
  const result = analyseRunFade(
    { splitMap: makeSplitMap([275, 290, 290, 290, 292, 293, 294, 295]) },
    { primaryBenchmarkGroup: null },
  );

  assert.equal(result.run1PacingDiagnosis, "started_slightly_fast");
});
