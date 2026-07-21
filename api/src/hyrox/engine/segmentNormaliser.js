import { RUN_KEYS, ROXZONE_KEYS, SEGMENT_MAP, STATION_KEYS } from "../config/segmentMap.js";

const SEGMENT_BY_KEY = new Map(SEGMENT_MAP.map((segment) => [segment.segmentKey, segment]));
const RACE_KEYS = Object.freeze([...RUN_KEYS, ...STATION_KEYS]);
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

function sumByKeys(splitMap, keys, { requireAll = false } = {}) {
  const values = keys
    .map((key) => splitMap.get(key)?.timeSeconds)
    .filter(Number.isFinite);
  if (requireAll && values.length < keys.length) return null;
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function explicitAggregate(splitMap, segmentKey) {
  return finiteOrNull(splitMap.get(segmentKey)?.timeSeconds);
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
  const finishTimeSeconds = finiteOrNull(input.race?.finishTimeSeconds);
  const runSplitCount = RUN_KEYS.filter((key) => splitMap.has(key)).length;
  const stationSplitCount = STATION_KEYS.filter((key) => splitMap.has(key)).length;
  const explicitRunTime = explicitAggregate(splitMap, "run_time");
  const explicitWorkTime = explicitAggregate(splitMap, "work_time");
  const explicitRoxzoneAggregate = explicitAggregate(splitMap, "roxzone_time");
  const explicitRoxzoneTime = explicitRoxzoneAggregate ?? sumByKeys(splitMap, ROXZONE_KEYS);
  const explicitRoxzoneCount = ROXZONE_KEYS.filter((key) => splitMap.has(key)).length;

  let roxzoneMode = input.roxzoneMode ?? "none";
  let roxzoneTime = null;
  let roxzoneConfidence = { aggregate: "low", segment: "low" };

  if (explicitRoxzoneAggregate !== null) {
    roxzoneMode = "explicit_total";
    roxzoneTime = explicitRoxzoneAggregate;
    roxzoneConfidence = { aggregate: "high", segment: "low" };
  } else if (explicitRoxzoneCount > 0 || roxzoneMode === "explicit_splits") {
    roxzoneMode = "explicit_splits";
    roxzoneTime = explicitRoxzoneTime;
    roxzoneConfidence = {
      aggregate: explicitRoxzoneCount >= 8 ? "high" : "medium",
      segment: explicitRoxzoneCount >= 8 ? "high" : "medium",
    };
  }

  const estimatedSplitKeys = [];
  const unrepairableMissingSplitKeys = [];
  const missingRaceKeys = RACE_KEYS.filter((key) => !splitMap.has(key));

  if (missingRaceKeys.length === 1 && Number.isFinite(finishTimeSeconds) && Number.isFinite(roxzoneTime) && roxzoneMode !== "inferred_total") {
    const missingKey = missingRaceKeys[0];
    const knownSum = RACE_KEYS
      .filter((key) => key !== missingKey)
      .reduce((sum, key) => sum + (splitMap.get(key)?.timeSeconds ?? 0), 0);
    const repairedSeconds = finishTimeSeconds - knownSum - roxzoneTime;
    if (Number.isFinite(repairedSeconds) && repairedSeconds >= 0) {
      const mapped = SEGMENT_BY_KEY.get(missingKey);
      splitMap.set(missingKey, {
        segmentKey: missingKey,
        type: mapped?.type ?? (RUN_KEYS.includes(missingKey) ? "run" : "station"),
        label: mapped?.displayName ?? missingKey,
        timeSeconds: repairedSeconds,
        estimated: true,
      });
      estimatedSplitKeys.push(missingKey);
    } else {
      unrepairableMissingSplitKeys.push(missingKey);
    }
  } else if (missingRaceKeys.length > 0) {
    unrepairableMissingSplitKeys.push(...missingRaceKeys);
  }

  const penaltyAdjustedSplitMap = new Map(splitMap);
  for (const { runKey, penaltySeconds } of penalties) {
    const original = splitMap.get(runKey);
    if (original && Number.isFinite(original.timeSeconds)) {
      penaltyAdjustedSplitMap.set(runKey, { ...original, timeSeconds: Math.max(0, original.timeSeconds - penaltySeconds) });
    }
  }

  const runTime = explicitRunTime ?? sumByKeys(splitMap, RUN_KEYS, { requireAll: true });
  const workTime = explicitWorkTime ?? sumByKeys(splitMap, STATION_KEYS, { requireAll: true });
  const unallocatedTime = finishTimeSeconds !== null && Number.isFinite(runTime) && Number.isFinite(workTime)
    ? finishTimeSeconds - runTime - workTime
    : null;

  if (roxzoneMode !== "explicit_total" && roxzoneMode !== "explicit_splits" && (roxzoneMode === "inferred_total" || roxzoneMode === "none") && Number.isFinite(unallocatedTime) && unallocatedTime >= 0) {
    roxzoneMode = "inferred_total";
    roxzoneTime = unallocatedTime;
    roxzoneConfidence = { aggregate: "medium", segment: "low" };
  } else if (roxzoneMode !== "explicit_total" && roxzoneMode !== "explicit_splits") {
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
      eventCountry: input.race?.eventCountry ?? null,
    },
    splits: suppliedSplits,
    penalties,
    splitMap,
    penaltyAdjustedSplitMap,
    aggregateSegments: buildAggregateSegments({ runTime, workTime, roxzoneTime, finishTime: finishTimeSeconds }),
    estimatedSplitKeys,
    unrepairableMissingSplitKeys,
    runTimeSeconds: runTime,
    workTimeSeconds: workTime,
    roxzoneTimeSeconds: roxzoneTime,
    unallocatedTimeSeconds: unallocatedTime,
    roxzoneMode,
    roxzoneConfidence,
    completeness: {
      runSplits: runSplitCount,
      stationSplits: stationSplitCount,
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
  const displayName = SEGMENT_BY_KEY.get(segmentKey)?.displayName;
  if (displayName) return displayName;
  // Humanise the raw key as a last resort so labels are never empty
  return String(segmentKey ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
