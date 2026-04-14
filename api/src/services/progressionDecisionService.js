import {
  fetchProgramGenerationConfigs,
} from "./programGenerationConfig.js";

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeJsonParse(value, fallback = {}) {
  try {
    if (value == null) return fallback;
    if (typeof value === "object") return value;
    const raw = String(value).trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function rankKey(rank) {
  const numeric = toInt(rank, 1);
  if (numeric <= 0) return "beginner";
  if (numeric === 1) return "intermediate";
  if (numeric === 2) return "advanced";
  return "elite";
}

function parseRepRange(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { low: null, high: null, midpoint: null };
  const nums = raw.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length >= 2) {
    return { low: nums[0], high: nums[1], midpoint: Math.round((nums[0] + nums[1]) / 2) };
  }
  if (nums.length === 1) {
    return { low: nums[0], high: nums[0], midpoint: nums[0] };
  }
  return { low: null, high: null, midpoint: null };
}

function parseTargetRir(value, fallback = 2) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*RIR/i);
  if (rangeMatch) return (Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2;
  const singleMatch = raw.match(/(\d+(?:\.\d+)?)\s*RIR/i);
  if (singleMatch) return Number(singleMatch[1]);
  return fallback;
}

function makeDefaultProgressionConfig(programType) {
  const type = String(programType ?? "").trim().toLowerCase();
  return {
    history: {
      lookback_exposures_exact: 3,
      minimum_exact_exposures_for_full_confidence: 2,
      allow_equivalent_history_fallback: false,
    },
    outcomes: {
      allow_multiple_levers_same_exposure: false,
    },
    slot_profile_map: {
      hypertrophy: { main: "hypertrophy_main", secondary: "hypertrophy_secondary", accessory: "hypertrophy_accessory" },
      strength: { main: "strength_main", secondary: "strength_secondary", accessory: "strength_accessory" },
      conditioning: { main: "conditioning_main", secondary: "conditioning_secondary", accessory: "conditioning_accessory" },
      hyrox: { main: "hyrox_main", secondary: "hyrox_secondary", accessory: "hyrox_accessory" },
    },
    lever_profiles: {
      hypertrophy_main: { priority_order: ["reps", "load", "hold", "deload"], load_increment_profile: "compound_moderate" },
      hypertrophy_secondary: { priority_order: ["reps", "load", "hold", "deload"], load_increment_profile: "compound_moderate" },
      hypertrophy_accessory: { priority_order: ["reps", "load", "hold", "deload"], load_increment_profile: "small_isolation" },
      strength_main: { priority_order: ["load", "reps", "hold", "deload"], load_increment_profile: "barbell_strength" },
      strength_secondary: { priority_order: ["load", "hold", "deload"], load_increment_profile: "compound_moderate" },
      strength_accessory: { priority_order: ["reps", "load", "hold", "deload"], load_increment_profile: "small_isolation" },
      conditioning_main: { priority_order: ["rest", "hold", "deload"] },
      conditioning_secondary: { priority_order: ["rest", "hold", "deload"] },
      conditioning_accessory: { priority_order: ["rest", "hold", "deload"] },
      hyrox_main: { priority_order: ["rest", "load", "hold", "deload"], load_increment_profile: "hyrox_station_load" },
      hyrox_secondary: { priority_order: ["rest", "hold", "deload"] },
      hyrox_accessory: { priority_order: ["rest", "hold", "deload"] },
    },
    load_increment_profiles: {
      barbell_strength: {
        default_rounding_kg: 2.5,
        bands: [
          { min_load_kg: 0, max_load_kg: 60, increment_kg: 2.5 },
          { min_load_kg: 60, max_load_kg: 140, increment_kg: 5.0 },
          { min_load_kg: 140, increment_kg: 2.5 },
        ],
      },
      compound_moderate: {
        default_rounding_kg: 2.5,
        bands: [
          { min_load_kg: 0, max_load_kg: 40, increment_kg: 2.5 },
          { min_load_kg: 40, max_load_kg: 100, increment_kg: 5.0 },
          { min_load_kg: 100, increment_kg: 2.5 },
        ],
      },
      small_isolation: {
        default_rounding_kg: 1,
        bands: [
          { min_load_kg: 0, max_load_kg: 15, increment_kg: 1 },
          { min_load_kg: 15, increment_kg: 2 },
        ],
      },
      hyrox_station_load: {
        default_rounding_kg: 2.5,
        bands: [{ min_load_kg: 0, increment_kg: 2.5 }],
      },
    },
    deload_rules: {
      standard_local: {
        underperformance_exposure_threshold: 2,
        rir_miss_threshold: 1.5,
        load_drop_threshold_pct: 5,
        response: { load_drop_pct: 5 },
      },
      strength_local: {
        underperformance_exposure_threshold: 2,
        rir_miss_threshold: 1.0,
        load_drop_threshold_pct: 5,
        response: { load_drop_pct: 5 },
      },
    },
    programType: type,
  };
}

function mergeNamedObjectEntries(defaultEntries, overrideEntries) {
  const merged = { ...(defaultEntries ?? {}) };
  for (const [key, value] of Object.entries(overrideEntries ?? {})) {
    const base = merged[key];
    if (base && typeof base === "object" && !Array.isArray(base) && value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = { ...base, ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function normalizeProgressionShape(rawProgression) {
  if (!rawProgression || typeof rawProgression !== "object" || Array.isArray(rawProgression)) {
    return {};
  }
  return {
    ...rawProgression,
    slot_profile_map: rawProgression.slot_profile_map ?? rawProgression.slotProfileMap ?? {},
    lever_profiles: rawProgression.lever_profiles ?? rawProgression.leverProfiles ?? {},
    load_increment_profiles: rawProgression.load_increment_profiles ?? rawProgression.loadIncrementProfiles ?? {},
    rest_progression_profiles: rawProgression.rest_progression_profiles ?? rawProgression.restProgressionProfiles ?? {},
    rep_progression_profiles: rawProgression.rep_progression_profiles ?? rawProgression.repProgressionProfiles ?? {},
    deload_rules: rawProgression.deload_rules ?? rawProgression.deloadRules ?? {},
  };
}

function mergeProgressionConfig(defaults, pgcJson) {
  const progression = normalizeProgressionShape(pgcJson?.progression);
  return {
    ...defaults,
    ...progression,
    history: { ...defaults.history, ...(progression.history ?? {}) },
    outcomes: { ...defaults.outcomes, ...(progression.outcomes ?? {}) },
    slot_profile_map: mergeNamedObjectEntries(defaults.slot_profile_map, progression.slot_profile_map),
    lever_profiles: mergeNamedObjectEntries(defaults.lever_profiles, progression.lever_profiles),
    load_increment_profiles: mergeNamedObjectEntries(defaults.load_increment_profiles, progression.load_increment_profiles),
    rest_progression_profiles: mergeNamedObjectEntries(defaults.rest_progression_profiles, progression.rest_progression_profiles),
    rep_progression_profiles: mergeNamedObjectEntries(defaults.rep_progression_profiles, progression.rep_progression_profiles),
    deload_rules: mergeNamedObjectEntries(defaults.deload_rules, progression.deload_rules),
  };
}

function resolveProfileName(config, programType, purpose) {
  const type = String(programType ?? "").trim().toLowerCase();
  const purposeKey = String(purpose ?? "").trim().toLowerCase() || "accessory";
  return config.slot_profile_map?.[type]?.[purposeKey] ?? `${type}_${purposeKey}`;
}

function resolveLoadIncrement(profileName, config, row, baseLoad, rankOverride) {
  const profile = config.lever_profiles?.[profileName] ?? {};
  const incrementProfileName = profile.load_increment_profile ?? "compound_moderate";
  const incrementProfile = config.load_increment_profiles?.[incrementProfileName] ?? {};
  const bands = Array.isArray(incrementProfile.bands) ? incrementProfile.bands : [];

  let increment = toNumber(incrementProfile.default_rounding_kg, 2.5) ?? 2.5;
  for (const band of bands) {
    const min = toNumber(band.min_load_kg, 0) ?? 0;
    const max = toNumber(band.max_load_kg, Number.POSITIVE_INFINITY) ?? Number.POSITIVE_INFINITY;
    if (baseLoad >= min && baseLoad < max) {
      increment = toNumber(band.increment_kg, increment) ?? increment;
      break;
    }
  }

  const equipment = Array.isArray(row.equipment_items_slugs) ? row.equipment_items_slugs : [];
  if (equipment.includes("dumbbells")) increment = Math.min(increment, 2);
  if (equipment.includes("machine")) increment = Math.max(increment, 2.5);
  const loadScale = toNumber(rankOverride?.load_increment_scale, 1) ?? 1;
  increment *= loadScale;
  if (increment <= 0) increment = 1;
  return Number(increment.toFixed(2));
}

function confidenceLabel(score) {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function mostRecentPositiveLoad(history) {
  return history.find((entry) => toNumber(entry.weight_kg, 0) > 0) ?? null;
}

function roundToIncrement(value, increment) {
  if (!(value > 0)) return null;
  const step = increment > 0 ? increment : 2.5;
  return Number((Math.round(value / step) * step).toFixed(2));
}

function buildDecision({
  row,
  programType,
  profileName,
  profile,
  rankOverride,
  history,
  config,
}) {
  if (!["hypertrophy", "strength"].includes(String(programType ?? "").toLowerCase())) {
    return null;
  }

  if (!row.is_loadable) return null;
  if (!history.length) return null;

  const repRange = parseRepRange(row.reps_prescribed);
  const targetHigh = repRange.high ?? repRange.low;
  const targetLow = repRange.low ?? repRange.high;
  const targetRir = parseTargetRir(row.intensity_prescription, 2);
  const recent = history.slice(0, Math.max(2, toInt(config.history?.lookback_exposures_exact, 3) ?? 3));
  const latest = recent[0];
  const second = recent[1] ?? null;
  const latestWeight = toNumber(latest?.weight_kg, null);
  const latestReps = toInt(latest?.reps_completed, null);
  const latestRir = toNumber(latest?.rir_actual, null);
  const baselineLoadRow = mostRecentPositiveLoad(recent);
  const baselineLoad = toNumber(baselineLoadRow?.weight_kg, latestWeight);
  const progressGateOffset = toNumber(rankOverride?.rir_progress_gate_offset, 0) ?? 0;
  const requiredRir = targetRir + progressGateOffset;
  const evidenceMultiplier = toNumber(rankOverride?.evidence_requirement_multiplier, 1) ?? 1;
  const requiredSuccesses = Math.max(1, Math.ceil(evidenceMultiplier));
  const successfulExposures = recent.filter((entry) => {
    const reps = toInt(entry.reps_completed, null);
    const rir = toNumber(entry.rir_actual, null);
    if (reps == null || targetHigh == null) return false;
    if (reps < targetHigh) return false;
    if (rir == null) return reps >= targetHigh;
    return rir >= requiredRir;
  }).length;

  const underperformances = recent.filter((entry) => {
    const reps = toInt(entry.reps_completed, null);
    const rir = toNumber(entry.rir_actual, null);
    if (reps != null && targetLow != null && reps < targetLow) return true;
    return rir != null && rir < targetRir - (toNumber(config.deload_rules?.[profile.deload_profile ?? "standard_local"]?.rir_miss_threshold, 1.5) ?? 1.5);
  }).length;

  const reasons = [];
  let outcome = "hold";
  let primaryLever = "hold";
  let recommendedLoadKg = null;
  let recommendedRepsTarget = null;
  let confidenceScore = 25 + Math.min(history.length, 3) * 15;

  if (latestRir != null) confidenceScore += 10;
  if (successfulExposures >= requiredSuccesses) confidenceScore += 15;

  const deloadProfile = config.deload_rules?.[profile.deload_profile ?? "standard_local"] ?? config.deload_rules?.standard_local ?? {};
  const deloadThreshold = toInt(deloadProfile.underperformance_exposure_threshold, 2) ?? 2;
  const loadDropPct = toNumber(deloadProfile.response?.load_drop_pct, 5) ?? 5;

  if (underperformances >= deloadThreshold && baselineLoad) {
    outcome = "deload_local";
    primaryLever = "load";
    recommendedLoadKg = roundToIncrement(baselineLoad * (1 - (loadDropPct / 100)), resolveLoadIncrement(profileName, config, row, baselineLoad, rankOverride));
    reasons.push("Recent exact history shows repeated underperformance relative to the current target.");
  } else if (String(programType).toLowerCase() === "strength") {
    if (baselineLoad && successfulExposures >= requiredSuccesses) {
      outcome = "increase_load";
      primaryLever = "load";
      const increment = resolveLoadIncrement(profileName, config, row, baselineLoad, rankOverride);
      recommendedLoadKg = roundToIncrement(baselineLoad + increment, increment);
      reasons.push("Recent exact history hit the current rep target with acceptable RIR.");
    } else if (latestReps != null && targetHigh != null && latestReps >= Math.max(1, targetHigh - 1) && latestRir != null && latestRir >= requiredRir) {
      outcome = "increase_reps";
      primaryLever = "reps";
      recommendedRepsTarget = targetHigh;
      reasons.push("Load increase is not yet justified, but recent performance suggests a rep target increase is appropriate.");
    } else {
      reasons.push("Recent exact history does not yet justify a progression change.");
    }
  } else {
    if (baselineLoad && targetHigh != null && latestReps != null && latestReps >= targetHigh && successfulExposures >= requiredSuccesses) {
      outcome = "increase_load";
      primaryLever = "load";
      const increment = resolveLoadIncrement(profileName, config, row, baselineLoad, rankOverride);
      recommendedLoadKg = roundToIncrement(baselineLoad + increment, increment);
      reasons.push("Top of the current rep range has been reached with acceptable effort, so load can progress.");
    } else if (latestReps != null && targetHigh != null && latestReps < targetHigh && (latestRir == null || latestRir >= requiredRir)) {
      outcome = "increase_reps";
      primaryLever = "reps";
      recommendedRepsTarget = Math.min(targetHigh, latestReps + 1);
      reasons.push("Recent exact history supports pushing reps upward within the current range before increasing load.");
    } else {
      reasons.push("Recent exact history suggests the current prescription should hold for now.");
    }
  }

  const evidence = {
    exposures_considered: recent.length,
    successful_exposures: successfulExposures,
    underperformance_exposures: underperformances,
    latest_weight_kg: latestWeight,
    latest_reps: latestReps,
    latest_rir: latestRir,
    target_low: targetLow,
    target_high: targetHigh,
    target_rir: targetRir,
    required_rir: requiredRir,
  };

  return {
    progression_group_key: `exercise:${row.exercise_id}`,
    exercise_id: row.exercise_id,
    purpose: row.purpose,
    outcome,
    primary_lever: primaryLever,
    confidence: confidenceLabel(confidenceScore),
    confidence_score: confidenceScore,
    source: "exact_history",
    recommended_load_kg: recommendedLoadKg,
    recommended_reps_target: recommendedRepsTarget,
    recommended_sets: null,
    recommended_rest_seconds: null,
    reasons,
    evidence,
    source_log_id: latest?.log_id ?? null,
  };
}

async function loadProgressionConfig(db, programType) {
  const rows = await fetchProgramGenerationConfigs(db, programType, 1).catch(() => []);
  const row = Array.isArray(rows) ? rows[0] ?? null : null;
  const pgcJson = safeJsonParse(row?.program_generation_config_json, {});
  const defaults = makeDefaultProgressionConfig(programType);
  return {
    config: mergeProgressionConfig(defaults, pgcJson),
    rankOverrides: safeJsonParse(row?.progression_by_rank_json, {}),
  };
}

export function makeProgressionDecisionService(db) {
  async function applyProgressionRecommendations({
    programId,
    userId,
    programType,
    fitnessRank = 1,
  }) {
    if (!programId || !userId || !programType) {
      return { decisions: [], updated: 0 };
    }

    const { config, rankOverrides } = await loadProgressionConfig(db, programType);
    const rankOverride = rankOverrides?.[rankKey(fitnessRank)] ?? {};

    const programExerciseResult = await db.query(
      `
      SELECT
        pe.id AS program_exercise_id,
        pe.program_day_id,
        pe.exercise_id,
        pe.exercise_name,
        pe.purpose,
        pe.sets_prescribed,
        pe.reps_prescribed,
        pe.reps_unit,
        pe.intensity_prescription,
        pe.rest_seconds,
        pe.is_loadable,
        pd.week_number,
        pd.day_number,
        pd.global_day_index,
        ec.equipment_items_slugs,
        ec.movement_class,
        ec.movement_pattern_primary
      FROM program_exercise pe
      JOIN program_day pd
        ON pd.id = pe.program_day_id
      LEFT JOIN exercise_catalogue ec
        ON ec.exercise_id = pe.exercise_id
      WHERE pe.program_id = $1
      ORDER BY pd.global_day_index ASC, pe.order_in_day ASC
      `,
      [programId],
    );

    const rows = programExerciseResult.rows ?? [];
    if (rows.length === 0) {
      return { decisions: [], updated: 0 };
    }

    const exerciseIds = [...new Set(rows.map((row) => row.exercise_id).filter(Boolean))];
    const historyResult = await db.query(
      `
      SELECT
        sel.id AS log_id,
        pe.exercise_id,
        pe.purpose,
        sel.weight_kg,
        sel.reps_completed,
        sel.rir_actual,
        COALESCE(pd.scheduled_date::text, sel.created_at::date::text) AS exposure_date
      FROM segment_exercise_log sel
      JOIN program_exercise pe
        ON pe.id = sel.program_exercise_id
      JOIN program_day pd
        ON pd.id = sel.program_day_id
      WHERE sel.user_id = $1
        AND sel.is_draft = FALSE
        AND pd.is_completed = TRUE
        AND pe.exercise_id = ANY($2::text[])
      ORDER BY exposure_date DESC, sel.created_at DESC
      `,
      [userId, exerciseIds],
    );

    const historyByExercisePurpose = new Map();
    for (const historyRow of historyResult.rows ?? []) {
      const key = `${historyRow.exercise_id}::${historyRow.purpose ?? ""}`;
      if (!historyByExercisePurpose.has(key)) historyByExercisePurpose.set(key, []);
      historyByExercisePurpose.get(key).push(historyRow);
    }

    const decisionByKey = new Map();
    for (const row of rows) {
      const key = `${row.exercise_id}::${row.purpose}`;
      if (decisionByKey.has(key)) continue;
      const profileName = resolveProfileName(config, programType, row.purpose);
      const profile = config.lever_profiles?.[profileName] ?? {};
      const decision = buildDecision({
        row,
        programType,
        profileName,
        profile,
        rankOverride,
        history: historyByExercisePurpose.get(key) ?? [],
        config,
      });
      if (decision) {
        decisionByKey.set(key, {
          ...decision,
          target_program_exercise_id: row.program_exercise_id,
          target_program_day_id: row.program_day_id,
        });
      }
    }

    const decisions = [...decisionByKey.values()];
    if (decisions.length === 0) {
      return { decisions: [], updated: 0 };
    }

    await db.query(
      `
      UPDATE program_exercise
      SET
        progression_outcome = NULL,
        progression_primary_lever = NULL,
        progression_confidence = NULL,
        progression_source = NULL,
        progression_reasoning_json = '[]'::jsonb,
        recommended_load_kg = NULL,
        recommended_reps_target = NULL,
        recommended_sets = NULL,
        recommended_rest_seconds = NULL
      WHERE program_id = $1
      `,
      [programId],
    );

    for (const decision of decisions) {
      await db.query(
        `
        INSERT INTO exercise_progression_state (
          user_id,
          program_type,
          exercise_id,
          progression_group_key,
          purpose,
          current_load_kg_override,
          current_rep_target_override,
          current_set_override,
          current_rest_sec_override,
          last_outcome,
          last_primary_lever,
          progress_streak,
          underperformance_streak,
          confidence,
          last_decided_at,
          last_source_exposure_id,
          last_decision_context_json,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          CASE WHEN $10 IN ('increase_load','increase_reps') THEN 1 ELSE 0 END,
          CASE WHEN $10 = 'deload_local' THEN 1 ELSE 0 END,
          $12,now(),$13,$14::jsonb,now()
        )
        ON CONFLICT (user_id, program_type, progression_group_key, purpose)
        DO UPDATE SET
          current_load_kg_override = EXCLUDED.current_load_kg_override,
          current_rep_target_override = EXCLUDED.current_rep_target_override,
          current_set_override = EXCLUDED.current_set_override,
          current_rest_sec_override = EXCLUDED.current_rest_sec_override,
          last_outcome = EXCLUDED.last_outcome,
          last_primary_lever = EXCLUDED.last_primary_lever,
          progress_streak = CASE
            WHEN EXCLUDED.last_outcome IN ('increase_load','increase_reps')
              THEN COALESCE(exercise_progression_state.progress_streak, 0) + 1
            ELSE 0
          END,
          underperformance_streak = CASE
            WHEN EXCLUDED.last_outcome = 'deload_local'
              THEN COALESCE(exercise_progression_state.underperformance_streak, 0) + 1
            ELSE 0
          END,
          confidence = EXCLUDED.confidence,
          last_decided_at = EXCLUDED.last_decided_at,
          last_source_exposure_id = EXCLUDED.last_source_exposure_id,
          last_decision_context_json = EXCLUDED.last_decision_context_json,
          updated_at = now()
        `,
        [
          userId,
          programType,
          decision.exercise_id,
          decision.progression_group_key,
          decision.purpose,
          decision.recommended_load_kg,
          decision.recommended_reps_target,
          decision.recommended_sets,
          decision.recommended_rest_seconds,
          decision.outcome,
          decision.primary_lever,
          decision.confidence,
          decision.source_log_id,
          JSON.stringify({
            reasons: decision.reasons,
            evidence: decision.evidence,
            source: decision.source,
          }),
        ],
      );
    }

    for (const decision of decisions) {
      await db.query(
        `
        UPDATE program_exercise
        SET
          progression_outcome = $2,
          progression_primary_lever = $3,
          progression_confidence = $4,
          progression_source = $5,
          progression_reasoning_json = $6::jsonb,
          recommended_load_kg = $7,
          recommended_reps_target = $8,
          recommended_sets = $9,
          recommended_rest_seconds = $10
        WHERE id = $1
        `,
        [
          decision.target_program_exercise_id,
          decision.outcome,
          decision.primary_lever,
          decision.confidence,
          decision.source,
          JSON.stringify(decision.reasons),
          decision.recommended_load_kg,
          decision.recommended_reps_target,
          decision.recommended_sets,
          decision.recommended_rest_seconds,
        ],
      );
      await db.query(
        `
        INSERT INTO exercise_progression_decision (
          user_id,
          program_id,
          program_day_id,
          program_exercise_id,
          source_log_id,
          exercise_id,
          progression_group_key,
          purpose,
          decision_outcome,
          primary_lever,
          confidence,
          recommended_load_delta_kg,
          recommended_rep_delta,
          recommended_set_delta,
          recommended_rest_delta_sec,
          recommended_load_kg,
          recommended_reps_target,
          recommended_sets,
          recommended_rest_seconds,
          evidence_summary_json,
          decision_context_json
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb
        )
        `,
        [
          userId,
          programId,
          decision.target_program_day_id,
          decision.target_program_exercise_id,
          decision.source_log_id,
          decision.exercise_id,
          decision.progression_group_key,
          decision.purpose,
          decision.outcome,
          decision.primary_lever,
          decision.confidence,
          decision.recommended_load_kg != null && decision.evidence.latest_weight_kg != null
            ? Number(decision.recommended_load_kg) - Number(decision.evidence.latest_weight_kg)
            : null,
          decision.recommended_reps_target != null
            ? decision.recommended_reps_target - (toInt(decision.evidence.target_high, 0) ?? 0)
            : null,
          null,
          null,
          decision.recommended_load_kg,
          decision.recommended_reps_target,
          decision.recommended_sets,
          decision.recommended_rest_seconds,
          JSON.stringify(decision.evidence),
          JSON.stringify({ reasons: decision.reasons, source: decision.source }),
        ],
      );
    }

    return { decisions, updated: decisions.length };
  }

  return {
    applyProgressionRecommendations,
    _test: {
      parseRepRange,
      parseTargetRir,
      resolveLoadIncrement,
      buildDecision,
      mergeProgressionConfig,
      makeDefaultProgressionConfig,
    },
  };
}

export { buildDecision, loadProgressionConfig, rankKey, resolveProfileName };
