function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function midpoint(value, fallback = 10) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const nums = raw.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length >= 2) {
    return (nums[0] + nums[1]) / 2;
  }
  if (nums.length === 1) {
    return nums[0];
  }
  return fallback;
}

function parseTargetRir(value, fallback = 2) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const range = raw.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*RIR/i);
  if (range) {
    return (Number(range[1]) + Number(range[2])) / 2;
  }
  const single = raw.match(/(\d+(?:\.\d+)?)\s*RIR/i);
  if (single) {
    return Number(single[1]);
  }
  return fallback;
}

function parseTempoFactor(tempo) {
  const parts = String(tempo ?? "")
    .split("-")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((part) => Number.isFinite(part));

  if (parts.length === 0) return 1;

  const eccentric = parts[0] ?? 0;
  const pauseBottom = parts[1] ?? 0;
  const pauseTop = parts[3] ?? 0;

  let factor = 1;
  if (eccentric >= 3) factor *= 0.94;
  if (pauseBottom >= 2) factor *= 0.97;
  if (pauseTop >= 2) factor *= 0.98;
  return factor;
}

function computeProgramFactor(programType) {
  const type = String(programType ?? "").trim().toLowerCase();
  if (type === "conditioning") return 0.88;
  if (type === "hyrox") return 0.9;
  if (type === "hypertrophy") return 0.94;
  return 1;
}

function floorToIncrement(value, increment) {
  const safeIncrement = increment > 0 ? increment : 2.5;
  return Math.floor(value / safeIncrement) * safeIncrement;
}

function inferIncrement(meta, exerciseId) {
  const explicit = toNumber(meta?.rounding_increment_kg);
  if (explicit && explicit > 0) return explicit;
  if (meta?.unit === "kg_per_hand") return 2;
  if (String(exerciseId ?? "").includes("db_")) return 2;
  return 2.5;
}

function confidenceBand(score) {
  if (score >= 80) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function buildSet1Rule(confidence) {
  if (confidence === "high") {
    return "Start here for set 1 and adjust only if the prescribed RIR is clearly off.";
  }
  if (confidence === "medium") {
    return "Use this for set 1, then adjust 2.5-5% based on speed and RIR.";
  }
  return "Treat this as a conservative first set and adjust 5-10% immediately if needed.";
}

function normalizeAnchorLoad({ anchorLoad, anchorReps, targetReps, anchorRir, targetRir }) {
  const repDelta = targetReps - anchorReps;
  const rirDelta = targetRir - anchorRir;
  const repFactor = 1 - (0.02 * repDelta);
  const rirFactor = 1 - (0.02 * rirDelta);
  return anchorLoad * repFactor * rirFactor;
}

function parseMetadata(row) {
  const meta = row?.load_estimation_metadata && typeof row.load_estimation_metadata === "object"
    ? row.load_estimation_metadata
    : {};
  return {
    estimation_family: String(meta.estimation_family ?? "").trim().toLowerCase(),
    family_conversion_factor: toNumber(meta.family_conversion_factor, 1),
    is_anchor_eligible: Boolean(meta.is_anchor_eligible),
    anchor_priority: toNumber(meta.anchor_priority, 999),
    is_unilateral: Boolean(meta.is_unilateral),
    unilateral_factor: toNumber(meta.unilateral_factor, 0.5),
    rounding_increment_kg: toNumber(meta.rounding_increment_kg, null),
    not_estimatable: Boolean(meta.not_estimatable),
    unit: String(meta.unit ?? "").trim() || null,
    bodyweight_anchor: Boolean(meta.bodyweight_anchor),
  };
}

/**
 * Pure computation: estimate a starting load for one exercise given in-memory anchor lifts.
 * Mirrors the math inside annotateExercisesWithGuidelineLoads without any DB calls.
 */
export function computeGuidelineLoadFromAnchors({
  exerciseItem,
  exerciseRow,
  anchorsByFamily,
  familyFactors,
  programType,
}) {
  if (!exerciseRow?.is_loadable) return null;
  const meta = parseMetadata(exerciseRow);
  if (meta.not_estimatable || !meta.estimation_family) return null;

  let chosenAnchor = anchorsByFamily.get(meta.estimation_family) ?? null;
  let source = chosenAnchor ? "same_family" : null;
  let crossFamilyFactor = 1;

  if (!chosenAnchor) {
    for (const [anchorFamily, anchorData] of anchorsByFamily) {
      const key = `${anchorFamily}->${meta.estimation_family}`;
      if (familyFactors.has(key)) {
        chosenAnchor = anchorData;
        crossFamilyFactor = familyFactors.get(key) ?? 1;
        source = "cross_family";
        break;
      }
    }
  }

  if (!chosenAnchor || chosenAnchor.loadKg == null) return null;

  const targetReps = midpoint(exerciseItem.reps_prescribed, 10);
  const intensityStr = exerciseItem.intensity_prescription
    ?? (exerciseItem.rir_target != null ? `${exerciseItem.rir_target} RIR` : "");
  const targetRir = parseTargetRir(intensityStr, 2);
  const anchorReps = toNumber(chosenAnchor.reps, 8);
  const anchorRir = toNumber(chosenAnchor.rir, 2);

  const normalized = normalizeAnchorLoad({
    anchorLoad: toNumber(chosenAnchor.loadKg, 0),
    anchorReps,
    targetReps,
    anchorRir,
    targetRir,
  });

  const conversionFactor = (meta.family_conversion_factor || 1) * crossFamilyFactor;
  const unilateralFactor = meta.is_unilateral ? (meta.unilateral_factor || 0.5) : 1;
  const tempoFactor = parseTempoFactor(exerciseItem.tempo_prescribed);
  const programFactor = computeProgramFactor(programType);
  const rawValue = normalized * conversionFactor * unilateralFactor * tempoFactor * programFactor;
  const increment = inferIncrement(meta, exerciseRow.exercise_id);
  const roundedValue = floorToIncrement(rawValue, increment);

  if (!(roundedValue > 0)) return null;

  let confidenceScore = source === "same_family" ? 35 : 10;
  confidenceScore += chosenAnchor.rir != null ? 15 : 5;
  const confidence = confidenceBand(confidenceScore);

  const reasoning = [];
  if (source === "same_family") {
    reasoning.push(`Estimated from your ${meta.estimation_family.replace(/_/g, " ")} anchor lift.`);
  } else {
    reasoning.push("Estimated from a related anchor family using conservative cross-family conversion.");
  }
  if (tempoFactor < 1) {
    reasoning.push("Tempo prescription reduced the suggested load slightly.");
  }

  const unit = meta.unit || (meta.is_unilateral ? "kg_per_hand" : "kg");

  return {
    guideline_load_kg: roundedValue,
    unit,
    confidence,
    source,
    reasoning,
    set_1_rule: buildSet1Rule(confidence),
  };
}

export function makeGuidelineLoadService(db) {
  async function annotateExercisesWithGuidelineLoads({
    exercises = [],
    clientProfileId,
    userId,
    programType,
  }) {
    const baseExercises = exercises.map((exercise) => ({ ...exercise, guideline_load: null }));
    if (!clientProfileId || baseExercises.length === 0) {
      return baseExercises;
    }

    const profileResult = await db.query(
      `
      SELECT fitness_rank, anchor_lifts_skipped, anchor_lifts_collected_at
      FROM client_profile
      WHERE id = $1
      LIMIT 1
      `,
      [clientProfileId],
    );
    const profile = profileResult.rows[0];
    if (!profile || Number(profile.fitness_rank ?? 0) < 1 || profile.anchor_lifts_skipped) {
      return baseExercises;
    }

    const exerciseIds = [...new Set(baseExercises.map((exercise) => exercise.exercise_id).filter(Boolean))];
    if (exerciseIds.length === 0) {
      return baseExercises;
    }

    const [targetResult, anchorResult, familyConfigResult] = await Promise.all([
      db.query(
        `
        SELECT
          exercise_id,
          equipment_items_slugs,
          load_estimation_metadata
        FROM exercise_catalogue
        WHERE exercise_id = ANY($1::text[])
        `,
        [exerciseIds],
      ),
      db.query(
        `
        SELECT
          cal.*,
          ec.load_estimation_metadata
        FROM client_anchor_lift cal
        LEFT JOIN exercise_catalogue ec
          ON ec.exercise_id = cal.exercise_id
        WHERE cal.client_profile_id = $1
          AND cal.skipped = false
        ORDER BY cal.updated_at DESC
        `,
        [clientProfileId],
      ),
      db.query(
        `
        SELECT source_family, target_family, cross_family_factor
        FROM exercise_load_estimation_family_config
        `,
      ),
    ]);

    const targets = new Map(
      targetResult.rows.map((row) => [
        row.exercise_id,
        {
          ...parseMetadata(row),
          exercise_id: row.exercise_id,
          equipment_items_slugs: Array.isArray(row.equipment_items_slugs) ? row.equipment_items_slugs : [],
        },
      ]),
    );

    const anchors = anchorResult.rows.map((row) => ({
      ...row,
      meta: parseMetadata(row),
    }));

    if (anchors.length === 0) {
      return baseExercises;
    }

    const familyFactors = new Map(
      familyConfigResult.rows.map((row) => [
        `${row.source_family}->${row.target_family}`,
        toNumber(row.cross_family_factor, 1),
      ]),
    );

    let recentHistoryExerciseIds = new Set();
    if (userId) {
      const historyResult = await db.query(
        `
        SELECT DISTINCT pe.exercise_id
        FROM segment_exercise_log sel
        JOIN program_exercise pe
          ON pe.id = sel.program_exercise_id
        WHERE sel.user_id = $1
          AND pe.exercise_id = ANY($2::text[])
          AND sel.created_at >= now() - interval '90 days'
          AND sel.weight_kg IS NOT NULL
        `,
        [userId, exerciseIds],
      );
      recentHistoryExerciseIds = new Set(historyResult.rows.map((row) => row.exercise_id));
    }

    return baseExercises.map((exercise) => {
      const target = targets.get(exercise.exercise_id);
      if (!target || target.not_estimatable || !target.estimation_family || !exercise.is_loadable) {
        return exercise;
      }
      if (recentHistoryExerciseIds.has(exercise.exercise_id)) {
        return exercise;
      }

      const exactAnchor = anchors.find((anchor) => anchor.exercise_id === exercise.exercise_id);
      const sameFamilyAnchor = anchors.find(
        (anchor) => anchor.meta.estimation_family === target.estimation_family,
      );

      let chosenAnchor = exactAnchor || sameFamilyAnchor || null;
      let source = exactAnchor ? "same_exercise" : sameFamilyAnchor ? "same_family" : null;
      let crossFamilyFactor = 1;

      if (!chosenAnchor) {
        for (const anchor of anchors) {
          const key = `${anchor.meta.estimation_family}->${target.estimation_family}`;
          if (familyFactors.has(key)) {
            chosenAnchor = anchor;
            crossFamilyFactor = familyFactors.get(key) ?? 1;
            source = "cross_family";
            break;
          }
        }
      }

      if (!chosenAnchor || chosenAnchor.load_kg == null) {
        return exercise;
      }

      const targetReps = midpoint(exercise.reps_prescribed, 10);
      const targetRir = parseTargetRir(exercise.intensity_prescription, 2);
      const anchorReps = toNumber(chosenAnchor.reps, 8);
      const anchorRir = toNumber(chosenAnchor.rir, 2);
      const normalized = normalizeAnchorLoad({
        anchorLoad: toNumber(chosenAnchor.load_kg, 0),
        anchorReps,
        targetReps,
        anchorRir,
        targetRir,
      });

      const conversionFactor = source === "same_exercise"
        ? 1
        : (target.family_conversion_factor || 1) * crossFamilyFactor;
      const unilateralFactor = target.is_unilateral ? (target.unilateral_factor || 0.5) : 1;
      const tempoFactor = parseTempoFactor(exercise.tempo);
      const programFactor = computeProgramFactor(programType);
      const rawValue = normalized * conversionFactor * unilateralFactor * tempoFactor * programFactor;
      const increment = inferIncrement(target, exercise.exercise_id);
      const roundedValue = floorToIncrement(rawValue, increment);

      if (!(roundedValue > 0)) {
        return exercise;
      }

      const collectedAt = chosenAnchor.updated_at ?? profile.anchor_lifts_collected_at;
      const ageDays = collectedAt
        ? Math.floor((Date.now() - new Date(collectedAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      let confidenceScore = source === "same_exercise" ? 50 : source === "same_family" ? 35 : 10;
      confidenceScore += ageDays != null && ageDays <= 180 ? 20 : 0;
      confidenceScore += chosenAnchor.rir != null ? 15 : 5;

      const confidence = confidenceBand(confidenceScore);
      const reasoning = [];
      if (source === "same_exercise") {
        reasoning.push("Based on your recent self-reported load for this exact exercise.");
      } else if (source === "same_family") {
        reasoning.push(`Estimated from your ${target.estimation_family.replace(/_/g, " ")} anchor lift.`);
      } else {
        reasoning.push("Estimated from a related anchor family using conservative cross-family conversion.");
      }
      if (ageDays != null && ageDays > 180) {
        reasoning.push("Anchor data is over 6 months old, so this is intentionally conservative.");
      }
      if (parseTempoFactor(exercise.tempo) < 1) {
        reasoning.push("Tempo prescription reduced the suggested load slightly.");
      }

      const unit = target.unit || (target.is_unilateral ? "kg_per_hand" : "kg");

      return {
        ...exercise,
        guideline_load: {
          value: roundedValue,
          unit,
          confidence,
          confidence_score: confidenceScore,
          source,
          reasoning,
          set_1_rule: buildSet1Rule(confidence),
        },
      };
    });
  }

  return {
    annotateExercisesWithGuidelineLoads,
    _test: {
      midpoint,
      parseTargetRir,
      parseTempoFactor,
      computeProgramFactor,
      normalizeAnchorLoad,
      floorToIncrement,
    },
  };
}
