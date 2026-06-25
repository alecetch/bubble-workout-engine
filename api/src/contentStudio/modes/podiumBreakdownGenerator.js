import { formatSeconds, stationLabel } from "../utils.js";
import { BRAND, STATION_KEYS, archetypeLabel, flipName, updateSlideTotals } from "./modeUtils.js";

export function podiumBreakdownGenerator(raceAnalysis) {
  const podium = raceAnalysis.athletes.slice(0, 3);
  if (podium.length < 3) throw new Error("At least three athletes are required for Podium Breakdown mode");
  const n = raceAnalysis.athletes.length;
  const topQuartile = Math.ceil(n / 4);
  const topQuartilePct = Math.round((topQuartile / n) * 100);

  const sharedStrengths = STATION_KEYS.filter((key) =>
    podium.every((athlete) => (athlete.ranks?.[key] ?? Infinity) <= topQuartile),
  );

  // Station that most separates 1st from 3rd by rank position
  const topDiff = STATION_KEYS
    .filter((key) => podium[0].ranks?.[key] != null && podium[2].ranks?.[key] != null)
    .map((key) => ({
      key,
      spread: Math.abs((podium[0].ranks[key] ?? 0) - (podium[2].ranks[key] ?? 0)),
    }))
    .sort((a, b) => b.spread - a.spread)[0] ?? null;

  const podiumLabels = ["1st", "2nd", "3rd"];
  const headline = `How the podium was built: ${podium.map((a) => flipName(a.name)).join(", ")}`;

  const slides = updateSlideTotals([
    // Slide 1 — Hook: subvert the "one winning profile" assumption
    {
      templateKey: "CS_PB_HOOK",
      layoutType: "hook",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: "3 athletes. 3 profiles. 1 podium.",
        metrics: podium.map((athlete, i) => ({
          label: `${podiumLabels[i]} — ${flipName(athlete.name)}`,
          value: formatSeconds(athlete.finishTimeSeconds),
        })),
        athleteNames: podium.map((athlete) => flipName(athlete.name)),
      },
    },
    // Slide 2 — The profiles (moved up — most interesting content before drop-off)
    {
      templateKey: "CS_PB_ARCHETYPES",
      layoutType: "data",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: "Three very different profiles",
        metrics: podium.map((athlete, i) => ({
          label: `${podiumLabels[i]} — ${flipName(athlete.name)}`,
          value: archetypeLabel(athlete, n),
          context: `Run rank ${athlete.runRank ?? "—"} · Station rank ${athlete.stationRank ?? "—"}`,
        })),
        athleteNames: podium.map((athlete) => flipName(athlete.name)),
      },
    },
    // Slide 3 — The common ground: what united all three
    {
      templateKey: "CS_PB_SHARED",
      layoutType: "data",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: sharedStrengths.length ? "The podium's common ground" : "No single station united them",
        bullets: sharedStrengths.length
          ? sharedStrengths.slice(0, 3).map((key) =>
              `${stationLabel(key)}: every podium athlete ranked top ${topQuartilePct}% — the field couldn't match them here`,
            )
          : [
              "The podium was built on completely different strengths",
              "There is no single winning formula in HYROX — multiple profiles can reach the top",
            ],
        athleteNames: podium.map((athlete) => flipName(athlete.name)),
      },
    },
    // Slide 4 — What separated them: the station that split gold from bronze
    {
      templateKey: "CS_PB_DIFFERENCES",
      layoutType: "comparison",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: topDiff
          ? `${stationLabel(topDiff.key)} separated gold from bronze by ${topDiff.spread} places`
          : "The podium was remarkably close across all stations",
        metrics: topDiff
          ? podium.map((athlete, i) => ({
              label: `${podiumLabels[i]} — ${flipName(athlete.name)}`,
              value: `Rank ${athlete.ranks?.[topDiff.key] ?? "—"}`,
              context: formatSeconds(athlete.splits?.[topDiff.key]),
            }))
          : [],
        athleteNames: podium.map((athlete) => flipName(athlete.name)),
      },
    },
    // Slide 5 — CTA: personal and connected to the insight
    {
      templateKey: "CS_PB_CTA",
      layoutType: "cta",
      brand: BRAND,
      contentType: "podium",
      dataFields: {
        headline: "You don't need a perfect profile",
        subline: "But you need to know yours. → forma.fit",
        bullets: ["Are you a runner, a station specialist, or balanced? Find out at forma.fit"],
      },
    },
  ]);

  const podiumNames = new Set(podium.map((a) => a.name));
  const podiumInsights = (raceAnalysis._insights ?? []).filter((i) =>
    i.athletesInvolved?.some((name) => podiumNames.has(name)),
  );
  const selectedInsights = podiumInsights.length >= 2
    ? podiumInsights.slice(0, 3)
    : [
        ...podiumInsights,
        ...(raceAnalysis._insights ?? []).filter((i) => !podiumInsights.includes(i)).slice(0, 3 - podiumInsights.length),
      ];

  return {
    modeKey: "podium_breakdown",
    headline,
    selectedInsights,
    carouselSlides: slides,
    captionDraft: [
      `${headline}.`,
      "",
      sharedStrengths.length
        ? `Shared podium strength: ${sharedStrengths.slice(0, 2).map(stationLabel).join(" and ")}.`
        : "No single station united the podium — multiple paths to the top.",
      topDiff
        ? `${stationLabel(topDiff.key)} had the biggest spread between 1st and 3rd (${topDiff.spread} places).`
        : "",
      "",
      "You don't need a perfect profile. But you need to know yours. → forma.fit",
    ].filter(Boolean).join("\n"),
    suggestedHandles: [],
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxpodium", "#hyroxperformance"],
  };
}
