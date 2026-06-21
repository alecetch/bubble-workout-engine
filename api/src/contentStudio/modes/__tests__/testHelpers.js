import { analyseRaceEvent } from "../../raceEventAnalyser.js";
import { athleteRows, mockBenchmarkPool } from "../../__tests__/fixtures.js";

export async function raceAnalysis(overrides = {}) {
  const analysis = await analyseRaceEvent(athleteRows(overrides), "open", "male", mockBenchmarkPool);
  analysis._insights = [
    {
      headline: "Athlete 1 changed the race",
      evidence: ["Overall rank: 1st"],
      supportingMetrics: {},
      athletesInvolved: ["Athlete 1"],
      scores: { compositeScore: 0.8, confidenceScore: 0.7, noveltyScore: 0.6 },
    },
  ];
  return analysis;
}
