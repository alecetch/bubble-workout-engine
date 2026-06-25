import { interpolatePercentile } from "./utils.js";
import { SPLIT_KEYS } from "./csvParser.js";

export const RUN_KEYS = ["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8"];
export const STATION_KEYS = ["skierg", "sled_push", "sled_pull", "burpee_bj", "row", "farmers_carry", "sandbag_lunge", "wall_balls"];
export const ROXZONE_STATION_KEYS = STATION_KEYS.filter((key) => key !== "wall_balls");
export const METRIC_KEYS = ["run_total", "station_total", "finish_time", ...SPLIT_KEYS];

const BENCHMARK_KEY_MAP = {
  finish_time: "total_time",
  run_total: "run_time",
  station_total: "work_time",
  skierg: "ski_erg",
  burpee_bj: "burpee_broad_jump",
  sandbag_lunge: "sandbag_lunges",
};

function finiteValues(values) {
  return values.filter((value) => Number.isFinite(value));
}

function sumPresent(splits, keys) {
  const values = keys.map((key) => splits[key]).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function percentile(sorted, pct) {
  if (!sorted.length) return null;
  const index = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function segmentStats(values) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  const sampleSize = sorted.length;
  if (!sampleSize) return { mean: null, median: null, stddev: null, min: null, max: null, p10: null, p90: null, cv: null, sampleSize: 0 };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sampleSize;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sampleSize;
  const stddev = Math.sqrt(variance);
  return {
    mean,
    median: percentile(sorted, 50),
    stddev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p10: percentile(sorted, 10),
    p90: percentile(sorted, 90),
    cv: mean ? stddev / mean : null,
    sampleSize,
  };
}

function assignDenseRanks(athletes, valueFn, rankKey) {
  const ranked = athletes
    .map((athlete) => ({ athlete, value: valueFn(athlete) }))
    .filter(({ value }) => Number.isFinite(value))
    .sort((a, b) => a.value - b.value);
  ranked.forEach(({ athlete }, index) => {
    athlete[rankKey] = index + 1;
  });
}

function assignSegmentRanks(athletes, key) {
  const ranked = athletes
    .filter((athlete) => Number.isFinite(athlete.splits[key]))
    .sort((a, b) => a.splits[key] - b.splits[key]);
  ranked.forEach((athlete, index) => {
    athlete.ranks[key] = index + 1;
  });
}

export function spearmanCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return null;
  const d2 = xs.map((x, i) => (x - ys[i]) ** 2);
  return 1 - (6 * d2.reduce((a, b) => a + b, 0)) / (n * (n ** 2 - 1));
}

async function loadHistoricalBenchmarks(division, sex, db) {
  if (!db?.query) return {};
  try {
    const result = await db.query(
      `SELECT metric_key, p10_seconds, p25_seconds, p50_seconds, p75_seconds, p90_seconds, p95_seconds
       FROM hyrox_benchmark_metrics bm
       JOIN hyrox_benchmark_groups bg ON bg.group_key = bm.group_key
       WHERE bg.division = $1 AND bg.gender = $2 AND bg.fallback_level = 1`,
      [division, sex],
    );
    const reverseMap = Object.fromEntries(
      Object.entries(BENCHMARK_KEY_MAP).map(([analyserKey, dbKey]) => [dbKey, analyserKey]),
    );
    const benchmarks = {};
    for (const row of result.rows ?? []) {
      const analyserKey = reverseMap[row.metric_key] ?? row.metric_key;
      benchmarks[analyserKey] = {
        p10_seconds: Number(row.p10_seconds),
        p25_seconds: Number(row.p25_seconds),
        p50_seconds: Number(row.p50_seconds),
        p75_seconds: Number(row.p75_seconds),
        p90_seconds: Number(row.p90_seconds),
        p95_seconds: Number(row.p95_seconds),
      };
    }
    return benchmarks;
  } catch {
    return {};
  }
}

function metricValue(athlete, key) {
  if (key === "finish_time") return athlete.finishTimeSeconds;
  if (key === "run_total") return athlete.runTotalSeconds;
  if (key === "station_total") return athlete.stationTotalSeconds;
  return athlete.splits[key];
}

function bestKeyBy(keys, valueFn, compareFn) {
  return keys
    .map((key) => ({ key, value: valueFn(key) }))
    .filter(({ value }) => Number.isFinite(value))
    .sort((a, b) => compareFn(a.value, b.value))[0]?.key ?? null;
}

export async function analyseRaceEvent(rows, division = "open", sex = "male", db) {
  const sortedRows = [...rows].sort((a, b) => (a.finishTimeSeconds ?? Infinity) - (b.finishTimeSeconds ?? Infinity));
  const athletes = sortedRows
    .map((row) => {
      const splitValues = Object.values(row.splits).filter((value) => value != null);
      const mean = splitValues.length ? splitValues.reduce((sum, value) => sum + value, 0) / splitValues.length : null;
      const stddev = mean ? Math.sqrt(splitValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / splitValues.length) : null;
      const runTotalSeconds = sumPresent(row.splits, RUN_KEYS);
      const stationTotalSeconds = sumPresent(row.splits, STATION_KEYS);
      const roxzoneInTotal = sumPresent(row.roxzoneSplits ?? {}, ROXZONE_STATION_KEYS.map((key) => `${key}_rox_in`));
      const roxzoneOutTotal = sumPresent(row.roxzoneSplits ?? {}, ROXZONE_STATION_KEYS.map((key) => `${key}_rox_out`));
      const roxzoneTotalFromSplits = roxzoneInTotal != null && roxzoneOutTotal != null
        ? roxzoneInTotal + roxzoneOutTotal
        : (row.roxzoneSeconds ?? null);
      return {
        ...row,
        runTotalSeconds,
        stationTotalSeconds,
        roxzoneInTotal,
        roxzoneOutTotal,
        roxzoneTotalFromSplits,
        roxzoneSplits: row.roxzoneSplits ?? {},
        runShare: row.finishTimeSeconds && runTotalSeconds != null ? runTotalSeconds / row.finishTimeSeconds : null,
        stationShare: row.finishTimeSeconds && stationTotalSeconds != null ? stationTotalSeconds / row.finishTimeSeconds : null,
        splitVariance: mean ? stddev / mean : null,
        ranks: {},
      };
    });

  assignDenseRanks(athletes, (athlete) => athlete.runTotalSeconds, "runRank");
  assignDenseRanks(athletes, (athlete) => athlete.stationTotalSeconds, "stationRank");
  assignDenseRanks(athletes, (athlete) => athlete.roxzoneTotalFromSplits, "roxzoneRank");
  for (const key of SPLIT_KEYS) assignSegmentRanks(athletes, key);

  const segments = {};
  for (const key of METRIC_KEYS) {
    segments[key] = segmentStats(athletes.map((athlete) => metricValue(athlete, key)));
  }
  segments.roxzone_total = segmentStats(athletes.map((athlete) => athlete.roxzoneTotalFromSplits).filter((value) => value != null));
  for (const stationKey of ROXZONE_STATION_KEYS) {
    const stationRoxTotals = athletes
      .map((athlete) => {
        const inVal = athlete.roxzoneSplits[`${stationKey}_rox_in`];
        const outVal = athlete.roxzoneSplits[`${stationKey}_rox_out`];
        return inVal != null && outVal != null ? inVal + outVal : null;
      })
      .filter((value) => value != null);
    segments[`${stationKey}_rox_total`] = segmentStats(stationRoxTotals);
  }

  const rankCorrelations = {};
  for (const key of ["run_total", "station_total", ...SPLIT_KEYS]) {
    const pairs = athletes
      .map((athlete) => ({
        finishRank: athlete.rank,
        segmentRank: key === "run_total" ? athlete.runRank : key === "station_total" ? athlete.stationRank : athlete.ranks[key],
      }))
      .filter((pair) => Number.isFinite(pair.finishRank) && Number.isFinite(pair.segmentRank));
    rankCorrelations[key] = spearmanCorrelation(pairs.map((p) => p.segmentRank), pairs.map((p) => p.finishRank));
  }

  const sledRanked = athletes
    .map((athlete) => ({ athlete, value: (athlete.splits.sled_push ?? null) != null && (athlete.splits.sled_pull ?? null) != null ? athlete.splits.sled_push + athlete.splits.sled_pull : null }))
    .filter(({ value }) => Number.isFinite(value))
    .sort((a, b) => a.value - b.value);
  const sledPairs = sledRanked.map(({ athlete }, index) => ({ segmentRank: index + 1, finishRank: athlete.rank }));
  rankCorrelations.combined_sled = spearmanCorrelation(sledPairs.map((p) => p.segmentRank), sledPairs.map((p) => p.finishRank));
  const roxzonePairs = athletes
    .filter((athlete) => Number.isFinite(athlete.roxzoneRank) && Number.isFinite(athlete.rank))
    .map((athlete) => ({ roxzoneRank: athlete.roxzoneRank, finishRank: athlete.rank }));
  rankCorrelations.roxzone_total = spearmanCorrelation(
    roxzonePairs.map((pair) => pair.roxzoneRank),
    roxzonePairs.map((pair) => pair.finishRank),
  );

  const historicalBenchmarks = await loadHistoricalBenchmarks(division, sex, db);
  for (const athlete of athletes) {
    athlete.historicalPercentiles = {};
    for (const key of METRIC_KEYS) {
      const pct = interpolatePercentile(metricValue(athlete, key), historicalBenchmarks[key]);
      if (pct != null) athlete.historicalPercentiles[key] = pct;
    }
  }
  const fieldMedianPercentile = interpolatePercentile(
    segments.finish_time?.median,
    historicalBenchmarks.finish_time,
  );

  const fullSplitCount = athletes.filter((athlete) => SPLIT_KEYS.every((key) => athlete.splits[key] != null)).length;
  const run1Count = athletes.filter((athlete) => athlete.splits.run_1 != null).length;
  const roxzoneSplitCount = athletes.filter((athlete) =>
    ROXZONE_STATION_KEYS.some((key) => athlete.roxzoneSplits?.[`${key}_rox_in`] != null)
  ).length;

  return {
    athletes,
    raceStats: { segments, rankCorrelations },
    narrativeStats: {
      winningMarginSeconds: athletes.length > 1 ? athletes[1].finishTimeSeconds - athletes[0].finishTimeSeconds : null,
      mostDecisiveStation: bestKeyBy(STATION_KEYS, (key) => rankCorrelations[key], (a, b) => b - a),
      mostVariableStation: bestKeyBy(SPLIT_KEYS, (key) => segments[key]?.cv, (a, b) => b - a),
      leastVariableStation: bestKeyBy(SPLIT_KEYS, (key) => segments[key]?.cv, (a, b) => a - b),
      fieldSize: rows.length,
      fieldMedianPercentile,
      hasRunSplits: rows.length > 0 && run1Count / rows.length >= 0.8,
      hasFullSplits: rows.length > 0 && fullSplitCount / rows.length >= 0.8,
      hasRoxzoneSplits: rows.length > 0 && roxzoneSplitCount / rows.length >= 0.8,
    },
    historicalBenchmarks,
    division,
    sex,
    analysedAt: new Date().toISOString(),
  };
}
