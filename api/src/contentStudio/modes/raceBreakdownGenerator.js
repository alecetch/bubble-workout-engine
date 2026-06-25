import { formatSeconds, humanDuration, stationLabel } from "../utils.js";
import { BRAND, mean, updateSlideTotals } from "./modeUtils.js";

export function raceBreakdownGenerator(raceAnalysis, params = {}) {
  const decisive = raceAnalysis.narrativeStats.mostDecisiveStation;
  const fieldSize = raceAnalysis.narrativeStats.fieldSize;
  const winner = raceAnalysis.athletes[0];
  const top10 = raceAnalysis.athletes.slice(0, 10);
  const bot10 = raceAnalysis.athletes.slice(-10);

  // Average run and station times for top vs bottom of field
  const top10AvgRun     = mean(top10.map((a) => a.runTotalSeconds));
  const bot10AvgRun     = mean(bot10.map((a) => a.runTotalSeconds));
  const top10AvgStation = mean(top10.map((a) => a.stationTotalSeconds));
  const bot10AvgStation = mean(bot10.map((a) => a.stationTotalSeconds));
  const runGap     = (bot10AvgRun     ?? 0) - (top10AvgRun     ?? 0);
  const stationGap = (bot10AvgStation ?? 0) - (top10AvgStation ?? 0);
  const stationsDecided = stationGap > runGap;

  // Decisive station evidence
  const decisiveStats  = decisive ? (raceAnalysis.raceStats.segments[decisive] ?? {}) : {};
  const decisiveSpread = decisive && decisiveStats.max != null && decisiveStats.min != null
    ? decisiveStats.max - decisiveStats.min : null;
  const decisiveCorr   = decisive
    ? Math.round((raceAnalysis.raceStats.rankCorrelations?.[decisive] ?? 0) * 100) : null;

  // Field profile
  const finishStats = raceAnalysis.raceStats.segments.finish_time ?? {};

  const raceName = params.raceName ?? null;
  const headline = raceName ? `${raceName}: what the data says` : "What the data found";

  const safeRound = (v) => (v != null && Number.isFinite(v) ? Math.round(v) : null);

  const slides = updateSlideTotals([
    // Slide 1 — Hook: scale + promise of insight
    {
      templateKey: "CS_RB_HOOK",
      layoutType: "hook",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: raceName
          ? `${fieldSize} athletes ran ${raceName}. Here's what the data found.`
          : `${fieldSize} athletes. One decisive station. Here's what the data found.`,
        metrics: [
          { label: "Field size", value: `${fieldSize} athletes` },
          { label: "Winning time", value: formatSeconds(winner?.finishTimeSeconds) },
          { label: "Median time", value: formatSeconds(finishStats.median) },
        ],
      },
    },
    // Slide 2 — Decisive station: plain English + spread as evidence
    {
      templateKey: "CS_RB_DECISIVE",
      layoutType: "verdict",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: decisive
          ? `Your ${stationLabel(decisive)} rank predicted your finish rank`
          : "No single station decided this race",
        subline: decisive && decisiveCorr != null
          ? `${decisiveCorr}% correlation — stronger than any other station`
          : null,
        metrics: decisive && decisiveSpread != null ? [
          { label: "Fastest in field", value: formatSeconds(decisiveStats.min) },
          { label: "Slowest in field", value: formatSeconds(decisiveStats.max) },
          { label: "Total spread", value: humanDuration(decisiveSpread) },
        ] : [],
      },
    },
    // Slide 3 — Run vs stations: directional finding, two-column layout
    {
      templateKey: "CS_RB_PROFILE",
      layoutType: "comparison",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: stationsDecided
          ? "Stations split the field more than running"
          : "Running speed was the bigger differentiator",
        subline: stationsDecided
          ? `Station gap: ${humanDuration(safeRound(stationGap))} · Run gap: ${humanDuration(safeRound(runGap))}`
          : `Run gap: ${humanDuration(safeRound(runGap))} · Station gap: ${humanDuration(safeRound(stationGap))}`,
        columns: [
          {
            header: "Top 10",
            stats: [
              { label: "Avg running",  value: formatSeconds(safeRound(top10AvgRun)) },
              { label: "Avg stations", value: formatSeconds(safeRound(top10AvgStation)) },
            ],
          },
          {
            header: "Bottom 10",
            stats: [
              { label: "Avg running",  value: formatSeconds(safeRound(bot10AvgRun)) },
              { label: "Avg stations", value: formatSeconds(safeRound(bot10AvgStation)) },
            ],
          },
        ],
      },
    },
    // Slide 4 — Field profile: where does your time fit?
    {
      templateKey: "CS_RB_SPREAD",
      layoutType: "data",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: "Where does your time fit?",
        metrics: [
          { label: "Winner",     value: formatSeconds(finishStats.min),    context: "Top of the field" },
          { label: "Top 10%",   value: formatSeconds(finishStats.p10),    context: `Faster than 90% of finishers` },
          { label: "Median",    value: formatSeconds(finishStats.median), context: "Middle of the field" },
          { label: "Bottom 10%", value: formatSeconds(finishStats.p90),   context: `Slower than 90% of finishers` },
        ],
      },
    },
    // Slide 5 — CTA: personal and connected to slide 4
    {
      templateKey: "CS_RB_CTA",
      layoutType: "cta",
      brand: BRAND,
      contentType: "race",
      dataFields: {
        headline: "Where would you have finished?",
        subline: "Compare your splits against this field at forma.fit",
        bullets: ["Know your station profile before race day → forma.fit"],
      },
    },
  ]);

  return {
    modeKey: "race_breakdown",
    headline,
    selectedInsights: raceAnalysis._insights?.slice(0, 3) ?? [],
    carouselSlides: slides,
    captionDraft: [
      `${headline}.`,
      "",
      decisive
        ? `${stationLabel(decisive)} predicted finish position more than any other station (${decisiveCorr}% correlation).`
        : "No single station decided this race.",
      stationsDecided
        ? `Stations split the field by ${humanDuration(safeRound(stationGap))} — more than the running gap (${humanDuration(safeRound(runGap))}).`
        : `Running split the field by ${humanDuration(safeRound(runGap))} — more than the station gap (${humanDuration(safeRound(stationGap))}).`,
      "",
      "Where would you have finished? → forma.fit",
    ].filter(Boolean).join("\n"),
    suggestedHandles: [],
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxdata", "#hyroxperformance"],
  };
}
