import { formatSeconds, humanDuration, stationLabel } from "../utils.js";
import { ALL_SEGMENTS, BRAND, findAthlete, flipName, resolveHandle } from "./modeUtils.js";

export function headToHeadGenerator(raceAnalysis, params, athleteRegistry = []) {
  const { athleteA: nameA, athleteB: nameB } = params ?? {};
  if (!nameA || !nameB) throw new Error("athleteA and athleteB are required");
  const a = findAthlete(raceAnalysis, nameA);
  const b = findAthlete(raceAnalysis, nameB);
  if (!a) throw new Error(`Athlete "${nameA}" not found`);
  if (!b) throw new Error(`Athlete "${nameB}" not found`);
  const aDisplay = flipName(a.name);
  const bDisplay = flipName(b.name);

  const deltas = ALL_SEGMENTS
    .filter((key) => a.splits[key] != null && b.splits[key] != null)
    .map((key) => ({
      segment: key,
      deltaSeconds: a.splits[key] - b.splits[key],
      winner: a.splits[key] < b.splits[key] ? a.name : b.name,
      absGap: Math.abs(a.splits[key] - b.splits[key]),
    }));
  const decisiveSegment = [...deltas].sort((x, y) => y.absGap - x.absGap)[0];
  const overallWinner = a.rank < b.rank ? a : b;
  const overallLoser = a.rank < b.rank ? b : a;
  const finishMargin = Math.abs(a.finishTimeSeconds - b.finishTimeSeconds);
  const runDelta = (a.runTotalSeconds ?? 0) - (b.runTotalSeconds ?? 0);
  const stationDelta = (a.stationTotalSeconds ?? 0) - (b.stationTotalSeconds ?? 0);
  const headline = `${flipName(overallWinner.name)} vs ${flipName(overallLoser.name)}: Where the race was decided`;

  // Punchy hook headline — lead with the data, not the description
  const hookHeadline = decisiveSegment
    ? `Won by ${humanDuration(finishMargin)}. Built a ${humanDuration(decisiveSegment.absGap)} lead at ${stationLabel(decisiveSegment.segment)}.`
    : `${humanDuration(finishMargin)} separated them. Here's why.`;

  // Lesson bullets tied to this specific race's decisive factor
  const lessonBullets = [
    decisiveSegment
      ? `The ${stationLabel(decisiveSegment.segment)} gap (${formatSeconds(decisiveSegment.absGap)}) was bigger than the finish margin — the race was decided before the last run`
      : `No single station stood out — the margin was built through consistency`,
    runDelta < -30
      ? `${aDisplay}'s running advantage (${formatSeconds(Math.abs(runDelta))} faster total) compounded across 8 run legs`
      : stationDelta < -30
        ? `Station work — not running speed — separated these two athletes`
        : `Neither athlete had a meaningful running edge — stations decided it`,
    `In HYROX your weakest station costs more than a slower run leg — know where yours is`,
  ];

  const carouselSlides = [
    // Slide 1 — Hook: punchy, data-first, swipe prompt
    {
      templateKey: "CS_HH_HOOK",
      layoutType: "hook",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline: hookHeadline,
        subline: `${aDisplay} vs ${bDisplay} · swipe to see where the race was decided →`,
        athleteNames: [aDisplay, bDisplay],
      },
      slideIndex: 1,
      totalSlides: 5,
    },
    // Slide 2 — The decisive moment (promoted from slide 5 — this is the money slide)
    {
      templateKey: "CS_HH_DECISIVE",
      layoutType: "verdict",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline: decisiveSegment
          ? `This is where it was decided: ${stationLabel(decisiveSegment.segment)}`
          : "The race unfolded evenly until the finish",
        metrics: decisiveSegment ? [
          { label: aDisplay, value: formatSeconds(a.splits[decisiveSegment.segment]), context: `Rank ${a.ranks?.[decisiveSegment.segment] ?? "—"}` },
          { label: bDisplay, value: formatSeconds(b.splits[decisiveSegment.segment]), context: `Rank ${b.ranks?.[decisiveSegment.segment] ?? "—"}` },
          { label: "Gap", value: `+${formatSeconds(decisiveSegment.absGap)}` },
        ] : [],
        athleteNames: [aDisplay, bDisplay],
      },
      slideIndex: 2,
      totalSlides: 5,
    },
    // Slide 3 — Run vs Stations side-by-side (two-column layout)
    {
      templateKey: "CS_HH_OVERVIEW",
      layoutType: "comparison",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline: "Run vs Stations",
        columns: [
          {
            header: aDisplay,
            stats: [
              { label: "Running", value: formatSeconds(a.runTotalSeconds) },
              { label: "Stations", value: formatSeconds(a.stationTotalSeconds) },
            ],
          },
          {
            header: bDisplay,
            stats: [
              { label: "Running", value: formatSeconds(b.runTotalSeconds) },
              { label: "Stations", value: formatSeconds(b.stationTotalSeconds) },
            ],
          },
        ],
        athleteNames: [aDisplay, bDisplay],
      },
      slideIndex: 3,
      totalSlides: 5,
    },
    // Slide 4 — The lesson: specific to this race's decisive factor
    {
      templateKey: "CS_HH_LESSON",
      layoutType: "data",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline: "What this tells us",
        bullets: lessonBullets,
        athleteNames: [aDisplay, bDisplay],
      },
      slideIndex: 4,
      totalSlides: 5,
    },
    // Slide 5 — CTA: personal and specific
    {
      templateKey: "CS_HH_CTA",
      layoutType: "cta",
      brand: BRAND,
      contentType: "head_to_head",
      dataFields: {
        headline: "What's your weakest station?",
        subline: "Find out in 2 minutes at forma.fit",
        bullets: ["Know your numbers before race day"],
      },
      slideIndex: 5,
      totalSlides: 5,
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
      decisiveSegment
        ? `Race decided at ${stationLabel(decisiveSegment.segment)} — ${formatSeconds(decisiveSegment.absGap)} gap vs ${formatSeconds(finishMargin)} finish margin.`
        : "",
      runDelta < -30
        ? `${aDisplay} had the running edge.`
        : stationDelta < -30
          ? `Station work separated them.`
          : "",
      "",
      "What's your weakest station? Find out at forma.fit",
    ].filter(Boolean).join("\n"),
    suggestedHandles: [resolveHandle(a.name, athleteRegistry), resolveHandle(b.name, athleteRegistry)].filter(Boolean),
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxperformance", "#hybridathlete"],
  };
}
