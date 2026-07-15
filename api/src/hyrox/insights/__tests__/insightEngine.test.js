import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRADE_RANK } from "../../confidence/confidenceConfig.js";
import { INSIGHT_ENGINE_GRADE_RANK } from "../insightEngine.js";

describe("insightEngine confidence grade ordering", () => {
  it("uses the canonical GRADE_RANK object from confidenceConfig", () => {
    assert.equal(INSIGHT_ENGINE_GRADE_RANK, GRADE_RANK);
  });
});
