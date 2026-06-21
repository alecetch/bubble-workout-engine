import { stationLabel } from "../utils.js";
import { BRAND } from "./modeUtils.js";

export const MYTHS = {
  sleds: {
    claim: '"HYROX is won on the sleds."',
    correlationKey: "combined_sled",
    alternativeKey: "run_total",
    nuance: "Sled performance matters - but it rarely decides the race alone. Running consistency and wall balls often have more predictive power.",
  },
  wall_balls: {
    claim: '"Wall balls decide races."',
    correlationKey: "wall_balls",
    alternativeKey: "run_total",
    nuance: "Wall balls are important - but athletes who suffer here often struggle with running too. It may be a fitness signal, not the cause.",
  },
  running: {
    claim: '"Running does not matter in HYROX - it is all about the stations."',
    correlationKey: "run_total",
    alternativeKey: "station_total",
    nuance: "Running matters more than most athletes assume. The 8 running legs are 48% of the race by distance.",
  },
  stations: {
    claim: '"HYROX is a strength sport - stations decide everything."',
    correlationKey: "station_total",
    alternativeKey: "run_total",
    nuance: "Stations matter, but in most races, running is equally or more predictive. True HYROX performance requires both.",
  },
};

export function mythBusterGenerator(raceAnalysis, params) {
  const mythKey = params?.myth;
  if (!MYTHS[mythKey]) throw new Error(`Unknown myth key "${mythKey}". Valid: ${Object.keys(MYTHS).join(", ")}`);
  const myth = MYTHS[mythKey];
  const correlation = raceAnalysis.raceStats.rankCorrelations[myth.correlationKey] ?? 0;
  const altCorrelation = raceAnalysis.raceStats.rankCorrelations[myth.alternativeKey] ?? 0;

  let verdict;
  let findingText;
  if (mythKey === "running") {
    verdict = correlation >= 0.65 ? "BUSTED" : correlation >= 0.45 ? "NUANCED" : "CONFIRMED";
    findingText = `Running rank correlated ${(correlation * 100).toFixed(0)}% with finish position in this race`;
  } else if (mythKey === "stations") {
    verdict = correlation > altCorrelation ? "CONFIRMED" : correlation > 0.45 ? "NUANCED" : "BUSTED";
    findingText = `Station total correlation: ${(correlation * 100).toFixed(0)}% vs running: ${(altCorrelation * 100).toFixed(0)}%`;
  } else {
    verdict = correlation >= 0.65 ? "CONFIRMED" : correlation >= 0.45 ? "NUANCED" : "BUSTED";
    findingText = `${stationLabel(myth.correlationKey)} rank correlated ${(correlation * 100).toFixed(0)}% with finish position`;
  }

  const headline = verdict === "BUSTED"
    ? `MYTH BUSTED: ${myth.claim}`
    : verdict === "CONFIRMED"
      ? `The data supports it: ${myth.claim}`
      : `It is complicated: ${myth.claim}`;
  const relationship = correlation >= 0.65 ? "Strong predictive relationship" : correlation >= 0.45 ? "Moderate predictive relationship" : "Weak predictive relationship";

  const carouselSlides = [
    {
      templateKey: "CS_MB_CLAIM",
      layoutType: "hook",
      brand: BRAND,
      contentType: "myth_buster",
      dataFields: { headline: "Common HYROX belief:", subline: myth.claim, bullets: ["We tested it against real race data."] },
      slideIndex: 1,
      totalSlides: 5,
    },
    {
      templateKey: "CS_MB_DATA",
      layoutType: "data",
      brand: BRAND,
      contentType: "myth_buster",
      dataFields: {
        headline: "Here is what the data says",
        metrics: [
          { label: "Correlation with finish position", value: `${(correlation * 100).toFixed(0)}%`, context: "100% = perfectly predictive" },
          { label: "Alternative metric", value: `${(altCorrelation * 100).toFixed(0)}%`, context: `${stationLabel(myth.alternativeKey)} correlation` },
          { label: "Field size", value: `${raceAnalysis.athletes.length} athletes` },
        ],
      },
      slideIndex: 2,
      totalSlides: 5,
    },
    {
      templateKey: "CS_MB_EVIDENCE",
      layoutType: "data",
      brand: BRAND,
      contentType: "myth_buster",
      dataFields: {
        headline: findingText,
        bullets: [`Sample: ${raceAnalysis.athletes.length} athletes`, `Race: ${raceAnalysis.division} ${raceAnalysis.sex}`, relationship],
      },
      slideIndex: 3,
      totalSlides: 5,
    },
    {
      templateKey: "CS_MB_NUANCE",
      layoutType: "lesson",
      brand: BRAND,
      contentType: "myth_buster",
      dataFields: {
        headline: "But here is the nuance",
        bullets: [myth.nuance, "Single-race findings should be interpreted carefully.", "Data from this race only - different fields may show different patterns."],
      },
      slideIndex: 4,
      totalSlides: 5,
    },
    {
      templateKey: "CS_MB_VERDICT",
      layoutType: "verdict",
      brand: BRAND,
      contentType: "myth_buster",
      dataFields: { headline: verdict, verdict, subline: "Analyse your HYROX result -> forma.fit", bullets: ["Know your numbers. Know your race."] },
      slideIndex: 5,
      totalSlides: 5,
    },
  ];

  return {
    modeKey: "myth_buster",
    headline,
    selectedInsights: [],
    carouselSlides,
    captionDraft: [`${headline}.`, "", `${findingText}.`, myth.nuance, "", "Powered by real race data -> forma.fit"].join("\n"),
    suggestedHandles: [],
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxdata", "#hyroxperformance", "#mythbusted"],
  };
}
