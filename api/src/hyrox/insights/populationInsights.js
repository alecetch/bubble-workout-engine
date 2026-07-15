import { STATION_KEYS } from "../config/segmentMap.js";
import { calculateConfidence } from "../confidence/confidenceScorer.js";
import { getBenchmarkStats } from "../engine/benchmarkService.js";

const POPULATION_INSIGHT_CANDIDATE = Object.freeze({ matchType: "sex_division" });

function gapFor(stats) {
  const median = Number(stats?.medianSeconds ?? stats?.p50Seconds);
  const p25 = Number(stats?.p25Seconds);
  if (!Number.isFinite(median) || !Number.isFinite(p25)) return null;
  return Math.max(0, median - p25);
}

function confidenceGradeFor(stats) {
  return calculateConfidence(stats, POPULATION_INSIGHT_CANDIDATE).grade;
}

export function rankStationGaps(benchmarkGroupKey) {
  return STATION_KEYS
    .map((stationKey) => {
      const stats = getBenchmarkStats(benchmarkGroupKey, stationKey);
      return {
        segmentKey: stationKey,
        gapSeconds: gapFor(stats),
        sampleSize: Number(stats?.sampleSize ?? 0),
        confidenceGrade: confidenceGradeFor(stats),
      };
    })
    .filter((row) => row.gapSeconds !== null)
    .sort((a, b) => (b.gapSeconds - a.gapSeconds) || a.segmentKey.localeCompare(b.segmentKey))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function generatePopulationInsights(benchmarkGroupKey, insightDef = null) {
  if (!benchmarkGroupKey || !insightDef?.enabled) return [];
  const rankings = rankStationGaps(benchmarkGroupKey);
  const byKey = Object.fromEntries(rankings.map((row) => [row.segmentKey, row]));
  const wall = byKey.wall_balls;
  const sledPush = byKey.sled_push;
  const sledPull = byKey.sled_pull;

  if (!wall || !sledPush || !sledPull) return [];
  if (!(wall.rank <= 2 && sledPush.rank > 2 && sledPull.rank > 2)) return [];
  if (wall.confidenceGrade !== "A") return [];

  return [{
    insightDef,
    evidenceValues: {
      segmentKey: "wall_balls",
      segmentLabel: "Wall Balls",
      primaryMetric: "population_gap_rank",
      primaryValue: wall.rank,
      wallBallGapRank: wall.rank,
      stationGapRankings: byKey,
      sampleSize: wall.sampleSize,
      confidenceGrade: wall.confidenceGrade,
      evidenceType: "population",
      coreClaim: "population_wall_balls_not_sled",
    },
  }];
}
