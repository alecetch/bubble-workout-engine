import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRADE_RANK } from "../../confidence/confidenceConfig.js";
import { CONFIDENCE, CONFIDENCE_GRADE_KEYS } from "../insightRanker.js";

describe("insightRanker confidence weights", () => {
  it("defines a deliberate weight for every canonical letter grade", () => {
    assert.deepEqual([...CONFIDENCE_GRADE_KEYS].sort(), Object.keys(GRADE_RANK).sort());

    for (const grade of Object.keys(GRADE_RANK)) {
      assert.notEqual(CONFIDENCE[grade], undefined, `missing insight ranker confidence weight for grade ${grade}`);
    }
  });

  it("keeps non-letter confidence labels available for legacy report insights", () => {
    assert.equal(CONFIDENCE.high, 1);
    assert.equal(CONFIDENCE.medium, 0.7);
    assert.equal(CONFIDENCE.low, 0.4);
  });
});
