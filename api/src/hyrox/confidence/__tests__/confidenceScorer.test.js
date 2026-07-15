import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRADE_RANK } from "../confidenceConfig.js";
import { isGradeAtLeast } from "../confidenceScorer.js";

describe("confidenceScorer grade ordering", () => {
  it("uses the shared GRADE_RANK ordering for grade comparisons", () => {
    for (const [grade, gradeRank] of Object.entries(GRADE_RANK)) {
      for (const [minimumGrade, minimumRank] of Object.entries(GRADE_RANK)) {
        assert.equal(
          isGradeAtLeast(grade, minimumGrade),
          gradeRank >= minimumRank,
          `${grade} >= ${minimumGrade}`,
        );
      }
    }
  });
});
