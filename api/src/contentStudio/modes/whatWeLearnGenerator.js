import { formatSeconds, interpolatePercentile } from "../utils.js";
import { ALL_SEGMENTS, BRAND, mean, stationMetricLabel, updateSlideTotals } from "./modeUtils.js";

export function whatWeLearnGenerator(raceAnalysis) {
  const podium = raceAnalysis.athletes.slice(0, 3);
  if (podium.length < 3) throw new Error("At least three athletes are required for What We Can Learn mode");
  const gaps = ALL_SEGMENTS
    .map((segment) => {
      const stats = raceAnalysis.raceStats.segments[segment];
      const podiumMean = mean(podium.map((athlete) => athlete.splits[segment]));
      if (!stats?.median || podiumMean == null) return null;
      return { segment, podiumMean, fieldMedian: stats.median, gap: stats.median - podiumMean };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 3);
  const finishPct = interpolatePercentile(mean(podium.map((athlete) => athlete.finishTimeSeconds)), raceAnalysis.historicalBenchmarks?.finish_time);
  const headline = "What separated the podium from the field";
  const lessons = gaps.map((gap) => `${stationMetricLabel(gap.segment)}: train the segment where elite athletes gained ${formatSeconds(Math.abs(Math.round(gap.gap)))}`);
  const slides = updateSlideTotals([
    {
      templateKey: "CS_WWL_HOOK",
      layoutType: "hook",
      brand: BRAND,
      contentType: "learn",
      dataFields: {
        headline,
        subline: finishPct != null ? `Podium average: historical top ${finishPct}%` : `${raceAnalysis.division} ${raceAnalysis.sex}`,
        athleteNames: podium.map((athlete) => athlete.name),
      },
    },
    {
      templateKey: "CS_WWL_GAPS",
      layoutType: "data",
      brand: BRAND,
      contentType: "learn",
      dataFields: {
        headline: "The three biggest podium advantages",
        metrics: gaps.map((gap) => ({
          label: stationMetricLabel(gap.segment),
          value: `${formatSeconds(Math.round(gap.podiumMean))} vs ${formatSeconds(Math.round(gap.fieldMedian))}`,
          context: `${formatSeconds(Math.abs(Math.round(gap.gap)))} gap`,
        })),
      },
    },
    {
      templateKey: "CS_WWL_LESSONS",
      layoutType: "lesson",
      brand: BRAND,
      contentType: "learn",
      dataFields: { headline: "Turn the data into training", bullets: lessons },
    },
    {
      templateKey: "CS_WWL_CTA",
      layoutType: "cta",
      brand: BRAND,
      contentType: "learn",
      dataFields: {
        headline: "Your result has a story too",
        bullets: ["Find your biggest gaps", "Prioritise the segments that matter", "Train with evidence, not guesswork"],
        subline: "Analyse your own HYROX result -> forma.fit",
      },
    },
  ]);

  return {
    modeKey: "what_we_learn",
    headline,
    selectedInsights: [],
    carouselSlides: slides,
    captionDraft: `${headline}.\n\n${lessons.slice(0, 2).join("\n")}\n\nAnalyse your own HYROX result -> forma.fit`,
    suggestedHandles: [],
    suggestedHashtags: ["#hyrox", "#forma", "#hyroxtraining", "#hyroxperformance"],
  };
}
