import {
  buildCatalogJsonFromBubble,
  buildIndex,
  dayHasRealExercise,
  isConditioning,
  pickSeedExerciseForSlot,
} from "../exerciseSelector.js";
import { fillSlot } from "../selectorStrategies.js";

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
      requirePref: null,
      preferLoadable: false,
      fill_fallback_slot: null,
      selector_strategy: "best_match_by_movement",
    };
  }
  if (rawSlot && typeof rawSlot === "object") {
    const slotName = toStr(rawSlot.slot);
    const [block, key] = slotName.split(":");
    return {
      ...rawSlot,
      slot: slotName,
      block: rawSlot.block ?? (block || ""),
      key: rawSlot.key ?? (key || ""),
      swAny: rawSlot.swAny != null ? normalizeArr(rawSlot.swAny) : null,
      selector_strategy: rawSlot.selector_strategy || "best_match_by_movement",
    };
  }
  return {
    slot: "",
    block: "",
    key: "",
    mp: null,
    sw: null,
    swAny: null,
    sw2: null,
    requirePref: null,
    preferLoadable: false,
    fill_fallback_slot: null,
    selector_strategy: "best_match_by_movement",
  };
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

export async function buildProgramFromDefinition({ inputs, request, compiledConfig }) {
  const clientProfile = inputs?.clientProfile?.response ?? {};
  const exercises = inputs?.exercises?.response?.results ?? [];

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

  const setsKey = pickNearestConfigKey(duration, setsByDurationCfg) ?? "50";
  const budgetKey = pickNearestConfigKey(duration, blockBudgetCfg) ?? "50";
  const setsMap = setsByDurationCfg[setsKey] ?? defaultSetsByDuration()["50"];
  const budgetRaw =
    typeof blockBudgetCfg === "number"
      ? blockBudgetCfg
      : blockBudgetCfg?.[budgetKey] ?? defaultBlockBudget()["50"];
  const budget = Number.isFinite(Number(budgetRaw)) ? Number(budgetRaw) : 5;

  const stats = {
    duration_mins: duration,
    block_budget: budget,
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

    fills_add_sets: 0,
    fill_failed: 0,

    region_penalty_active: true,
    movement_class_bias_active: true,

    source: compiledConfig?.source,
    config_key: compiledConfig?.configKey,
    notes: [],
  };

  const days = [];
  const usedIdsWeek = new Set();
  const maxDays = Math.min(dperweek, dayTemplates.length);

  for (let day = 1; day <= maxDays; day++) {
    const template = dayTemplates[day - 1];
    const slots = extractSlotsFromTemplate(template);
    const take = Math.min(budget, slots.length);
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
      usedIdsWeek,
      usedSw2Today: new Set(),
      usedRegionsToday: new Set(),
      stats,
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
      const slotName = slotDef.slot;
      if (!slotName) continue;

      const [blockLetter] = slotName.split(":");

      const catalogIndex = { byId, allowedSet };
      let ex = fillSlot(slotDef, catalogIndex, builderState);
      if (ex && isExcludedExercise(ex, excludeMovementClassesSet)) {
        ex = null;
      }

      if (!ex && !dayHasRealExercise(blocks)) {
        const seeded = pickSeedExerciseForSlot(allowedSet, byId, slotDef);
        if (seeded && !isExcludedExercise(seeded, excludeMovementClassesSet)) {
          stats.picked_seed_slot_aware++;
          ex = seeded;
        }
      }

      if (ex) {
        usedIdsWeek.add(ex.id);
        if (ex.sw2) builderState.usedSw2Today.add(ex.sw2);
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

        const sets = setsMap[blockLetter] || 2;
        blocks.push({
          block: blockLetter,
          slot: slotName,
          ex_id: ex.id,
          ex_name: ex.n,
          sets,
          ex_sw: ex.sw || "",
          ex_sw2: ex.sw2 || "",
          is_buy_in: slotDef.is_buy_in === true,
        });
        continue;
      }

      const targetSlot = slotDef.fill_fallback_slot || findFirstRealSlot(blocks) || "A:squat";
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
      day_type: compiledConfig.programType,
      day_focus: toStr(template.focus) || null,
      duration_mins: duration,
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
