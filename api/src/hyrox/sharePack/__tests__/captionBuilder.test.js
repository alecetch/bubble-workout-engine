import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCaption } from "../captionBuilder.js";

describe("buildCaption", () => {
  it("renders full caption data", () => {
    const caption = buildCaption({
      slide0: {
        overall_time: "1:02:10",
        biggest_limiter: "Wall Balls",
        best_station: "Sled Pull",
      },
      athleteContext: { targetFinishTimeSeconds: 3300 },
      analysisJson: { penalties: { totalPenaltySeconds: 90 } },
    });

    assert.match(caption, /Finish time: 1:02:10/);
    assert.match(caption, /Target: 55:00/);
    assert.match(caption, /Penalties: 1:30 to clean up/);
    assert.match(caption, /Biggest opportunity: Wall Balls/);
    assert.match(caption, /Biggest strength: Sled Pull/);
  });

  it("omits target when no target time exists", () => {
    const caption = buildCaption({ slide0: { overall_time: "1:02:10" } });
    assert.equal(caption.includes("Target:"), false);
  });

  it("omits penalties below 60 seconds", () => {
    const caption = buildCaption({ slide0: { overall_time: "1:02:10" }, analysisJson: { penalties: { totalPenaltySeconds: 30 } } });
    assert.equal(caption.includes("Penalties:"), false);
  });

  it("omits strength when best station is missing", () => {
    const caption = buildCaption({ slide0: { overall_time: "1:02:10", biggest_limiter: "Wall Balls" } });
    assert.equal(caption.includes("Biggest strength:"), false);
  });

  it("handles empty input", () => {
    const caption = buildCaption();
    assert.match(caption, /Finish time: -/);
    assert.match(caption, /#HYROX/);
  });
});
