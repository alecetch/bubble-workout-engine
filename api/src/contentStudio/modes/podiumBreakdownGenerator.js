import { formatSeconds, ordinal, stationLabel } from "../utils.js";
import { BRAND, STATION_KEYS, archetypeLabel, updateSlideTotals } from "./modeUtils.js";

export function podiumBreakdownGenerator(raceAnalysis) {
  const podium = raceAnalysis.athletes.slice(0, 3);
  if (podium.length < 3) throw new Error("At least three athletes are required for Podium Breakdown mode");
  const n = raceAnalysis.athletes.length;
  const topQuartile = Math.ceil(n / 4);
  const sharedStrengths = STATION_KEYS.filter((key) => podium.every((athlete) => (athlete.ranks?.[key] ?? Infinity) <= topQuartile));
  const differences = STATION_KEYS
    .map((key) => {
      const ranks = podium.map((athlete) => athlete.ranks?.[key]).filter(Number.isFinite);
      return { key, spread: ranks.length ? Math.max(...ranks) - Math.min(...ranks) : 0 };
    })
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 3);
  const decisive = raceAnalysis.narrativeStats.mostDecisiveStation;
  const headline = `How the podium was built: ${podium.map((athlete) => athlete.name).join(", ")}`;
  const slides = updateSlideTotals([
    {
      templateKey: "CS_PB_HOOK",
      layoutType: "hook",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline,
        metrics: podium.map((athlete) => ({ label: `${athlete.rank}${ordinal(athlete.rank)} - ${athlete.name}`, value: formatSeconds(athlete.finishTimeSeconds) })),
        athleteNames: podium.map((athlete) => athlete.name),
      },
    },
    {
      templateKey: "CS_PB_SHARED",
      layoutType: "data",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: "Shared podium strengths",
        bullets: sharedStrengths.length ? sharedStrengths.slice(0, 3).map((key) => `${stationLabel(key)}: all top quartile`) : ["No single station was shared top quartile by all three."],
        athleteNames: podium.map((athlete) => athlete.name),
      },
    },
    {
      templateKey: "CS_PB_DIFFERENCES",
      layoutType: "comparison",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: "Where their profiles diverged",
        metrics: differences.map((item) => ({ label: stationLabel(item.key), value: `${item.spread} rank spread` })),
      },
    },
    {
      templateKey: "CS_PB_DECISIVE",
      layoutType: "verdict",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: decisive ? `${stationLabel(decisive)} mattered most` : "No single station dominated",
        metrics: decisive ? [{ label: "Rank correlation", value: `${((raceAnalysis.raceStats.rankCorrelations[decisive] ?? 0) * 100).toFixed(0)}%` }] : [],
      },
    },
    {
      templateKey: "CS_PB_ARCHETYPES",
      layoutType: "data",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: "Three podium profiles",
        metrics: podium.map((athlete) => ({ label: athlete.name, value: archetypeLabel(athlete, n), context: `Run ${athlete.runRank}${ordinal(athlete.runRank)} / Station ${athlete.stationRank}${ordinal(athlete.stationRank)}` })),
        athleteNames: podium.map((athlete) => athlete.name),
      },
    },
    {
      templateKey: "CS_PB_LESSON",
      layoutType: "cta",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: "To reach the podium",
        bullets: [
          decisive ? `Know whether ${stationLabel(decisive)} is decisive in your field` : "Build a complete race profile",
          sharedStrengths[0] ? `Podium athletes shared strength at ${stationLabel(sharedStrengths[0])}` : "There are multiple paths to the podium",
          "Use race data to decide where training time goes next",
        ],
        subline: "Know your numbers -> forma.fit",
      },
    },
  ]);

  return {
    modeKey: "podium_breakdown",
    headline,
    selectedInsights: [],
    carouselSlides: slides,
    captionDraft: `${headline}.\n\n${decisive ? `Most decisive station: ${stationLabel(decisive)}.` : "The podium was balanced."}\n\nKnow your numbers -> forma.fit`,
    suggestedHandles: [],
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxpodium", "#hyroxperformance"],
  };
}
