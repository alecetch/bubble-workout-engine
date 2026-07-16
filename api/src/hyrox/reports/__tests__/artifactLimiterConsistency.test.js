import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCaption } from "../../sharePack/captionBuilder.js";
import { buildEmailReport } from "../emailReportBuilder.js";
import { buildHyroxRaceCardData } from "../raceCardDataMapper.js";
import { buildTemplateA } from "../templateSlotMapper.js";

function tieBreakAnalysis() {
  return {
    race: { finishTimeSeconds: 4361, targetTimeSeconds: 3600 },
    athlete: { division: "open" },
    benchmarkContext: {
      goalBenchmarkGroup: { targetFinishSeconds: 3600, label: "sub-60" },
      primaryBenchmarkGroup: { label: "Open Male" },
      achievedBand: "sub_65",
    },
    headline: {
      biggestLimiter: {
        segmentKey: "wall_balls",
        label: "Wall Balls",
        type: "station",
        timeGapSeconds: 105,
        percentile: 60,
      },
    },
    timePotential: { headlineGainSeconds: 105 },
    segments: [
      { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4361, frameGapSeconds: 761, percentile: 45 },
      { segmentKey: "sled_push", type: "station", label: "Sled Push", userSeconds: 420, frameGapSeconds: 95, timeGapToMedianSeconds: 95, percentile: 30, confidence: "high" },
      { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 430, frameGapSeconds: 105, timeGapToMedianSeconds: 105, percentile: 60, confidence: "high" },
    ],
    penalties: [],
  };
}

describe("HYROX artifact limiter consistency", () => {
  it("names the largest seconds-gap limiter across email, carousel, race card, and caption", () => {
    const analysisJson = tieBreakAnalysis();
    const athleteContext = { displayName: "Alex Smith", targetFinishTimeSeconds: 3600 };
    const interpretation = {
      primaryThesis: { category: "station_capacity", confidence: "high" },
      sectionOrder: [],
      summaryBullets: [],
      secondaryTheses: [],
    };

    const email = buildEmailReport({ sections: [] }, analysisJson, athleteContext, interpretation, "target");
    const carousel = buildTemplateA(analysisJson, [], athleteContext);
    const raceCard = buildHyroxRaceCardData(analysisJson, athleteContext);
    const caption = buildCaption({ slide0: carousel.slides[0], athleteContext, analysisJson });

    assert.match(email.htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH WALL BALLS/i);
    assert.doesNotMatch(email.htmlBody, /THE ROUTE TO 1:00:00 STARTS WITH SLED PUSH/i);
    assert.equal(carousel.slides[0].biggest_limiter, "WALL BALLS");
    assert.equal(carousel.slides[3].station, "WALL BALLS");
    assert.equal(raceCard.biggestLimiter.name, "Wall Balls");
    assert.match(caption, /Biggest opportunity: WALL BALLS/);
    assert.doesNotMatch(caption, /Biggest opportunity: SLED PUSH/);
  });
});
