const RACE_KEYS = Object.freeze([
  "run_1", "ski_erg", "run_2", "sled_push", "run_3", "sled_pull",
  "run_4", "burpee_broad_jump", "run_5", "row", "run_6", "farmers_carry",
  "run_7", "sandbag_lunges", "run_8", "wall_balls",
]);

export function computeExactTargetMap(segments, targetFinishSeconds, hasGoalGroup) {
  const segMap = new Map((segments ?? []).map((segment) => [segment.segmentKey, segment]));
  const goalTotal = segMap.get("total_time")?.goalBenchmarkSeconds;
  if (
    !hasGoalGroup
    || !Number.isFinite(targetFinishSeconds)
    || targetFinishSeconds <= 0
    || !Number.isFinite(goalTotal)
    || goalTotal <= 0
  ) return null;

  const scale = targetFinishSeconds / goalTotal;
  const targets = new Map();

  for (const key of RACE_KEYS) {
    const segment = segMap.get(key);
    if (Number.isFinite(segment?.goalBenchmarkSeconds)) {
      targets.set(key, Math.round(segment.goalBenchmarkSeconds * scale));
    }
  }

  const sumByType = (type) => RACE_KEYS.reduce((sum, key) => {
    const segment = segMap.get(key);
    const target = targets.get(key);
    return segment?.type === type && Number.isFinite(target) ? sum + target : sum;
  }, 0);

  const runTarget = sumByType("run");
  const workTarget = sumByType("station");
  const roxzoneGoal = segMap.get("roxzone_time")?.goalBenchmarkSeconds;
  const roxzoneFromBenchmark = Number.isFinite(roxzoneGoal) ? Math.round(roxzoneGoal * scale) : null;
  const roxzoneResidual = Math.max(0, Math.round(targetFinishSeconds - runTarget - workTarget));
  const roxzoneTarget = runTarget > 0 || workTarget > 0 ? roxzoneResidual : roxzoneFromBenchmark;

  if (runTarget > 0) targets.set("run_time", runTarget);
  if (workTarget > 0) targets.set("work_time", workTarget);
  if (Number.isFinite(roxzoneTarget)) targets.set("roxzone_time", roxzoneTarget);
  targets.set("total_time", Math.round(targetFinishSeconds));

  return targets;
}

export function attachExactTargets(segments, exactTargetMap) {
  return (segments ?? []).map((segment) => {
    const exactTargetSeconds = exactTargetMap?.get(segment.segmentKey) ?? null;
    const timeGapToExactTargetSeconds =
      Number.isFinite(exactTargetSeconds) && Number.isFinite(segment.userSeconds)
        ? segment.userSeconds - exactTargetSeconds
        : null;
    return { ...segment, exactTargetSeconds, timeGapToExactTargetSeconds };
  });
}
