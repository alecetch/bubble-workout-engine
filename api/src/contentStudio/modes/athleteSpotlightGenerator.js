import { formatSeconds, humanDuration, ordinal, stationLabel, interpolatePercentile } from "../utils.js";
import { BRAND, STATION_KEYS, archetypeLabel, findAthlete, flipName, resolveHandle } from "./modeUtils.js";

export function athleteSpotlightGenerator(raceAnalysis, params, athleteRegistry = []) {
  const { athleteName } = params ?? {};
  if (!athleteName) throw new Error("athleteName is required for Athlete Spotlight mode");

  const athlete = findAthlete(raceAnalysis, athleteName);
  if (!athlete) throw new Error(`Athlete "${athleteName}" not found in race data`);
  const displayName = flipName(athlete.name);

  const n = raceAnalysis.athletes.length;
  const profile = archetypeLabel(athlete, n);

  const stationTimings = STATION_KEYS
    .filter((key) => athlete.splits[key] != null && raceAnalysis.raceStats.segments[key])
    .map((key) => {
      const seg = raceAnalysis.raceStats.segments[key];
      const rank = athlete.ranks?.[key] ?? null;
      const rankPct = rank != null ? Math.round((rank / seg.sampleSize) * 100) : null;
      return { key, time: athlete.splits[key], rank, rankPct, median: seg.median, sampleSize: seg.sampleSize };
    });
  const sorted = [...stationTimings].sort((a, b) => (a.rankPct ?? 99) - (b.rankPct ?? 99));
  const best = sorted[0] ?? null;
  const worst = sorted[sorted.length - 1] ?? null;
  const genuineWeakness = worst && worst.time > worst.median;

  const histFinish = interpolatePercentile(athlete.finishTimeSeconds, raceAnalysis.historicalBenchmarks?.finish_time);

  // Field medians for profile comparison
  const fieldRunMedian     = raceAnalysis.raceStats.segments.run_total?.median ?? null;
  const fieldStationMedian = raceAnalysis.raceStats.segments.station_total?.median ?? null;

  // Winning margin (gap to 2nd place if this athlete won)
  const secondPlace   = athlete.rank === 1 ? raceAnalysis.athletes[1] : null;
  const winningMargin = secondPlace ? secondPlace.finishTimeSeconds - athlete.finishTimeSeconds : null;

  const selectedInsights = (raceAnalysis._insights ?? [])
    .filter((insight) => insight.athletesInvolved?.includes(athlete.name))
    .slice(0, 3);
  const headline = `What made ${displayName} ${athlete.rank === 1 ? "win" : `finish ${athlete.rank}${ordinal(athlete.rank)}`}`;

  // Hook: lead with the most striking single stat
  let hookHeadline;
  if (histFinish != null && histFinish <= 15) {
    hookHeadline = `${displayName} finished in the top ${histFinish}% of all HYROX ${raceAnalysis.division} finishers ever. Here's what drove it.`;
  } else if (athlete.rank === 1 && winningMargin != null) {
    hookHeadline = `${displayName} won by ${humanDuration(Math.round(winningMargin))}. Here's exactly where that gap was built.`;
  } else if (histFinish != null) {
    hookHeadline = `${displayName}: top ${histFinish}% of all HYROX finishers. Here's what the data shows.`;
  } else {
    hookHeadline = `${displayName} finished ${athlete.rank}${ordinal(athlete.rank)} of ${n}. Here's what the data found.`;
  }

  // Profile headline: derived from actual edges vs field median, not from the archetype label
  const runEdge     = fieldRunMedian     != null && athlete.runTotalSeconds     != null ? fieldRunMedian     - athlete.runTotalSeconds     : null;
  const stationEdge = fieldStationMedian != null && athlete.stationTotalSeconds != null ? fieldStationMedian - athlete.stationTotalSeconds : null;
  let profileHeadline;
  if (runEdge != null && stationEdge != null) {
    if (runEdge > 0 && stationEdge > 0) {
      profileHeadline = stationEdge > runEdge
        ? `${displayName} beats the field everywhere — but the station advantage is where the real gap was built`
        : `${displayName} beats the field everywhere — but running is where the real gap was built`;
    } else if (stationEdge > 0) {
      profileHeadline = `${displayName} isn't faster than the median runner. They more than make up for it at the stations.`;
    } else if (runEdge > 0) {
      profileHeadline = `${displayName} isn't stronger than the median at the stations. They more than make up for it on the runs.`;
    } else {
      profileHeadline = `${displayName}: consistent across both runs and stations`;
    }
  } else {
    profileHeadline = `${displayName}: ${profile}`;
  }

  const carouselSlides = [
    // Slide 1 — Hook: lead with the most striking number, swipe prompt
    {
      templateKey: "CS_AS_HOOK",
      layoutType: "hook",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: hookHeadline,
        subline: `Rank ${athlete.rank} of ${n} · ${formatSeconds(athlete.finishTimeSeconds)} · swipe to see how →`,
        athleteNames: [displayName],
      },
      slideIndex: 1,
      totalSlides: 5,
    },
    // Slide 2 — Profile: one opinionated claim with athlete vs field median side-by-side
    {
      templateKey: "CS_AS_PROFILE",
      layoutType: "comparison",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: profileHeadline,
        subline: profile,
        columns: [
          {
            header: displayName,
            stats: [
              { label: "Running",  value: formatSeconds(athlete.runTotalSeconds) },
              { label: "Stations", value: formatSeconds(athlete.stationTotalSeconds) },
            ],
          },
          {
            header: `Top ${n} median`,
            stats: [
              { label: "Running",  value: formatSeconds(fieldRunMedian) },
              { label: "Stations", value: formatSeconds(fieldStationMedian) },
            ],
          },
        ],
        athleteNames: [displayName],
      },
      slideIndex: 2,
      totalSlides: 5,
    },
    // Slide 3 — Best station: concrete numbers, not just a percentage
    {
      templateKey: "CS_AS_STRENGTH",
      layoutType: "data",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: best
          ? `Their best station: ${stationLabel(best.key)}`
          : "Running was their differentiator",
        metrics: best ? [
          {
            label: stationLabel(best.key),
            value: formatSeconds(best.time),
            context: `Rank ${best.rank} of ${best.sampleSize} athletes`,
          },
          {
            label: "Athletes beaten",
            value: `${(best.sampleSize ?? 0) - (best.rank ?? 0)} of ${best.sampleSize}`,
          },
          ...(histFinish != null ? [{ label: "Finish time historically", value: `Top ${histFinish}%` }] : []),
        ] : [],
        athleteNames: [displayName],
      },
      slideIndex: 3,
      totalSlides: 5,
    },
    // Slide 4 — Weakness: honest and specific, not softened as "opportunity"
    {
      templateKey: "CS_AS_WEAKNESS",
      layoutType: "data",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: genuineWeakness
          ? `Where they left time on the table`
          : "A remarkably balanced performance",
        metrics: genuineWeakness ? [
          {
            label: stationLabel(worst.key),
            value: formatSeconds(worst.time),
            context: `Rank ${worst.rank} of ${worst.sampleSize} athletes`,
          },
          {
            label: "Gap to median",
            value: `+${humanDuration(Math.abs(Math.round(worst.time - worst.median)))}`,
          },
        ] : [],
        athleteNames: [displayName],
      },
      slideIndex: 4,
      totalSlides: 5,
    },
    // Slide 5 — CTA: personal, not addressed to "everyday athletes"
    {
      templateKey: "CS_AS_CTA",
      layoutType: "cta",
      brand: BRAND,
      contentType: "athlete_spotlight",
      dataFields: {
        headline: "What does YOUR race say?",
        subline: "Find out at forma.fit",
        bullets: [
          best ? `What's your ${stationLabel(best.key)} rank in your division?` : "Where do you rank across all stations?",
          "Know your profile before race day → forma.fit",
        ],
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
      best ? `Best station: ${stationLabel(best.key)} (rank ${best.rank} of ${best.sampleSize})` : "",
      genuineWeakness ? `Left ${humanDuration(Math.abs(Math.round(worst.time - worst.median)))} on the table at ${stationLabel(worst.key)}` : "",
      `${profile} archetype`,
      histFinish != null ? `Top ${histFinish}% historically` : "",
      "",
      "What does YOUR race say? → forma.fit",
    ].filter(Boolean).join("\n"),
    suggestedHandles: handle ? [handle] : [],
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxperformance", "#hybridathlete", "#hyroxtraining"],
  };
}
