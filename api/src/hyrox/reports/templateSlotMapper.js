import { SEGMENT_MAP, STATION_KEYS } from "../config/segmentMap.js";
import { getBenchmarkStats } from "../engine/benchmarkService.js";
import { formatGain, formatPercent, formatPercentile, formatTime, formatTimeDiff, label } from "./copyFormatter.js";

const RACE_SEGMENTS = SEGMENT_MAP.filter((segment) => segment.type !== "roxzone");
const FEATURES = Object.freeze(["Biggest Limiter", "Time Potential", "Strongest Station", "Percentile Ranking", "Race Efficiency Score"]);

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function stationSegments(analysisJson) {
  return (analysisJson.segments ?? []).filter((row) => row.type === "station" || STATION_KEYS.includes(row.segmentKey));
}

function bestStation(analysisJson) {
  return [...stationSegments(analysisJson)]
    .filter((row) => Number.isFinite(Number(row.percentile)) && Number(row.percentile) >= 70)
    .sort((a, b) => b.percentile - a.percentile)[0]
    ?? analysisJson.strengths?.[0]
    ?? analysisJson.headline?.biggestStrength
    ?? null;
}

function opportunityStation(analysisJson) {
  return [...stationSegments(analysisJson)]
    .filter((row) => Number(row.timeGapToMedianSeconds) > 0)
    .sort((a, b) => (b.timeGapToMedianSeconds - a.timeGapToMedianSeconds) || (a.percentile - b.percentile))[0]
    ?? analysisJson.limiters?.[0]
    ?? analysisJson.headline?.biggestLimiter
    ?? null;
}

function upper(value) {
  return String(value ?? "").toUpperCase();
}

function athleteName(athleteContext = {}) {
  return athleteContext.displayName ?? athleteContext.name ?? "Your athlete";
}

function firstName(athleteContext = {}) {
  return String(athleteName(athleteContext)).split(/\s+/)[0] || "This athlete";
}

function rankLanguage(analysisJson, athleteContext) {
  const worldRank = athleteContext.worldRank ? `#${athleteContext.worldRank}` : null;
  const overall = segment(analysisJson, "total_time");
  const percentile = Number(overall?.percentile ?? athleteContext.overallPercentile);
  if (worldRank) return { percentile: "TOP RANK WORLDWIDE", worldRank };
  if (Number.isFinite(percentile) && percentile >= 99) return { percentile: "TOP 1% WORLDWIDE", worldRank: "" };
  return { percentile: formatPercentile(percentile) ?? "BENCHMARKED RESULT", worldRank: "" };
}

function flowRows(analysisJson) {
  return RACE_SEGMENTS.map((mapRow) => {
    const row = segment(analysisJson, mapRow.segmentKey);
    const deltaSeconds = Number(row?.timeGapToMedianSeconds ?? 0);
    return {
      name: upper(mapRow.displayName),
      time: formatTime(row?.userSeconds) ?? "-",
      benchmark_time: formatTime(row?.benchmarkMedianSeconds) ?? null,
      delta: formatTimeDiff(-deltaSeconds) ?? "0",
      delta_seconds: Math.round(deltaSeconds),
      tone: deltaSeconds < 0 ? "positive" : deltaSeconds > 0 ? "negative" : "neutral",
    };
  });
}

function callouts(rows) {
  const withDeltas = rows.filter((row) => Number.isFinite(row.delta_seconds));
  const gain = [...withDeltas].sort((a, b) => a.delta_seconds - b.delta_seconds)[0];
  const loss = [...withDeltas].sort((a, b) => b.delta_seconds - a.delta_seconds)[0];
  return {
    biggest_gain: { station: gain?.name ?? "N/A", delta: gain ? formatTimeDiff(Math.abs(gain.delta_seconds)) : "0" },
    biggest_loss: { station: loss?.name ?? "N/A", delta: loss ? formatTimeDiff(-Math.abs(loss.delta_seconds)) : "0" },
  };
}

function wordsForSeconds(seconds) {
  const n = Math.round(Math.abs(Number(seconds) || 0));
  const minutes = Math.floor(n / 60);
  const remainder = n % 60;
  if (minutes && remainder) return `${minutes} minute ${remainder} seconds.`;
  if (minutes) return `${minutes} minute${minutes === 1 ? "" : "s"}.`;
  return `${remainder} seconds.`;
}

export function buildTemplateA(analysisJson = {}, resolvedInsights = [], athleteContext = {}) {
  const limiter = opportunityStation(analysisJson);
  const strength = bestStation(analysisJson);
  const gain = analysisJson.timePotential?.headlineGainSeconds ?? analysisJson.headline?.headlineGainSeconds ?? limiter?.timeGapSeconds ?? limiter?.timeGapToMedianSeconds ?? 0;
  const rank = rankLanguage(analysisJson, athleteContext);
  const rows = flowRows(analysisJson);
  const rowCallouts = callouts(rows);

  return {
    template_id: "A",
    template_name: "Athlete Breakdown",
    brand: {
      product: "FORMA",
      site: "forma.fit",
      strapline: "Performance Analytics for Hybrid Athletes",
    },
    slides: [
      {
        slide_id: "A1_ATHLETE_HOOK",
        report_type: "HYROX PERFORMANCE ANALYSIS",
        athlete_name: athleteName(athleteContext),
        athlete_image: athleteContext.athleteImage ?? "",
        percentile: rank.percentile,
        limiter_word: upper(limiter?.label ?? label(limiter?.segmentKey) ?? "OPPORTUNITY"),
        headline_suffix: gain >= 60 ? "COST TIME" : "SETS THE STORY",
        hero_number: formatGain(gain) ?? "0:00",
        overall_time: formatTime(analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds) ?? "-",
        world_rank: rank.worldRank,
        best_station: upper(strength?.label ?? label(strength?.segmentKey) ?? "N/A"),
        biggest_limiter: upper(limiter?.label ?? label(limiter?.segmentKey) ?? "N/A"),
        swipe_prompt: "Swipe to see where time was gained and lost.",
      },
      {
        slide_id: "A2_POSITION_FLOW",
        title: "WHERE TIME WAS GAINED AND LOST",
        ...rowCallouts,
        stations: rows,
      },
      {
        slide_id: "A3_BIGGEST_STRENGTH",
        station: upper(strength?.label ?? label(strength?.segmentKey) ?? "N/A"),
        percentile: formatPercentile(strength?.percentile) ?? "BENCHMARKED",
        position_gain: formatTimeDiff(Math.abs(strength?.timeGapToMedianSeconds ?? strength?.timeAdvantageSeconds ?? 0)) ?? "+0:00",
        caption: `${strength?.label ?? "This station"} is the strongest benchmarked area in this result.`,
      },
      {
        slide_id: "A4_BIGGEST_OPPORTUNITY",
        station: upper(limiter?.label ?? label(limiter?.segmentKey) ?? "N/A"),
        label: "Opportunity",
        potential_gain: formatGain(gain) ?? "0:00",
        potential_gain_text: wordsForSeconds(gain),
        current_station_rank: formatPercentile(limiter?.percentile) ?? "BENCHMARKED",
      },
      {
        slide_id: "A5_KEY_INSIGHT",
        athlete_first_name: firstName(athleteContext),
        gain_text: `${formatPercentile(strength?.percentile) ?? "a stronger benchmark"} performance`,
        gain_station: String(strength?.label ?? "the strongest station").toLowerCase(),
        loss_text: `${formatGain(gain) ?? "time"} potential gain`,
        loss_station: String(limiter?.label ?? "the limiter").toLowerCase(),
        outcome_text: athleteContext.targetLabel ?? "YOUR NEXT PB",
        insight: `Closing this gap could move ${firstName(athleteContext)} closer to ${athleteContext.targetLabel ?? "the next target"}.`,
      },
      {
        slide_id: "A6_CTA",
        headline: "FIND YOUR BOTTLENECK",
        body: "Analyse your HYROX result. Free.",
        ctaLabel: "Analyse my result",
        ctaType: "calculator_link",
        button: "ANALYSE MY HYROX RESULT",
        features: [...FEATURES],
      },
    ],
    selected_insights: resolvedInsights.map((insight) => insight.id),
  };
}

function gapRows(groupKey) {
  return STATION_KEYS.map((key) => {
    const stats = getBenchmarkStats(groupKey, key);
    const median = Number(stats?.medianSeconds ?? stats?.p50Seconds);
    const p25 = Number(stats?.p25Seconds);
    const gap = Number.isFinite(median) && Number.isFinite(p25) ? Math.max(0, median - p25) : 0;
    return { segmentKey: key, name: label(key), gapSeconds: Math.round(gap), sampleSize: Number(stats?.sampleSize ?? 0) };
  }).sort((a, b) => (b.gapSeconds - a.gapSeconds) || a.name.localeCompare(b.name));
}

function sampleDisplay(rows) {
  const sample = Math.max(0, ...rows.map((row) => row.sampleSize));
  if (sample >= 1000) return `${Math.floor(sample / 1000)},000+`;
  return `${sample}+`;
}

export function buildTemplateB(benchmarkGroupKey, targetBand = "sub-75") {
  const rows = gapRows(benchmarkGroupKey);
  const top = rows[0] ?? { name: "Wall Balls", gapSeconds: 0 };
  const sledTopTwo = rows.slice(0, 2).some((row) => ["sled_push", "sled_pull"].includes(row.segmentKey));
  const sample = sampleDisplay(rows);
  const topFive = rows.slice(0, 5);

  return {
    template: "population-research",
    brand: "FORMA",
    category: "HYROX POPULATION RESEARCH",
    footerUrl: "forma.fit",
    footerMeta: `FORMA | THE PERFORMANCE ENGINEER | ${sample} RESULTS`,
    hook: {
      sampleSize: `${sample} RESULTS ANALYSED`,
      question: `What stops athletes breaking ${targetBand.replace("sub-", "")} minutes?`,
      headline: sledTopTwo ? `${top.name} is the biggest HYROX bottleneck` : "The biggest HYROX bottleneck isn't the sled",
      metrics: [
        { label: "Target Time", value: `${targetBand.replace("sub-", "")}:00` },
        { label: "Results Analysed", value: sample },
        { label: "Most Common Limiter", value: top.name, tone: "negative" },
        { label: "Largest Gap", value: top.name, tone: "negative" },
      ],
      swipePrompt: "Swipe to see where athletes really lose time",
    },
    losses: {
      title: "Where athletes lose time",
      primary: { label: top.name, value: `-${formatGain(top.gapSeconds)}` },
      secondary: { label: topFive[1]?.name ?? "Running Fatigue", value: `-${formatGain(topFive[1]?.gapSeconds ?? 0)}` },
      rows: topFive.map((row, index) => ({
        rank: `#${index + 1}`,
        name: row.name,
        gap: formatGain(row.gapSeconds),
        loss: `-${formatGain(row.gapSeconds)}`,
      })),
    },
    limiter: {
      eyebrow: "#1 Biggest limiter",
      title: top.name,
      label: "Average time lost",
      heroNumber: formatGain(top.gapSeconds),
      subLabel: `Versus ${targetBand} athletes`,
      caption: "The single largest time gap in this benchmark group.",
    },
    opportunity: {
      eyebrow: "Biggest opportunity",
      title: topFive[1]?.name ?? top.name,
      label: "Secondary gap",
      heroNumber: formatGain(topFive[1]?.gapSeconds ?? top.gapSeconds),
      caption: "The next largest pattern after the primary limiter.",
      tag: "Benchmark gap ranking",
    },
    insight: {
      title: "What nobody expects",
      lines: [
        { text: "Most athletes focus on ", highlight: "sleds", suffix: ".", tone: "positive" },
        { text: "This cohort loses more time on ", highlight: top.name.toLowerCase(), suffix: ".", tone: "negative" },
        { text: "Improving the biggest gap has the greatest impact on finishing time.", highlight: "", suffix: "", tone: "neutral" },
      ],
      hero: "Train smarter",
    },
    cta: {
      title: "Discover your HYROX bottleneck",
      bullets: [...FEATURES],
      button: "Analyse my HYROX result",
      brandLine: "Performance Analytics for Hybrid Athletes",
    },
  };
}

export function buildTemplateStub(template) {
  console.warn(`[hyrox] template ${template} is not implemented in v1`);
  return { template, status: "not_implemented_v1" };
}
