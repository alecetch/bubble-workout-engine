import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvedFrameGapSeconds, resolvedStatGapSeconds, resolvedUserSeconds } from "../gapSelectors.js";

describe("gapSelectors", () => {
  it("resolvedUserSeconds prefers finite net-of-penalty seconds", () => {
    assert.equal(resolvedUserSeconds({ userSecondsNetOfPenalty: 420, userSeconds: 600 }), 420);
  });

  it("resolvedUserSeconds falls back to raw user seconds when net seconds are absent or invalid", () => {
    assert.equal(resolvedUserSeconds({ userSeconds: 600 }), 600);
    assert.equal(resolvedUserSeconds({ userSecondsNetOfPenalty: Number.NaN, userSeconds: 600 }), 600);
    assert.equal(resolvedUserSeconds({ userSecondsNetOfPenalty: null, userSeconds: Number.POSITIVE_INFINITY }), null);
  });

  it("resolvedStatGapSeconds preserves stat-level penalty-aware precedence", () => {
    assert.equal(resolvedStatGapSeconds({ timeGapToMedianSecondsNetOfPenalty: -30, timeGapToMedianSeconds: 120 }), -30);
    assert.equal(resolvedStatGapSeconds({ timeGapToMedianSeconds: 120 }), 120);
    assert.equal(resolvedStatGapSeconds({}), null);
  });

  it("resolvedFrameGapSeconds preserves frame-level penalty-aware precedence", () => {
    assert.equal(resolvedFrameGapSeconds({
      frameGapNetOfPenaltySeconds: -60,
      frameGapSeconds: 120,
      timeGapToExactTargetSeconds: 80,
      timeGapToMedianSeconds: 40,
    }), -60);
    assert.equal(resolvedFrameGapSeconds({ frameGapSeconds: 120, timeGapToExactTargetSeconds: 80, timeGapToMedianSeconds: 40 }), 120);
    assert.equal(resolvedFrameGapSeconds({ timeGapToExactTargetSeconds: 80, timeGapToMedianSeconds: 40 }), 80);
    assert.equal(resolvedFrameGapSeconds({ timeGapToMedianSeconds: 40 }), 40);
    assert.equal(resolvedFrameGapSeconds(null), null);
  });
});
