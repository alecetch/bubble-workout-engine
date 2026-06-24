import { formatSeconds, ordinal, stationLabel, interpolatePercentile } from "../utils.js";
import { BRAND, STATION_KEYS, archetypeLabel, findAthlete, resolveHandle } from "./modeUtils.js";

export function athleteSpotlightGenerator(raceAnalysis, params, athleteRegistry = []) {
  const { athleteName } = params ?? {};
  if (!athleteName) throw new Error("athleteName is required for Athlete Spotlight mode");

  const athlete = findAthlete(raceAnalysis, athleteName);
  if (!athlete) throw new Error(`Athlete "${athleteName}" not found in race data`);

  const n = raceAnalysis.athletes.length;
  const profile = archetypeLabel(athlete, n);
  const stationTimings = STATION_KEYS
    .filter((key) => athlete.splits[key] != null && raceAnalysis.raceStats.segments[key])
    .map((key) => {
      const seg = raceAnalysis.raceStats.segments[key];
      const rank = athlete.ranks?.[key] ?? null;
      const rankPct = rank != null ? Math.round((rank / seg.sampleSize) * 100) : null;
      return { key, time: athlete.splits[key], rank, rankPct, median: seg.median };
    });
  const sorted = [...stationTimings].sort((a, b) => (a.rankPct ?? 99) - (b.rankPct ?? 99));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const histFinish = interpolatePercentile(athlete.finishTimeSeconds, raceAnalysis.historicalBenchmarks?.finish_time);
  const selectedInsights = (raceAnalysis._insights ?? [])
    .filter((insight) => insight.athletesInvolved?.includes(athlete.name))
    .slice(0, 3);
  const headline = `What made ${athlete.name} ${athlete.rank === 1 ? "win" : `finish ${athlete.rank}${ordinal(athlete.rank)}`}`;

  const carouselSlides = [
    {
      templateKey: "CS_AS_HOOK",
      layoutType: "hook",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline,
        subline: `Rank ${athlete.rank} - ${formatSeconds(athlete.finishTimeSeconds)}`,
        athleteNames: [athlete.name],
        bullets: ["Here's what the data says about their race"],
      },
      slideIndex: 1,
      totalSlides: 5,
    },
    {
      templateKey: "CS_AS_PROFILE",
      layoutType: "data",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: `Run vs Stations: ${profile}`,
        metrics: [
          { label: "Running total", value: formatSeconds(athlete.runTotalSeconds), context: `Rank ${athlete.runRank}${ordinal(athlete.runRank)} in race` },
          { label: "Station total", value: formatSeconds(athlete.stationTotalSeconds), context: `Rank ${athlete.stationRank}${ordinal(athlete.stationRank)} in race` },
          { label: "Run share", value: `${Math.round((athlete.runShare ?? 0) * 100)}%` },
        ],
        athleteNames: [athlete.name],
      },
      slideIndex: 2,
      totalSlides: 5,
    },
    {
      templateKey: "CS_AS_STRENGTH",
      layoutType: "data",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: best ? `Best: ${stationLabel(best.key)}` : "Running was their strength",
        metrics: best ? [
          { label: stationLabel(best.key), value: formatSeconds(best.time), context: `Top ${best.rankPct}% in this race` },
          ...(histFinish != null ? [{ label: "Finish time historically", value: `Top ${histFinish}%` }] : []),
        ] : [],
        athleteNames: [athlete.name],
      },
      slideIndex: 3,
      totalSlides: 5,
    },
    {
      templateKey: "CS_AS_WEAKNESS",
      layoutType: "data",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: worst ? `Opportunity: ${stationLabel(worst.key)}` : "A remarkably balanced performance",
        metrics: worst ? [
          { label: stationLabel(worst.key), value: formatSeconds(worst.time), context: `Rank ${worst.rank}${ordinal(worst.rank)} in race` },
          { label: "Time vs median", value: `${worst.time - worst.median >= 0 ? "+" : ""}${formatSeconds(Math.round(worst.time - worst.median))} vs median` },
        ] : [],
        athleteNames: [athlete.name],
      },
      slideIndex: 4,
      totalSlides: 5,
    },
    {
      templateKey: "CS_AS_LESSON",
      layoutType: "cta",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: "What this tells everyday athletes",
        bullets: [
          best ? `Elite performance at ${stationLabel(best.key)} is a genuine differentiator` : "Consistency across all segments is a winning strategy",
          worst ? `Even podium athletes have a weakest station - find yours` : "Balance is achievable - and it wins races",
          "Do not guess - know your data",
        ],
        subline: "What does your HYROX data say? -> forma.fit",
      },
      slideIndex: 5,
      totalSlides: 5,
    },
  ];

  const handle = resolveHandle(athlete.name, athleteRegistry);
  return {
    modeKey: "athlete_spotlight",
    headline,
    selectedInsights,
    carouselSlides,
    captionDraft: [
      `${headline}.`,
      "",
      best ? `Strongest station: ${stationLabel(best.key)} (top ${best.rankPct}% in race)` : "",
      worst ? `Biggest opportunity: ${stationLabel(worst.key)} (${formatSeconds(Math.round(worst.time - worst.median))} vs median)` : "",
      `${profile} archetype`,
      "",
      "Know your numbers -> forma.fit",
    ].filter(Boolean).join("\n"),
    suggestedHandles: handle ? [handle] : [],
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxperformance", "#hybridathlete", "#hyroxtraining"],
  };
}
