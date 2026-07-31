import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roxzoneActionability } from "../roxzoneActionability.js";

describe("roxzoneActionability", () => {
  it("uses the shared frame-aware RoxZone gap without changing action copy", () => {
    const action = roxzoneActionability({
      segments: [{
        segmentKey: "roxzone_time",
        label: "RoxZone",
        frameGapSeconds: 198,
        timeGapToMedianSeconds: 222,
      }],
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_total",
        totalSeconds: 420,
        timeGapToMedianSeconds: 222,
      },
    }, { segmentKey: "roxzone_time", label: "RoxZone" });

    assert.equal(action.gapSeconds, 198);
    assert.equal(action.gapText, "3:18");
    assert.equal(action.confidence, "aggregate");
    assert.match(action.emailLead, /RoxZone is costing about 3:18/i);
    assert.equal(action.raceCardCta, "TIGHTEN ENTRY AND EXIT FLOW.");
  });

  it("uses team-coordination wording for doubles RoxZone opportunities", () => {
    const action = roxzoneActionability({
      athlete: { division: "doubles_male" },
      segments: [{
        segmentKey: "roxzone_time",
        label: "RoxZone",
        frameGapSeconds: 198,
        timeGapToMedianSeconds: 222,
      }],
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 420,
        timeGapToMedianSeconds: 222,
        entryExitAvailable: true,
      },
    }, { segmentKey: "roxzone_time", label: "RoxZone" });

    assert.equal(action.isDoubles, true);
    assert.equal(action.actionText, "Rehearse team station entry, hand-off, and exit routes: arrive together, set up once, and leave immediately.");
    assert.match(action.emailLead, /costing the team about 3:18/i);
    assert.match(action.emailLead, /combined team time/i);
    assert.equal(action.carouselAction, "TIGHTEN TEAM HAND-OFFS");
    assert.equal(action.raceCardCta, "TIGHTEN TEAM HAND-OFFS.");
  });
});
