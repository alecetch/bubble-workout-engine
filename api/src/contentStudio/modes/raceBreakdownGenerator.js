import { formatSeconds, stationLabel } from "../utils.js";
import { BRAND, mean, updateSlideTotals } from "./modeUtils.js";

export function raceBreakdownGenerator(raceAnalysis, params = {}) {
  const decisive = raceAnalysis.narrativeStats.mostDecisiveStation;
  const variable = raceAnalysis.narrativeStats.mostVariableStation;
  const leastVariable = raceAnalysis.narrativeStats.leastVariableStation;
  const top10 = raceAnalysis.athletes.slice(0, 10);
  const bot10 = raceAnalysis.athletes.slice(-10);
  const top10RunShare = mean(top10.map((athlete) => athlete.runShare));
  const bot10RunShare = mean(bot10.map((athlete) => athlete.runShare));
  const top5Cv = mean(raceAnalysis.athletes.slice(0, 5).map((athlete) => athlete.splitVariance));
  const fieldCvs = raceAnalysis.athletes.map((athlete) => athlete.splitVariance).filter(Number.isFinite).sort((a, b) => a - b);
  const fieldMedianCv = fieldCvs[Math.floor(fieldCvs.length / 2)] ?? null;
  const raceName = params.raceName ?? "This race";
  const headline = `${raceName}: what the data says`;
  const variableStats = raceAnalysis.raceStats.segments[variable] ?? {};
  const slides = updateSlideTotals([
    {
      templateKey: "CS_RB_HOOK",
      layoutType: "hook",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline,
        metrics: [
          { label: "Division", value: `${raceAnalysis.division} ${raceAnalysis.sex}` },
          { label: "Field size", value: `${raceAnalysis.narrativeStats.fieldSize}` },
          { label: "Winning time", value: formatSeconds(raceAnalysis.athletes[0]?.finishTimeSeconds) },
        ],
      },
    },
    {
      templateKey: "CS_RB_DECISIVE",
      layoutType: "verdict",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: decisive ? `${stationLabel(decisive)} was the most decisive station` : "No single station decided this race",
        metrics: decisive ? [{ label: "Correlation", value: `${((raceAnalysis.raceStats.rankCorrelations[decisive] ?? 0) * 100).toFixed(0)}%`, context: "with finish position" }] : [],
      },
    },
    {
      templateKey: "CS_RB_SPREAD",
      layoutType: "data",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: variable ? `${stationLabel(variable)} split the field` : "The field stayed tight",
        metrics: variable ? [
          { label: "Fastest", value: formatSeconds(variableStats.min) },
          { label: "Slowest", value: formatSeconds(variableStats.max) },
          { label: "Gap", value: formatSeconds((variableStats.max ?? 0) - (variableStats.min ?? 0)) },
        ] : [],
      },
    },
    {
      templateKey: "CS_RB_PROFILE",
      layoutType: "comparison",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: "Run balance separated the field",
        metrics: [
          { label: "Top 10 run share", value: `${Math.round((top10RunShare ?? 0) * 100)}%` },
          { label: "Bottom 10 run share", value: `${Math.round((bot10RunShare ?? 0) * 100)}%` },
          { label: "Least variable", value: leastVariable ? stationLabel(leastVariable) : "-" },
        ],
      },
    },
    {
      templateKey: "CS_RB_LESSON",
      layoutType: "cta",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: "What we learned",
        bullets: [
          decisive ? `${stationLabel(decisive)} had the strongest relationship to finish position` : "The race rewarded all-round execution",
          variable ? `${stationLabel(variable)} created the biggest time spread` : "No station created a large split",
          top5Cv != null && fieldMedianCv != null && top5Cv < fieldMedianCv ? "The front of the race was more consistent than the field" : "Consistency still matters across all 16 splits",
        ],
        subline: "Analyse your own HYROX result -> forma.fit",
      },
    },
  ]);

  return {
    modeKey: "race_breakdown",
    headline,
    selectedInsights: raceAnalysis._insights?.slice(0, 3) ?? [],
    carouselSlides: slides,
    captionDraft: `${headline}.\n\n${decisive ? `${stationLabel(decisive)} was the most decisive station.` : "No single station decided the race."}\n\nAnalyse your own HYROX result -> forma.fit`,
    suggestedHandles: [],
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxdata", "#hyroxperformance"],
  };
}
