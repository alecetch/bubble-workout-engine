import assert from "node:assert/strict";
import test from "node:test";
import { assembleReport } from "../src/hyrox/reports/reportAssembler.js";

test("email report uses penalty interpretation hero and callout", () => {
  const report = assembleReport({
    outputType: "email_report",
    athleteContext: { displayName: "Alec Test", division: "open" },
    analysisJson: {
      race: { finishTimeSeconds: 5738, division: "open" },
      penalties: [{ penaltySeconds: 300, runKey: "run_5" }],
      headline: { biggestLimiter: { label: "Wall Balls", segmentKey: "wall_balls", type: "station", timeGapSeconds: 120, percentile: 34 } },
      timePotential: { headlineGainSeconds: null },
      scores: { engineScore: 60 },
      runningAnalysis: { available: true, runFadePct: 4, runPattern: "even" },
      roxzoneAnalysis: { available: false },
      benchmarkContext: { primaryBenchmarkGroup: { label: "open male" } },
      stationBreakdown: [
        { segmentKey: "wall_balls", label: "Wall Balls", confidence: "high", percentile: 34, timeGapSeconds: 120 },
        { segmentKey: "sled_pull", label: "Sled Pull", confidence: "high", percentile: 40, timeGapSeconds: 80 },
      ],
      segments: [
        { segmentKey: "total_time", type: "aggregate", label: "Total Race Time", userSeconds: 5738, percentile: 40 },
        { segmentKey: "run_1", type: "run", label: "Run 1", userSeconds: 300, timeGapToMedianSeconds: 20 },
        { segmentKey: "run_2", type: "run", label: "Run 2", userSeconds: 300, timeGapToMedianSeconds: 20 },
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 480, timeGapToMedianSeconds: 120 },
      ],
    },
    insights: [],
  });

  assert.match(report.emailHtml, /FIRST TARGET WIN/);
  assert.doesNotMatch(report.emailHtml, />0:00</);
  assert.doesNotMatch(report.emailHtml, /YOUR HYROX ANALYSIS IS READY/);
  assert.match(report.emailHtml, /PENALTY ANALYSIS/);
  assert.doesNotMatch(report.emailHtml, /STATION BREAKDOWN/);
});

