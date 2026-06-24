import { formatSeconds, stationLabel } from "../utils.js";
import { ALL_SEGMENTS, BRAND, findAthlete, resolveHandle } from "./modeUtils.js";

export function headToHeadGenerator(raceAnalysis, params, athleteRegistry = []) {
  const { athleteA: nameA, athleteB: nameB } = params ?? {};
  if (!nameA || !nameB) throw new Error("athleteA and athleteB are required");
  const a = findAthlete(raceAnalysis, nameA);
  const b = findAthlete(raceAnalysis, nameB);
  if (!a) throw new Error(`Athlete "${nameA}" not found`);
  if (!b) throw new Error(`Athlete "${nameB}" not found`);

  const deltas = ALL_SEGMENTS
    .filter((key) => a.splits[key] != null && b.splits[key] != null)
    .map((key) => ({
      segment: key,
      deltaSeconds: a.splits[key] - b.splits[key],
      winner: a.splits[key] < b.splits[key] ? a.name : b.name,
      absGap: Math.abs(a.splits[key] - b.splits[key]),
    }));
  const aWins = deltas.filter((d) => d.winner === a.name).sort((x, y) => y.absGap - x.absGap);
  const bWins = deltas.filter((d) => d.winner === b.name).sort((x, y) => y.absGap - x.absGap);
  const decisiveSegment = [...deltas].sort((x, y) => y.absGap - x.absGap)[0];
  const overallWinner = a.rank < b.rank ? a : b;
  const overallLoser = a.rank < b.rank ? b : a;
  const finishMargin = Math.abs(a.finishTimeSeconds - b.finishTimeSeconds);
  const runDelta = (a.runTotalSeconds ?? 0) - (b.runTotalSeconds ?? 0);
  const stationDelta = (a.stationTotalSeconds ?? 0) - (b.stationTotalSeconds ?? 0);
  const headline = `${overallWinner.name} vs ${overallLoser.name}: Where the race was decided`;

  const carouselSlides = [
    {
      templateKey: "CS_HH_SETUP",
      layoutType: "hook",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline,
        metrics: [
          { label: a.name, value: formatSeconds(a.finishTimeSeconds), context: `Rank ${a.rank}` },
          { label: b.name, value: formatSeconds(b.finishTimeSeconds), context: `Rank ${b.rank}` },
          { label: "Margin", value: formatSeconds(finishMargin) },
        ],
        athleteNames: [a.name, b.name],
      },
      slideIndex: 1,
      totalSlides: 6,
    },
    {
      templateKey: "CS_HH_OVERVIEW",
      layoutType: "comparison",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline: "Run vs Stations",
        metrics: [
          { label: `${a.name} running`, value: formatSeconds(a.runTotalSeconds) },
          { label: `${b.name} running`, value: formatSeconds(b.runTotalSeconds) },
          { label: `${a.name} stations`, value: formatSeconds(a.stationTotalSeconds) },
          { label: `${b.name} stations`, value: formatSeconds(b.stationTotalSeconds) },
        ],
        athleteNames: [a.name, b.name],
      },
      slideIndex: 2,
      totalSlides: 6,
    },
    edgeSlide("CS_HH_A_WINS", a.name, aWins, 3),
    edgeSlide("CS_HH_B_WINS", b.name, bWins, 4),
    {
      templateKey: "CS_HH_DECISIVE",
      layoutType: "verdict",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline: decisiveSegment ? `This is where it was decided: ${stationLabel(decisiveSegment.segment)}` : "The race unfolded evenly until the finish",
        metrics: decisiveSegment ? [
          { label: a.name, value: formatSeconds(a.splits[decisiveSegment.segment]) },
          { label: b.name, value: formatSeconds(b.splits[decisiveSegment.segment]) },
          { label: "Gap", value: formatSeconds(decisiveSegment.absGap) },
        ] : [],
        athleteNames: [a.name, b.name],
      },
      slideIndex: 5,
      totalSlides: 6,
    },
    {
      templateKey: "CS_HH_LESSON",
      layoutType: "cta",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline: "What this teaches us",
        bullets: [
          runDelta < -30 ? `${a.name}'s running advantage was decisive` : stationDelta < -30 ? `${a.name}'s station work won it` : "A balanced performance beat a specialist profile",
          decisiveSegment ? `${stationLabel(decisiveSegment.segment)} was the key differentiator` : "Consistent splits throughout separated them",
          "Knowing your weak points is the first step",
        ],
        subline: "Analyse your own HYROX result -> forma.fit",
      },
      slideIndex: 6,
      totalSlides: 6,
    },
  ];

  return {
    modeKey: "head_to_head",
    headline,
    selectedInsights: [],
    carouselSlides,
    captionDraft: [
      `${headline}.`,
      "",
      aWins[0] ? `${a.name} stronger at: ${stationLabel(aWins[0].segment)} (+${formatSeconds(aWins[0].absGap)})` : "",
      bWins[0] ? `${b.name} stronger at: ${stationLabel(bWins[0].segment)} (+${formatSeconds(bWins[0].absGap)})` : "",
      decisiveSegment ? `Race decided at: ${stationLabel(decisiveSegment.segment)}` : "",
      "",
      "What does your data say? -> forma.fit",
    ].filter(Boolean).join("\n"),
    suggestedHandles: [resolveHandle(a.name, athleteRegistry), resolveHandle(b.name, athleteRegistry)].filter(Boolean),
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxperformance", "#hybridathlete"],
  };
}

function edgeSlide(templateKey, name, wins, slideIndex) {
  return {
    templateKey,
    layoutType: "data",
    brand: BRAND,
    contentType: "head_to_head",
    dataFields: {
      headline: `Where ${name} had the edge`,
      segmentDeltas: wins.slice(0, 3).map((d) => ({ segment: stationLabel(d.segment), deltaSeconds: d.absGap, winner: name })),
      athleteNames: [name],
    },
    slideIndex,
    totalSlides: 6,
  };
}
