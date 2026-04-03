import {
  buildCatalogJsonFromBubble,
  buildIndex,
  canonicalName,
  dayHasRealExercise,
  isConditioning,
  pickSeedExerciseForSlot,
} from "../exerciseSelector.js";
import { fillSlot } from "../selectorStrategies.js";
import {
  createVariabilityState,
  getBlockStickyMeta,
  getBlockStickyExerciseId,
  getMedAvoidCanonicalNames,
  getProgramStickyMeta,
  getProgramStickyExerciseId,
  recordBlockStickyChoice,
  recordProgramStickyChoice,
} from "../variabilityState.js";
import {
  buildSimulationAttemptChain,
  classifySimulationResolution,
  matchesSimulationFilters,
  normalizeSimulationSlotFields,
} from "../orderedSimulation.js";

function toStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function clampInt(n, lo, hi, fallback) {
  const v = parseInt(n, 10);
  if (!isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

function safeJsonParse(s, fallback) {
  try {
    if (typeof s === "object" && s !== null) return s;
    return JSON.parse(s);
  } catch (e) {
    return fallback;
  }
}

function normalizeArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    const parsed = safeJsonParse(s, null);
    if (Array.isArray(parsed)) return parsed;
    if (s.indexOf(",") >= 0) return s.split(",").map((x) => x.trim()).filter(Boolean);
    return [s];
  }
  return [];
}

function defaultDayTemplates() {
  return [
    ["A:squat", "B:lunge", "C:quad", "C:calves", "D:core", "C:hinge_accessory"],
    [
      "A:push_horizontal",
      "B:pull_horizontal",
      "B:secondary_press",
      "C:arms",
      "C:rear_delt",
      "C:arms2",
    ],
    ["A:hinge", "B:secondary_lower", "C:hamstring_iso", "C:glute", "D:core", "C:calves"],
  ];
}

function defaultSetsByDuration() {
  return {
    "40": { A: 3, B: 3, C: 2, D: 2 },
    "50": { A: 4, B: 3, C: 3, D: 2 },
    "60": { A: 5, B: 4, C: 3, D: 3 },
  };
}

function defaultBlockBudget() {
  return { "40": 4, "50": 5, "60": 6 };
}

function pickNearestConfigKey(duration, configObj) {
  const keys = Object.keys(configObj || {})
    .map((k) => Number.parseInt(String(k), 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!keys.length) return null;
  for (const k of keys) {
    if (k >= duration) return String(k);
  }
  return String(keys[keys.length - 1]);
}

function applySlotDefaults(slotDef, slotDefaults) {
  const letter = toStr(slotDef?.slot || "")[0];
  const defaults = slotDefaults?.[letter] ?? {};
  return { ...defaults, ...slotDef };
}

function findFirstRealSlot(blocks) {
  for (const b of blocks || []) {
    if (b?.ex_id && b?.slot) return b.slot;
  }
  return null;
}

function extractSlotsFromTemplate(template) {
  if (Array.isArray(template)) return template;
  if (!template || typeof template !== "object") return [];
  if (Array.isArray(template.ordered_slots)) return template.ordered_slots;
  return [];
}

function normalizeSlotDefinition(rawSlot) {
  if (typeof rawSlot === "string") {
    const [block, key] = rawSlot.split(":");
    return {
      slot: rawSlot,
      block: block || "",
      key: key || "",
      mp: null,
      sw: null,
      swAny: null,
      sw2: null,
      sw2Any: null,
      requirePref: null,
      pref_mode: "soft",
      pref_bonus: 4,
      preferLoadable: false,
      strength_equivalent_bonus: false,
      fill_fallback_slot: null,
      variants: null,
      selector_strategy: "best_match_by_movement",
      slot_family: null,
      variability_policy: null,
      requireHyroxRole: null,
      station_index: null,
      required_equipment_slugs: null,
      station_fallback_chain: null,
    };
  }
  if (rawSlot && typeof rawSlot === "object") {
    const slotName = toStr(rawSlot.slot);
    const [block, key] = slotName.split(":");
    return normalizeSimulationSlotFields({
      ...rawSlot,
      slot: slotName,
      block: rawSlot.block ?? (block || ""),
      key: rawSlot.key ?? (key || ""),
      swAny: rawSlot.swAny != null ? normalizeArr(rawSlot.swAny) : null,
      sw2Any: rawSlot.sw2Any != null ? normalizeArr(rawSlot.sw2Any) : null,
      pref_mode: rawSlot.pref_mode === "strict" ? "strict" : "soft",
      pref_bonus: rawSlot.pref_bonus ?? 4,
      strength_equivalent_bonus: rawSlot.strength_equivalent_bonus === true,
      selector_strategy: rawSlot.selector_strategy || "best_match_by_movement",
      slot_family: rawSlot.slot_family ?? null,
      variability_policy: rawSlot.variability_policy ?? null,
    });
  }
  return {
    slot: "",
    block: "",
    key: "",
    mp: null,
    sw: null,
    swAny: null,
    sw2: null,
    sw2Any: null,
    requirePref: null,
    pref_mode: "soft",
    pref_bonus: 4,
    preferLoadable: false,
    strength_equivalent_bonus: false,
    fill_fallback_slot: null,
    variants: null,
    selector_strategy: "best_match_by_movement",
    slot_family: null,
    variability_policy: null,
    requireHyroxRole: null,
    station_index: null,
    required_equipment_slugs: null,
    station_fallback_chain: null,
  };
}

export function deriveEquipmentProfile(slugs) {
  const set = new Set(normalizeArr(slugs).map((slug) => toStr(slug).trim()).filter(Boolean));
  const fullMarkers = ["barbell", "trap_bar", "hack_squat", "leg_press", "cable"];
  const minimalMarkers = ["dumbbells", "kettlebells", "sandbag", "rings"];
  if (fullMarkers.some((marker) => set.has(marker))) return "full";
  if (minimalMarkers.some((marker) => set.has(marker))) return "minimal";
  return "bodyweight";
}

export function resolveSlotVariant(slotDef, equipmentProfile) {
  const variants = Array.isArray(slotDef?.variants) ? slotDef.variants : [];
  if (!variants.length) return slotDef;
  const match = variants.find((variant) => variant?.when?.equipment_profile === equipmentProfile);
  if (!match) return slotDef;
  const { when, ...variantFields } = match;
  return { ...slotDef, ...variantFields, slot: slotDef.slot };
}

function logBuilderEvent(stats, payload) {
  if (Array.isArray(stats?.notes)) {
    stats.notes.push(payload);
  }
}

function isExcludedExercise(ex, excludeMovementClassesSet) {
  const movementClass = toStr(ex?.mc).toLowerCase();
  if (movementClass && excludeMovementClassesSet.has(movementClass)) return true;
  if (isConditioning(ex)) {
    if (
      excludeMovementClassesSet.has("cardio") ||
      excludeMovementClassesSet.has("conditioning") ||
      excludeMovementClassesSet.has("locomotion")
    ) {
      return true;
    }
  }
  return false;
}

function resolveAllowedExerciseIds(inputs, exercises) {
  const fromInputs = inputs?.allowed_exercise_ids;
  const list = normalizeArr(fromInputs);
  if (list.length > 0) return list;
  return exercises
    .map((r) => r.id || r.exercise_id || r.slug || r.unique_id || r._id)
    .filter(Boolean);
}

function buildSimulationAllowedSet(allowedSet, byId, slotDef, excludeMovementClassesSet) {
  const filtered = new Set();
  for (const id of allowedSet) {
    const ex = byId[id];
    if (!ex) continue;
    if (isExcludedExercise(ex, excludeMovementClassesSet)) continue;
    if (!matchesSimulationFilters(ex, slotDef)) continue;
    filtered.add(id);
  }
  return filtered;
}

function resolveOrderedSimulationSlot({
  slotName,
  dayIndex,
  blockLetter,
  resolvedSlot,
  slotFamily,
  variabilityPolicy,
  byId,
  allowedSet,
  builderState,
  excludeMovementClassesSet,
  stats,
}) {
  const attempts = [];
  const chain = buildSimulationAttemptChain(resolvedSlot);

  for (let idx = 0; idx < chain.length; idx++) {
    const attemptSlot = chain[idx];
    const attemptAllowedSet = buildSimulationAllowedSet(allowedSet, byId, attemptSlot, excludeMovementClassesSet);
    const resolution = classifySimulationResolution(idx);
    const attemptMeta = {
      simulation_resolution: resolution,
      simulation_fallback_index: idx,
      simulation_require_hyrox_role: attemptSlot.requireHyroxRole ?? null,
      simulation_station_index: attemptSlot.station_index ?? null,
      simulation_required_equipment_slugs: Array.isArray(attemptSlot.required_equipment_slugs)
        ? attemptSlot.required_equipment_slugs
        : [],
    };
    attempts.push({
      ...attemptMeta,
      candidate_count: attemptAllowedSet.size,
    });

    if (attemptAllowedSet.size === 0) continue;

    const ex = fillSlot(
      { ...attemptSlot, slot_family: slotFamily, variability_policy: variabilityPolicy },
      { byId, allowedSet: attemptAllowedSet },
      builderState,
    );
    if (!ex || isExcludedExercise(ex, excludeMovementClassesSet)) continue;

    logBuilderEvent(stats, {
      event: "ordered_simulation_resolved",
      slot: slotName,
      day_index: dayIndex,
      block: blockLetter,
      ...attemptMeta,
      exercise_id: ex.id,
      attempts,
    });

    return {
      ex,
      metadata: attemptMeta,
      attempts,
    };
  }

  logBuilderEvent(stats, {
    event: "ordered_simulation_unresolvable",
    slot: slotName,
    day_index: dayIndex,
    block: blockLetter,
    attempts,
  });

  return {
    ex: null,
    metadata: {
      simulation_resolution: "unresolvable",
      simulation_fallback_index: null,
      simulation_require_hyrox_role: resolvedSlot.requireHyroxRole ?? null,
      simulation_station_index: resolvedSlot.station_index ?? null,
      simulation_required_equipment_slugs: Array.isArray(resolvedSlot.required_equipment_slugs)
        ? resolvedSlot.required_equipment_slugs
        : [],
    },
    attempts,
  };
}

export async function buildProgramFromDefinition({ inputs, request, compiledConfig }) {
  const clientProfile = inputs?.clientProfile?.response ?? {};
  const exercises = inputs?.exercises?.response?.results ?? [];
  const equipmentProfile = deriveEquipmentProfile(clientProfile?.equipment_items_slugs ?? []);

  const duration_mins =
    request?.duration_mins ??
    request?.durationMins ??
    clientProfile.duration_mins ??
    clientProfile.minutes_per_session ??
    50;

  const days_per_week =
    request?.days_per_week ??
    request?.daysPerWeek ??
    clientProfile.days_per_week ??
    clientProfile.preferred_days_count ??
    3;

  const duration = clampInt(duration_mins, 40, 60, 50);
  const dperweek = clampInt(days_per_week, 1, 6, 3);
  const rankValue = Number(clientProfile?.fitness_rank);

  const catalog_json = buildCatalogJsonFromBubble(exercises);
  const cat = safeJsonParse(catalog_json, null);
  if (!cat || !Array.isArray(cat.ex)) {
    throw new Error("Invalid catalog_json");
  }

  const byId = buildIndex(cat);
  const allowedIds = resolveAllowedExerciseIds(inputs, exercises);

  const builderCfg = compiledConfig?.builder || {};
  const dayTemplates =
    Array.isArray(builderCfg.dayTemplates) && builderCfg.dayTemplates.length > 0
      ? builderCfg.dayTemplates
      : defaultDayTemplates();
  const setsByDurationCfg = builderCfg.setsByDuration ?? defaultSetsByDuration();
  const blockBudgetCfg = builderCfg.blockBudget ?? defaultBlockBudget();
  const slotDefaults = builderCfg.slotDefaults ?? {};
  const blockVariabilityDefaults = builderCfg.blockVariabilityDefaults ?? {};
  const excludeMovementClasses = Array.isArray(builderCfg.excludeMovementClasses)
    ? builderCfg.excludeMovementClasses
    : ["cardio", "conditioning", "locomotion"];
  const excludeMovementClassesSet = new Set(excludeMovementClasses.map((x) => toStr(x).toLowerCase()));

  const allowedSet = new Set(
    allowedIds.filter((id) => {
      const ex = byId[id];
      return !ex || !isExcludedExercise(ex, excludeMovementClassesSet);
    }),
  );

  const stats = {
    duration_mins: duration,
    block_budget: null,
    allowed_in: allowedIds.length,
    unique_used_week: 0,

    picked_sw2_pref: 0,
    picked_sw_pref: 0,
    picked_mp_pref: 0,
    picked_sw2_relaxed: 0,
    picked_sw_relaxed: 0,
    picked_mp_relaxed: 0,
    picked_allow_dup: 0,
    picked_seed_slot_aware: 0,

    avoided_repeat_sw2: 0,
    avoided_repeat_cn: 0,
    simulation_exact: 0,
    simulation_family: 0,
    simulation_fallback: 0,
    simulation_unresolvable: 0,

    fills_add_sets: 0,
    fill_failed: 0,

    region_penalty_active: true,
    movement_class_bias_active: true,

    source: compiledConfig?.source,
    config_key: compiledConfig?.configKey,
    equipment_profile: equipmentProfile,
    notes: [],
  };

  const days = [];
  const usedIdsWeek = new Set();
  const variabilityState = createVariabilityState();
  const maxDays = Math.min(dperweek, dayTemplates.length);

  for (let day = 1; day <= maxDays; day++) {
    const template = dayTemplates[day - 1];
    const effectiveSetsByDuration =
      template?.sets_by_duration != null ? template.sets_by_duration : setsByDurationCfg;
    const effectiveBlockBudget =
      template?.block_budget != null ? template.block_budget : blockBudgetCfg;

    const setsKey = pickNearestConfigKey(duration, effectiveSetsByDuration) ?? "50";
    const budgetKey = pickNearestConfigKey(duration, effectiveBlockBudget) ?? "50";
    const setsMap = effectiveSetsByDuration[setsKey] ?? defaultSetsByDuration()["50"];
    const budgetRaw =
      typeof effectiveBlockBudget === "number"
        ? effectiveBlockBudget
        : effectiveBlockBudget?.[budgetKey] ?? defaultBlockBudget()["50"];
    const budget = Number.isFinite(Number(budgetRaw)) ? Number(budgetRaw) : 5;
    const slots = extractSlotsFromTemplate(template);
    const isOrderedSimulationDay = template && typeof template === "object" && template.is_ordered_simulation === true;
    const daySelectionMode =
      template && typeof template === "object" && toStr(template.day_selection_mode).trim() === "benchmark_exactness"
        ? "benchmark_exactness"
        : "default";
    const take = isOrderedSimulationDay ? slots.length : Math.min(budget, slots.length);
    const blocks = [];

    const builderState = {
      compiledConfig,
      rankValue: Number.isFinite(Number(rankValue)) ? Number(rankValue) : 0,
      conditioning: {
        lastImpactLevel: 0,
        lastDensityRating: 0,
        lastComplexityRank: 0,
        lastEngineRole: null,
        highImpactCountToday: 0,
        highDensityCountToday: 0,
        highComplexityCountToday: 0,
      },
      usedIdsWeek: daySelectionMode === "benchmark_exactness" ? null : usedIdsWeek,
      usedSw2Today: new Set(),
      usedCanonicalNamesToday: new Set(),
      usedRegionsToday: new Set(),
      stats,
      equipmentProfile,
      variabilityState,
      variabilityAvoidCanonicalNames: null,
      dayIndex: day,
      daySelectionMode,
    };

    if (builderState.conditioning) {
      builderState.conditioning.lastImpactLevel = 0;
      builderState.conditioning.lastDensityRating = 0;
      builderState.conditioning.lastComplexityRank = 0;
      builderState.conditioning.lastEngineRole = null;
      builderState.conditioning.highImpactCountToday = 0;
      builderState.conditioning.highDensityCountToday = 0;
      builderState.conditioning.highComplexityCountToday = 0;
    }

    for (let i = 0; i < take; i++) {
      const normalized = normalizeSlotDefinition(slots[i]);
      const slotDef = applySlotDefaults(normalized, slotDefaults);
      const resolvedSlot = resolveSlotVariant(slotDef, equipmentProfile);
      const slotName = slotDef.slot;
      if (!slotName) continue;

      logBuilderEvent(stats, {
        event: "slot_resolved",
        slot: slotName,
        is_ordered_simulation: isOrderedSimulationDay,
        day_selection_mode: daySelectionMode,
        equipment_profile: equipmentProfile,
        variant_matched: resolvedSlot !== slotDef,
        resolved_sw2: resolvedSlot.sw2 ?? null,
        resolved_swAny: resolvedSlot.swAny ?? null,
        resolved_sw2Any: resolvedSlot.sw2Any ?? null,
        resolved_pref_mode: resolvedSlot.pref_mode ?? "soft",
      });

      const [blockLetter] = slotName.split(":");
      const slotFamily = toStr(resolvedSlot.slot_family).trim() || null;
      const variabilityPolicy =
        toStr(resolvedSlot.variability_policy).trim() ||
        toStr(blockVariabilityDefaults?.[blockLetter]).trim() ||
        "high";

      const catalogIndex = { byId, allowedSet };
      logBuilderEvent(stats, {
        event: "slot_variability",
        slot: slotName,
        day_index: day,
        block: blockLetter,
        day_selection_mode: daySelectionMode,
        slot_family: slotFamily,
        variability_policy: variabilityPolicy,
      });

      let ex = null;
      let simulationMetadata = null;
      let simulationAttempts = null;
      builderState.variabilityAvoidCanonicalNames = null;

      if (variabilityPolicy === "none" && slotFamily) {
        const stickyExerciseId = getProgramStickyExerciseId(variabilityState, slotFamily);
        const stickyExercise = stickyExerciseId ? byId[stickyExerciseId] : null;
        const stickyMeta = getProgramStickyMeta(variabilityState, slotFamily);
        if (stickyExercise && !isExcludedExercise(stickyExercise, excludeMovementClassesSet)) {
          ex = stickyExercise;
          simulationMetadata = stickyMeta;
          logBuilderEvent(stats, {
            event: "slot_variability_reuse",
            slot: slotName,
            day_index: day,
            block: blockLetter,
            slot_family: slotFamily,
            variability_policy: variabilityPolicy,
            reuse: "program_sticky",
            exercise_id: stickyExercise.id,
          });
        }
      }

      if (!ex && variabilityPolicy === "med" && slotFamily) {
        const stickyExerciseId = getBlockStickyExerciseId(variabilityState, day, blockLetter, slotFamily);
        const stickyExercise = stickyExerciseId ? byId[stickyExerciseId] : null;
        const stickyMeta = getBlockStickyMeta(variabilityState, day, blockLetter, slotFamily);
        if (stickyExercise && !isExcludedExercise(stickyExercise, excludeMovementClassesSet)) {
          ex = stickyExercise;
          simulationMetadata = stickyMeta;
          logBuilderEvent(stats, {
            event: "slot_variability_reuse",
            slot: slotName,
            day_index: day,
            block: blockLetter,
            slot_family: slotFamily,
            variability_policy: variabilityPolicy,
            reuse: "block_sticky",
            exercise_id: stickyExercise.id,
          });
        } else {
          const avoidSet = getMedAvoidCanonicalNames(variabilityState, slotFamily);
          builderState.variabilityAvoidCanonicalNames = avoidSet.size ? avoidSet : null;
          logBuilderEvent(stats, {
            event: "slot_variability_avoid",
            slot: slotName,
            day_index: day,
            block: blockLetter,
            slot_family: slotFamily,
            variability_policy: variabilityPolicy,
            avoid_canonical_names: Array.from(avoidSet),
          });
        }
      }

      if (!ex && isOrderedSimulationDay) {
        const simulationResolved = resolveOrderedSimulationSlot({
          slotName,
          dayIndex: day,
          blockLetter,
          resolvedSlot,
          slotFamily,
          variabilityPolicy,
          byId,
          allowedSet,
          builderState,
          excludeMovementClassesSet,
          stats,
        });
        ex = simulationResolved.ex;
        simulationMetadata = simulationResolved.metadata;
        simulationAttempts = simulationResolved.attempts;
      }

      if (!ex && !isOrderedSimulationDay) {
        ex = fillSlot(
          { ...resolvedSlot, slot_family: slotFamily, variability_policy: variabilityPolicy },
          catalogIndex,
          builderState,
        );
      }
      if (ex && isExcludedExercise(ex, excludeMovementClassesSet)) {
        ex = null;
      }

      if (!ex && !dayHasRealExercise(blocks)) {
        const seeded = pickSeedExerciseForSlot(allowedSet, byId, resolvedSlot);
        if (seeded && !isExcludedExercise(seeded, excludeMovementClassesSet)) {
          stats.picked_seed_slot_aware++;
          ex = seeded;
        }
      }

      if (ex) {
        const cn = canonicalName(ex.n);
        usedIdsWeek.add(ex.id);
        if (ex.sw2) builderState.usedSw2Today.add(ex.sw2);
        if (cn) builderState.usedCanonicalNamesToday.add(cn);
        for (const r of ex.tr || []) {
          const rr = toStr(r).trim();
          if (rr) builderState.usedRegionsToday.add(rr);
        }
        if (builderState.conditioning && ex) {
          const c = builderState.conditioning;
          const impact = ex.impact_level ?? 0;
          const density = ex.den ?? 0;
          const complexity = ex.cx ?? 0;
          const HIGH_IMPACT = compiledConfig?.builder?.conditioningThresholds?.high_impact_threshold ?? 2;
          const HIGH_DENSITY = compiledConfig?.builder?.conditioningThresholds?.high_density_threshold ?? 2;
          const HIGH_COMPLEXITY =
            compiledConfig?.builder?.conditioningThresholds?.high_complexity_threshold ?? 2;

          c.lastImpactLevel = impact;
          c.lastDensityRating = density;
          c.lastComplexityRank = complexity;
          c.lastEngineRole = ex.engine_role ?? null;

          if (impact >= HIGH_IMPACT) c.highImpactCountToday++;
          if (density >= HIGH_DENSITY) c.highDensityCountToday++;
          if (complexity >= HIGH_COMPLEXITY) c.highComplexityCountToday++;
        }

        if (slotFamily && variabilityPolicy === "none") {
          recordProgramStickyChoice(variabilityState, slotFamily, ex.id, simulationMetadata);
        }
        if (slotFamily && variabilityPolicy === "med") {
          recordBlockStickyChoice(variabilityState, day, blockLetter, slotFamily, ex.id, cn, simulationMetadata);
        }

        if (simulationMetadata?.simulation_resolution === "exact") stats.simulation_exact += 1;
        else if (simulationMetadata?.simulation_resolution === "family") stats.simulation_family += 1;
        else if (simulationMetadata?.simulation_resolution === "fallback") stats.simulation_fallback += 1;

        const simulationBlockFields = simulationMetadata
          ? {
              simulation_resolution: simulationMetadata.simulation_resolution,
              simulation_fallback_index: simulationMetadata.simulation_fallback_index,
              simulation_require_hyrox_role: simulationMetadata.simulation_require_hyrox_role,
              simulation_station_index: simulationMetadata.simulation_station_index,
              simulation_required_equipment_slugs: simulationMetadata.simulation_required_equipment_slugs,
              simulation_attempts: simulationAttempts,
            }
          : {};

        if (simulationMetadata && (simulationMetadata.simulation_resolution || simulationMetadata.simulation_resolution === "exact")) {
          logBuilderEvent(stats, {
            event: "ordered_simulation_block",
            slot: slotName,
            day_index: day,
            block: blockLetter,
            exercise_id: ex.id,
            ...simulationBlockFields,
          });
        }

        const sets = setsMap[blockLetter] || 2;
        blocks.push({
          block: blockLetter,
          slot: slotName,
          ex_id: ex.id,
          ex_name: ex.n,
          sets,
          ex_sw: ex.sw || "",
          ex_sw2: ex.sw2 || "",
          is_buy_in: resolvedSlot.is_buy_in === true,
          ...simulationBlockFields,
        });
        continue;
      }

      if (isOrderedSimulationDay) {
        stats.simulation_unresolvable += 1;
        blocks.push({
          block: blockLetter,
          slot: slotName,
          fill: "simulation_unresolvable",
          simulation_resolution: "unresolvable",
          simulation_fallback_index: null,
          simulation_require_hyrox_role: simulationMetadata?.simulation_require_hyrox_role ?? null,
          simulation_station_index: simulationMetadata?.simulation_station_index ?? null,
          simulation_required_equipment_slugs: simulationMetadata?.simulation_required_equipment_slugs ?? [],
          simulation_attempts: simulationAttempts,
        });
        continue;
      }

      const targetSlot = resolvedSlot.fill_fallback_slot || findFirstRealSlot(blocks) || "A:squat";
      const addSets = 1;

      blocks.push({
        block: blockLetter,
        slot: slotName,
        fill: "add_sets",
        target_slot: targetSlot,
        add_sets: addSets,
      });

      stats.fills_add_sets += 1;
    }

    for (let bi = 0; bi < blocks.length; bi++) {
      if (blocks[bi] && blocks[bi].ex_id) {
        delete blocks[bi].ex_sw;
        delete blocks[bi].ex_sw2;
      }
    }

    days.push({
      day_index: day,
      day_type: isOrderedSimulationDay ? "simulation" : compiledConfig.programType,
      day_focus: toStr(template.focus) || null,
      duration_mins: duration,
      is_ordered_simulation: isOrderedSimulationDay,
      day_selection_mode: daySelectionMode,
      blocks,
    });
  }

  stats.unique_used_week = usedIdsWeek.size;

  return {
    program: {
      program_type: compiledConfig.programType,
      schema: `program_${compiledConfig.programType}_v1`,
      duration_mins: duration,
      days_per_week: dperweek,
      days,
    },
    debug: stats,
  };
}
