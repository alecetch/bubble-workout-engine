import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRADE_RANK } from "../../confidence/confidenceConfig.js";
import { INSIGHT_ENGINE_GRADE_RANK } from "../insightEngine.js";
import { evaluateTrigger } from "../triggerEvaluator.js";

const ROXZONE_INEFFICIENT_DEF = Object.freeze({
  id: "INSIGHT_009",
  enabled: true,
  triggerKey: "ROXZONE_INEFFICIENT",
});

describe("insightEngine confidence grade ordering", () => {
  it("uses the canonical GRADE_RANK object from confidenceConfig", () => {
    assert.equal(INSIGHT_ENGINE_GRADE_RANK, GRADE_RANK);
  });
});

describe("ROXZONE_INEFFICIENT evidence", () => {
  it("uses the frame-aware RoxZone gap for potential gain in analyse-mode band frames", () => {
    const result = evaluateTrigger(ROXZONE_INEFFICIENT_DEF, {
      segments: [{
        segmentKey: "roxzone_time",
        label: "RoxZone",
        timeGapToMedianSeconds: 222,
        frameGapSeconds: 198,
      }],
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_total",
        percentile: 28,
        timeGapToMedianSeconds: 222,
      },
    });

    assert.equal(result.eligible, true);
    assert.equal(result.evidenceValues.primaryValue, 222);
    assert.equal(result.evidenceValues.potentialGainSeconds, 198);
  });

  it("uses the exact-target RoxZone gap for target-mode potential gain", () => {
    const result = evaluateTrigger(ROXZONE_INEFFICIENT_DEF, {
      segments: [{
        segmentKey: "roxzone_time",
        label: "RoxZone",
        timeGapToMedianSeconds: 315,
        timeGapToExactTargetSeconds: 376,
      }],
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_total",
        percentile: 28,
        timeGapToMedianSeconds: 315,
      },
    });

    assert.equal(result.eligible, true);
    assert.equal(result.evidenceValues.primaryValue, 315);
    assert.equal(result.evidenceValues.potentialGainSeconds, 376);
  });
});
