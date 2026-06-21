import { athleteSpotlightGenerator } from "./modes/athleteSpotlightGenerator.js";
import { headToHeadGenerator } from "./modes/headToHeadGenerator.js";
import { podiumBreakdownGenerator } from "./modes/podiumBreakdownGenerator.js";
import { raceBreakdownGenerator } from "./modes/raceBreakdownGenerator.js";
import { mythBusterGenerator } from "./modes/mythBusterGenerator.js";
import { whatWeLearnGenerator } from "./modes/whatWeLearnGenerator.js";

export async function generateContentForMode(mode, raceAnalysis, params = {}, athletes = []) {
  switch (mode) {
    case "athlete_spotlight": return athleteSpotlightGenerator(raceAnalysis, params, athletes);
    case "head_to_head": return headToHeadGenerator(raceAnalysis, params, athletes);
    case "podium_breakdown": return podiumBreakdownGenerator(raceAnalysis, params, athletes);
    case "race_breakdown": return raceBreakdownGenerator(raceAnalysis, params, athletes);
    case "myth_buster": return mythBusterGenerator(raceAnalysis, params, athletes);
    case "what_we_learn": return whatWeLearnGenerator(raceAnalysis, params, athletes);
    default: throw new Error(`Unknown content mode: ${mode}`);
  }
}
