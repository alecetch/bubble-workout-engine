function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function toSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_/-]/g, "")
    .replace(/^_+|_+$/g, "");
}

function toPreferredDayCode(value) {
  const raw = toSlug(value);
  const compressed = raw.replace(/_/g, "");
  const map = {
    mon: "mon",
    monday: "mon",
    tue: "tue",
    tues: "tue",
    tuesday: "tue",
    wed: "wed",
    weds: "wed",
    wednesday: "wed",
    thu: "thu",
    thur: "thu",
    thurs: "thu",
    thursday: "thu",
    fri: "fri",
    friday: "fri",
    sat: "sat",
    saturday: "sat",
    sun: "sun",
    sunday: "sun",
  };
  return map[compressed] || map[raw] || null;
}

function mapFitnessRank(fitnessLevel) {
  const v = String(fitnessLevel ?? "").trim().toLowerCase();
  if (v === "intermediate") return 1;
  if (v === "advanced") return 2;
  if (v === "elite") return 3;
  return 0;
}

function mapExerciseRowsToBubbleResults(exerciseRows) {
  return (exerciseRows || []).map((row) => ({
    id: row.exercise_id,
    exercise_id: row.exercise_id,
    name: row.name,
    movement_pattern_primary: row.movement_pattern_primary,
    swap_group_id_1: row.swap_group_id_1,
    swap_group_id_2: row.swap_group_id_2,
    preferred_in_json: row.preferred_in_json ?? [],
    equipment_json: row.equipment_json ?? [],
    density_rating: row.density_rating ?? 0,
    complexity_rank: row.complexity_rank ?? 0,
    is_loadable: row.is_loadable ?? false,
    movement_class: row.movement_class,
    target_regions_json: row.target_regions_json ?? [],
    warmup_hooks: row.warmup_hooks ?? [],
  }));
}

function mapExerciseRowsToCatalogEx(exerciseRows) {
  return (exerciseRows || []).map((row) => ({
    id: row.exercise_id,
    n: row.name,
    sw: row.swap_group_id_1 || "",
    sw2: row.swap_group_id_2 || "",
    mp: row.movement_pattern_primary || "",
    eq: row.equipment_json ?? [],
    pref: row.preferred_in_json ?? [],
    den: row.density_rating ?? 0,
    cx: row.complexity_rank ?? 0,
    load: Boolean(row.is_loadable),
    mc: row.movement_class || "",
    tr: row.target_regions_json ?? [],
    wh: row.warmup_hooks ?? [],
  }));
}

export function buildInputsFromDevProfile(devProfile, exerciseRows) {
  const preferredDays = asArray(devProfile?.preferredDays)
    .map((day) => toPreferredDayCode(day))
    .filter(Boolean);
  const equipmentItems = asArray(devProfile?.equipmentItemCodes)
    .map((x) => toSlug(x))
    .filter(Boolean);
  const injuryFlags = asArray(devProfile?.injuryFlags)
    .map((x) => toSlug(x))
    .filter(Boolean);
  const goals = asArray(devProfile?.goals)
    .map((x) => toSlug(x))
    .filter(Boolean);

  const exercises = mapExerciseRowsToBubbleResults(exerciseRows);
  const catalogEx = mapExerciseRowsToCatalogEx(exerciseRows);
  const fitnessRank = mapFitnessRank(devProfile?.fitnessLevel);

  return {
    clientProfile: {
      response: {
        bubble_client_profile_id: devProfile?.id ?? null,
        fitness_rank: fitnessRank,
        fitness_level_slug: toSlug(devProfile?.fitnessLevel || "beginner"),
        equipment_items_slugs: equipmentItems,
        injury_flags_slugs: injuryFlags,
        preferred_days: preferredDays.join(","),
        main_goals_slugs: goals,
        minutes_per_session: Number.isFinite(Number(devProfile?.minutesPerSession))
          ? Number(devProfile.minutesPerSession)
          : null,
        duration_mins: Number.isFinite(Number(devProfile?.minutesPerSession))
          ? Number(devProfile.minutesPerSession)
          : 50,
        days_per_week: preferredDays.length || 3,
        height_cm: devProfile?.heightCm ?? null,
        weight_kg: devProfile?.weightKg ?? null,
        equipment_preset_slug: toSlug(devProfile?.equipmentPreset || ""),
        goal_notes: devProfile?.goalNotes ?? "",
        schedule_constraints: devProfile?.scheduleConstraints ?? "",
      },
    },
    exercises: {
      response: {
        results: exercises,
      },
    },
    configs: {
      catalogBuilds: {
        response: {
          results: [
            {
              version: "v3",
              catalog_json: {
                ex: catalogEx,
              },
              rep_rules_json: [],
              narration_json: [],
            },
          ],
        },
      },
      genConfigs: {
        response: {
          results: [],
        },
      },
    },
  };
}
