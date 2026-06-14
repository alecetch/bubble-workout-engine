import { formatGain, formatPercentile, formatTime } from "./copyFormatter.js";

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

export function buildBrowserSummary(analysisJson = {}, insights = [], athleteContext = {}) {
  const limiter = analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
  const strength = analysisJson.headline?.biggestStrength ?? analysisJson.strengths?.[0] ?? null;
  const total = segment(analysisJson, "total_time");
  const noteParts = [];
  if (analysisJson.roxzoneAnalysis?.mode === "inferred_total") noteParts.push("Roxzone time is estimated from unallocated race time.");
  if (analysisJson.dataQuality?.warnings?.includes("partial_split_data") || Number(analysisJson.dataQuality?.inputCompleteness) < 1) noteParts.push("Some split data is missing, so the summary is limited.");

  return {
    heroInsight: {
      title: insights[0]?.title ?? (limiter ? `${limiter.label} is your biggest opportunity` : "Your HYROX analysis is ready"),
      heroMetric: formatGain(analysisJson.timePotential?.headlineGainSeconds ?? limiter?.timeGapSeconds ?? 0),
    },
    overallPercentile: Number.isFinite(Number(total?.percentile)) ? total.percentile : null,
    overallPercentileLabel: formatPercentile(total?.percentile),
    benchmarkGroupLabel: analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? analysisJson.benchmarkContext?.primaryBenchmarkGroup?.key ?? "your benchmark group",
    biggestLimiter: limiter ? { label: limiter.label, timeGapFormatted: formatGain(limiter.timeGapSeconds) } : null,
    biggestStrength: strength ? { label: strength.label, percentile: strength.percentile } : null,
    timePotential: {
      headlineGainFormatted: formatGain(analysisJson.timePotential?.headlineGainSeconds ?? 0),
      projectedTimeFormatted: formatTime(analysisJson.timePotential?.newProjectedTimeSeconds ?? analysisJson.headline?.projectedTimeSeconds),
    },
    sentMessage: athleteContext.email ? `Your full report has been sent to ${athleteContext.email}` : null,
    dataQualityNote: noteParts.length ? noteParts.join(" ") : null,
  };
}
