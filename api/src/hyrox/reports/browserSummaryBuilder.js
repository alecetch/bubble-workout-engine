import { formatGain, formatPercentile, formatTime } from "./copyFormatter.js";

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function hasReplayRoxzoneDetail(analysisJson) {
  const rox = analysisJson.roxzoneAnalysis ?? {};
  return Boolean(
    rox.entryExitAvailable ||
    rox.roxzoneNarrative?.available ||
    Number(rox.roxzoneNarrative?.measurableStationCount) > 0 ||
    Number(rox.measurableStationCount) > 0,
  );
}

function hasCompleteCoreSplits(analysisJson) {
  const segments = Array.isArray(analysisJson.segments) ? analysisJson.segments : [];
  const runCount = new Set(segments.filter((row) => row.type === "run").map((row) => row.segmentKey)).size;
  const stationCount = new Set(segments.filter((row) => row.type === "station").map((row) => row.segmentKey)).size;
  return runCount >= 8 && stationCount >= 8;
}

export function buildBrowserSummary(analysisJson = {}, insights = [], athleteContext = {}, calculatorMode = "target") {
  const limiter = analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
  const strength = analysisJson.headline?.biggestStrength ?? analysisJson.strengths?.[0] ?? null;
  const total = segment(analysisJson, "total_time");
  const noteParts = [];
  const replayRoxzoneAvailable = hasReplayRoxzoneDetail(analysisJson);
  const coreSplitsComplete = hasCompleteCoreSplits(analysisJson);
  if (analysisJson.roxzoneAnalysis?.mode === "inferred_total" && !replayRoxzoneAvailable) {
    noteParts.push("RoxZone total is estimated from unallocated race time.");
  }
  if (!coreSplitsComplete && (analysisJson.dataQuality?.warnings?.includes("partial_split_data") || Number(analysisJson.dataQuality?.inputCompleteness) < 1)) {
    noteParts.push("Some run or station split data is missing, so the summary is limited.");
  }

  return {
    heroInsight: {
      title: insights[0]?.title ?? (limiter ? `${limiter.label} is your biggest opportunity` : "Your HYROX analysis is ready"),
      heroMetric: formatGain(analysisJson.timePotential?.headlineGainSeconds ?? limiter?.timeGapSeconds ?? 0),
    },
    overallPercentile: Number.isFinite(Number(total?.percentile)) ? total.percentile : null,
    overallPercentileLabel: formatPercentile(total?.percentile),
    benchmarkGroupLabel: analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? analysisJson.benchmarkContext?.primaryBenchmarkGroup?.key ?? "your benchmark band",
    comparisonOptions: analysisJson.benchmarkContext?.comparisonOptions ?? null,
    biggestLimiter: limiter ? { label: limiter.label, timeGapFormatted: formatGain(limiter.timeGapSeconds) } : null,
    biggestStrength: strength ? { label: strength.label, percentile: strength.percentile } : null,
    timePotential: {
      headlineGainFormatted: formatGain(analysisJson.timePotential?.headlineGainSeconds ?? 0),
      projectedTimeFormatted: formatTime(analysisJson.timePotential?.newProjectedTimeSeconds ?? analysisJson.headline?.projectedTimeSeconds),
    },
    sentMessage: athleteContext.email ? `Your full report has been sent to ${athleteContext.email}` : null,
    dataQualityNote: noteParts.length ? noteParts.join(" ") : null,
    calculatorMode,
    athleteArchetype: analysisJson.athleteArchetype
      ? {
          key: analysisJson.athleteArchetype.key,
          label: analysisJson.athleteArchetype.label,
          confidence: analysisJson.athleteArchetype.confidence ?? null,
        }
      : null,
    workRunBalance: analysisJson.workRunBalance
      ? {
          runSharePct: analysisJson.workRunBalance.runShare != null
            ? Math.round(analysisJson.workRunBalance.runShare * 100)
            : null,
          workSharePct: analysisJson.workRunBalance.workShare != null
            ? Math.round(analysisJson.workRunBalance.workShare * 100)
            : null,
          profileType: analysisJson.workRunBalance.profileType ?? null,
          profileTypeLabel: {
            transition_limited: "Transition limited",
            runner_dominant: "Runner dominant",
            strength_dominant: "Strength dominant",
            balanced_hybrid: "Balanced hybrid",
          }[analysisJson.workRunBalance.profileType] ?? null,
        }
      : null,
  };
}
