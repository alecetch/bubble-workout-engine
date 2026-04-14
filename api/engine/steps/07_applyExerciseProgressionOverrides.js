function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function applyExerciseProgressionOverrides({
  program,
  progressionStateMap,
  deloadWeekIndex,
}) {
  // Layer C only annotates the in-memory program object here. Persisting prescribed_load_kg
  // into program_exercise is intentionally deferred; recommended_load_kg already comes from
  // Layer B state/decision writes and is the field the current clients consume.
  //
  // progressionStateMap is keyed by "exercise_id::purpose" so the same exercise used in
  // different roles (e.g. main vs accessory) carries independent progression state.
  const stateMap = progressionStateMap instanceof Map
    ? progressionStateMap
    : new Map();
  const debug = {
    overrides_applied: 0,
    weeks_with_deload_suppression: [],
  };

  if (!program || !Array.isArray(program.weeks)) {
    return { program, debug: { ...debug, skipped: "no_weeks" } };
  }

  for (const week of program.weeks) {
    const weekIndex = toInt(week?.week_index, null);
    const isDeloadWeek = deloadWeekIndex != null && weekIndex === deloadWeekIndex;
    let weekSuppressed = false;

    for (const day of week?.days ?? []) {
      for (const segment of day?.segments ?? []) {
        const segmentPurpose = segment?.purpose ?? "";
        for (const item of segment?.items ?? []) {
          const exerciseId = item?.exercise_id ?? item?.ex_id ?? null;
          if (!exerciseId) continue;

          const state = stateMap.get(`${exerciseId}::${segmentPurpose}`);
          if (!state) continue;

          const outcome = String(state.last_outcome ?? "").trim();

          if (isDeloadWeek) {
            if (outcome === "deload_local" && state.current_load_kg_override != null) {
              item.prescribed_load_kg = toNumber(state.current_load_kg_override, null);
              item._progression_override_debug = { applied: "deload_local_structural_week", outcome: "deload_local" };
              debug.overrides_applied += 1;
            } else {
              item._progression_override_debug = { skipped: "deload_week" };
              weekSuppressed = true;
            }
            continue;
          }

          let applied = false;

          if (state.current_load_kg_override != null) {
            const load = toNumber(state.current_load_kg_override, null);
            if (load != null) {
              item.prescribed_load_kg = load;
              applied = true;
            }
          }

          if (state.current_rep_target_override != null) {
            item.reps_prescribed = String(state.current_rep_target_override);
            applied = true;
          }

          if (state.current_set_override != null) {
            const sets = toInt(state.current_set_override, null);
            if (sets != null && sets >= 1) {
              item.sets = sets;
              applied = true;
            }
          }

          if (state.current_rest_sec_override != null) {
            const rest = toInt(state.current_rest_sec_override, null);
            if (rest != null && rest >= 0) {
              item.rest_after_set_sec = rest;
              applied = true;
            }
          }

          if (applied) {
            item._progression_override_debug = {
              applied: true,
              outcome: outcome || null,
              load_kg: item.prescribed_load_kg ?? null,
              reps: item.reps_prescribed ?? null,
            };
            debug.overrides_applied += 1;
          }
        }
      }
    }

    if (weekSuppressed && weekIndex != null) {
      debug.weeks_with_deload_suppression.push(weekIndex);
    }
  }

  return { program, debug };
}
