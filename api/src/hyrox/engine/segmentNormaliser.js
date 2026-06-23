import { RUN_KEYS, ROXZONE_KEYS, SEGMENT_MAP, STATION_KEYS } from "../config/segmentMap.js";

const SEGMENT_BY_KEY = new Map(SEGMENT_MAP.map((segment) => [segment.segmentKey, segment]));
const STATION_TO_REPLAY_INDEX = Object.freeze({ ski_erg: 1, sled_push: 2, sled_pull: 3, burpee_broad_jump: 4, row: 5, farmers_carry: 6, sandbag_lunges: 7, wall_balls: 8 });

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normaliseSplit(split) {
  const segmentKey = String(split?.segmentKey ?? "").trim();
  const mapped = SEGMENT_BY_KEY.get(segmentKey);
  const type = split?.type ?? mapped?.type ?? null;
  const timeSeconds = finiteOrNull(split?.timeSeconds);
  if (!segmentKey || !type || timeSeconds === null) return null;
  const normalised = { segmentKey, type, label: mapped?.displayName ?? segmentKey, timeSeconds };
  if (Number.isInteger(Number(split?.fieldRank)) && Number(split.fieldRank) > 0) normalised.fieldRank = Number(split.fieldRank);
  return normalised;
}

function raceReplaySplits(raceReplay) {
  if (!Array.isArray(raceReplay)) return [];
  const splits = [];
  for (const item of raceReplay) {
    const index = STATION_TO_REPLAY_INDEX[String(item?.station ?? "").trim()];
    if (!index) continue;
    const entrySeconds = finiteOrNull(item?.entrySeconds);
    const exitSeconds = finiteOrNull(item?.exitSeconds);
    if (entrySeconds !== null) splits.push({ segmentKey: `entry_${index}`, type: "entry", timeSeconds: entrySeconds });
    if (exitSeconds !== null) splits.push({ segmentKey: `exit_${index}`, type: "exit", timeSeconds: exitSeconds });
  }
  return splits;
}

function sumByKeys(splitMap, keys) {
  return keys.reduce((sum, key) => {
    const value = splitMap.get(key)?.timeSeconds;
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function buildAggregateSegments({ runTime, workTime, roxzoneTime, finishTime }) {
  return [
    { segmentKey: "total_time", type: "aggregate", label: "Finish Time", timeSeconds: finishTime },
    { segmentKey: "run_time", type: "aggregate", label: "Total Run Time", timeSeconds: runTime },
    { segmentKey: "work_time", type: "aggregate", label: "Total Station Time", timeSeconds: workTime },
    { segmentKey: "roxzone_time", type: "aggregate", label: "Total Roxzone Time", timeSeconds: roxzoneTime },
  ].filter((segment) => Number.isFinite(segment.timeSeconds));
}

export function normaliseSubmission(input = {}) {
  const rawSplits = Array.isArray(input.splits) ? input.splits : [];
  const suppliedSplits = [...rawSplits, ...raceReplaySplits(input.raceReplay)].map(normaliseSplit).filter(Boolean);
  const penalties = Array.isArray(input.penalties)
    ? input.penalties
        .map((penalty) => ({
          runKey: String(penalty?.runKey ?? penalty?.segmentKey ?? penalty?.station ?? "").trim(),
          penaltySeconds: finiteOrNull(penalty?.penaltySeconds),
        }))
        .filter((penalty) => penalty.runKey && (RUN_KEYS.includes(penalty.runKey) || STATION_KEYS.includes(penalty.runKey)) && penalty.penaltySeconds !== null)
    : [];
  const splitMap = new Map(suppliedSplits.map((split) => [split.segmentKey, split]));
  const penaltyAdjustedSplitMap = new Map(splitMap);
  for (const { runKey, penaltySeconds } of penalties) {
    const original = splitMap.get(runKey);
    if (original && Number.isFinite(original.timeSeconds)) {
      penaltyAdjustedSplitMap.set(runKey, { ...original, timeSeconds: Math.max(0, original.timeSeconds - penaltySeconds) });
    }
  }
  const finishTimeSeconds = finiteOrNull(input.race?.finishTimeSeconds);
  const runTime = sumByKeys(splitMap, RUN_KEYS);
  const workTime = sumByKeys(splitMap, STATION_KEYS);
  const explicitRoxzoneTime = sumByKeys(splitMap, ROXZONE_KEYS);
  const explicitRoxzoneCount = ROXZONE_KEYS.filter((key) => splitMap.has(key)).length;
  const unallocatedTime = finishTimeSeconds !== null ? finishTimeSeconds - runTime - workTime : null;

  let roxzoneMode = input.roxzoneMode ?? "none";
  let roxzoneTime = null;
  let roxzoneConfidence = { aggregate: "low", segment: "low" };

  if (explicitRoxzoneCount > 0 || roxzoneMode === "explicit_splits") {
    roxzoneMode = "explicit_splits";
    roxzoneTime = explicitRoxzoneTime;
    roxzoneConfidence = {
      aggregate: explicitRoxzoneCount >= 8 ? "high" : "medium",
      segment: explicitRoxzoneCount >= 8 ? "high" : "medium",
    };
  } else if ((roxzoneMode === "inferred_total" || roxzoneMode === "none") && Number.isFinite(unallocatedTime) && unallocatedTime >= 0) {
    roxzoneMode = "inferred_total";
    roxzoneTime = unallocatedTime;
    roxzoneConfidence = { aggregate: "medium", segment: "low" };
  } else {
    roxzoneMode = "none";
    roxzoneTime = null;
  }

  return {
    ...input,
    athlete: {
      ...(input.athlete ?? {}),
      division: input.athlete?.division ?? input.race?.division ?? null,
      ageGroup: input.athlete?.ageGroup ?? null,
    },
    race: {
      ...(input.race ?? {}),
      division: input.race?.division ?? input.athlete?.division ?? null,
      finishTimeSeconds,
    },
    splits: suppliedSplits,
    penalties,
    splitMap,
    penaltyAdjustedSplitMap,
    aggregateSegments: buildAggregateSegments({ runTime, workTime, roxzoneTime, finishTime: finishTimeSeconds }),
    runTimeSeconds: runTime,
    workTimeSeconds: workTime,
    roxzoneTimeSeconds: roxzoneTime,
    unallocatedTimeSeconds: unallocatedTime,
    roxzoneMode,
    roxzoneConfidence,
    completeness: {
      runSplits: RUN_KEYS.filter((key) => splitMap.has(key)).length,
      stationSplits: STATION_KEYS.filter((key) => splitMap.has(key)).length,
      roxzoneSplits: explicitRoxzoneCount,
      totalExpectedSplits: 24,
    },
  };
}

export function getSegmentLabel(segmentKey) {
  if (segmentKey === "total_time") return "Finish Time";
  if (segmentKey === "run_time") return "Total Run Time";
  if (segmentKey === "work_time") return "Total Station Time";
  if (segmentKey === "roxzone_time") return "Total Roxzone Time";
  return SEGMENT_BY_KEY.get(segmentKey)?.displayName ?? segmentKey;
}
