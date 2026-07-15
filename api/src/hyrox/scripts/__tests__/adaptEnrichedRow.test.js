import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERFORMANCE_BAND_THRESHOLDS_MINUTES } from "../../config/benchmarkThresholds.js";
import { PERFORMANCE_BANDS, performanceBandForSeconds } from "../adaptEnrichedRow.js";

describe("adaptEnrichedRow performance bands", () => {
  it("derives script band keys from the canonical threshold list", () => {
    const thresholdsFromScriptBands = PERFORMANCE_BANDS
      .filter((band) => band.startsWith("sub_"))
      .map((band) => Number(band.replace("sub_", "")));

    assert.deepEqual(thresholdsFromScriptBands, PERFORMANCE_BAND_THRESHOLDS_MINUTES);
    assert.equal(PERFORMANCE_BANDS.at(-1), "over_120");
  });

  it("classifies threshold boundaries using the canonical threshold list", () => {
    for (const threshold of PERFORMANCE_BAND_THRESHOLDS_MINUTES) {
      assert.equal(performanceBandForSeconds(threshold * 60 - 1), `sub_${threshold}`);
    }
    assert.equal(performanceBandForSeconds(60 * 60), "sub_65");
    assert.equal(performanceBandForSeconds(120 * 60), "over_120");
  });
});
