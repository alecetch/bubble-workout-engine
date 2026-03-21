import test from "node:test";
import assert from "node:assert/strict";
import { resolveStrategy, fillSlot } from "../selectorStrategies.js";
import { buildCatalogJsonFromBubble, buildIndex } from "../exerciseSelector.js";

function makeExercise({
  id,
  name = "Test Ex",
  mp = "squat",
  sw = "sw_group",
  sw2 = "sw2_group",
  pref = [],
  mc = "compound",
  loadable = false,
  regions = [],
  strengthEquivalent = false,
} = {}) {
  return {
    exercise_id: id,
    name,
    movement_pattern_primary: mp,
    swap_group_id_1: sw,
    swap_group_id_2: sw2,
    preferred_in_json: pref,
    movement_class: mc,
    is_loadable: loadable,
    strength_equivalent: strengthEquivalent,
    equipment_json: [],
    density_rating: 1,
    complexity_rank: 1,
    target_regions_json: regions,
    warmup_hooks: [],
  };
}

function makeSelectorPool(exercises) {
  const cat = JSON.parse(buildCatalogJsonFromBubble(exercises));
  const byId = buildIndex(cat);
  return {
    byId,
    allowedSet: new Set(exercises.map((ex) => ex.exercise_id)),
  };
}

function makeStats() {
  return {
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
  };
}

function makeState(overrides = {}) {
  return {
    compiledConfig: { programType: "strength" },
    rankValue: 0,
    usedIdsWeek: new Set(),
    usedSw2Today: new Set(),
    usedRegionsToday: new Set(),
    stats: makeStats(),
    conditioning: null,
    ...overrides,
  };
}

function makeSlotDef(overrides = {}) {
  return {
    slot: "A:squat",
    mp: "squat",
    sw: "sq_group",
    sw2: "sq_comp",
    swAny: null,
    sw2Any: null,
    requirePref: null,
    pref_mode: "soft",
    pref_bonus: 4,
    preferLoadable: false,
    strength_equivalent_bonus: false,
    selector_strategy: "best_match_by_movement",
    ...overrides,
  };
}

test("resolveStrategy throws for unknown strategy name", () => {
  assert.throws(() => resolveStrategy("nonexistent_strategy"), /Unknown selector strategy/);
});

test("resolveStrategy returns a function for best_match_by_movement", () => {
  const strategy = resolveStrategy("best_match_by_movement");
  assert.equal(typeof strategy, "function");
});

test("fillSlot delegates to best_match_by_movement and returns matching exercise", () => {
  const ex = makeExercise({ id: "ex1", mp: "squat", sw: "sq_group", sw2: "sq_comp" });
  const pool = makeSelectorPool([ex]);
  const result = fillSlot(makeSlotDef(), pool, makeState());
  assert.equal(result.id, "ex1");
});

test("fillSlot with unknown selector_strategy throws", () => {
  const ex = makeExercise({ id: "ex1", mp: "squat", sw: "sq_group", sw2: "sq_comp" });
  const pool = makeSelectorPool([ex]);
  assert.throws(
    () => fillSlot(makeSlotDef({ selector_strategy: "unknown_strategy" }), pool, makeState()),
    /Unknown selector strategy/,
  );
});

test("fillSlot returns null when allowedSet is empty", () => {
  const emptyPool = { byId: {}, allowedSet: new Set() };
  const result = fillSlot(makeSlotDef(), emptyPool, makeState());
  assert.equal(result, null);
});

test("preferCompound bias applied for A-block slots", () => {
  const exCompound = makeExercise({ id: "a", sw2: "sq_comp", mc: "compound" });
  const exIsolation = makeExercise({ id: "b", sw2: "sq_comp", mc: "isolation" });
  const pool = makeSelectorPool([exCompound, exIsolation]);
  const result = fillSlot(makeSlotDef({ slot: "A:squat" }), pool, makeState());
  assert.equal(result.id, "a");
});

test("preferIsolation bias applied for C-block slots", () => {
  const exCompound = makeExercise({ id: "a", sw2: "sw2_group", mc: "compound" });
  const exIsolation = makeExercise({ id: "b", sw2: "sw2_group", mc: "isolation" });
  const pool = makeSelectorPool([exCompound, exIsolation]);
  const result = fillSlot(
    makeSlotDef({ slot: "C:arms", sw2: "sw2_group", sw: "sw_group", mp: "squat" }),
    pool,
    makeState(),
  );
  assert.equal(result.id, "b");
});
