# Codex Spec: exerciseSelector + selectorStrategies Unit Tests

**Why:** `equipmentAwareSelection.test.js` tests equipment filtering paths through
`buildProgramFromDefinition`. The underlying `pickBest`, `pickWithFallback`, and
`pickSeedExerciseForSlot` functions in `exerciseSelector.js` — which contain `requirePref`
gating, sw2/sw/mp scoring, region penalties, and the full fallback chain — have no direct
unit tests. At least one production bug has been traced to this logic (the `requirePref`
hard-gate that was incorrectly applied to C/D slot defaults). Direct tests make regressions
obvious and eliminate reliance on integration tests to surface selector bugs.

---

## Context for Codex

Read before starting:
- `api/engine/exerciseSelector.js` — all exported functions
- `api/engine/selectorStrategies.js` — `fillSlot`, `resolveStrategy`
- `api/engine/__tests__/equipmentAwareSelection.test.js` — `makeExercise` and
  `makeSelectorPool` helpers to reuse (do NOT duplicate; import or copy the same helpers)

All tests are pure — no DB, no pipeline run, no imports from `db.js`.

---

## Shared helpers

Reuse the `makeExercise` and `makeSelectorPool` pattern from `equipmentAwareSelection.test.js`:

```js
function makeExercise({ id, name = "Test Ex", mp = "squat", sw = "sw_group",
                        sw2 = "sw2_group", pref = [], mc = "compound",
                        loadable = false, regions = [], strengthEquivalent = false } = {}) {
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
    picked_sw2_pref: 0, picked_sw_pref: 0, picked_mp_pref: 0,
    picked_sw2_relaxed: 0, picked_sw_relaxed: 0, picked_mp_relaxed: 0,
    picked_allow_dup: 0, picked_seed_slot_aware: 0, avoided_repeat_sw2: 0,
    fills_add_sets: 0, fill_failed: 0,
  };
}
```

---

## Prompt 1 — `buildCatalogJsonFromBubble` + `buildIndex` + pure helpers

Create `api/engine/__tests__/exerciseSelector.test.js`.

Import: `buildCatalogJsonFromBubble`, `buildIndex`, `hasPref`, `isConditioning`,
`isLoadable`, `dayHasRealExercise`, `pickBest`, `pickWithFallback`,
`pickSeedExerciseForSlot` from `../exerciseSelector.js`.

### `buildCatalogJsonFromBubble`

```
"maps all fields from Bubble format to catalog format"
  input = [{
    exercise_id: "ex1",
    name: "Squat",
    movement_pattern_primary: "squat",
    swap_group_id_1: "sq_group",
    swap_group_id_2: "sq_comp",
    preferred_in_json: ["strength_main"],
    movement_class: "compound",
    is_loadable: true,
    strength_equivalent: false,
    equipment_json: ["barbell"],
    density_rating: 2,
    complexity_rank: 1,
    target_regions_json: ["quads"],
    warmup_hooks: ["hips"],
  }]
  result = JSON.parse(buildCatalogJsonFromBubble(input))
  ex = result.ex[0]
  → ex.id === "ex1"
  → ex.n === "Squat"
  → ex.sw === "sq_group"
  → ex.sw2 === "sq_comp"
  → ex.mp === "squat"
  → ex.pref deep-equals ["strength_main"]
  → ex.eq deep-equals ["barbell"]
  → ex.mc === "compound"
  → ex.load === true
  → ex.tr deep-equals ["quads"]
  → ex.wh deep-equals ["hips"]

"handles empty exercise list"
  result = JSON.parse(buildCatalogJsonFromBubble([]))
  → result.ex deep-equals []
  → result.count === 0
```

### `hasPref`

```
"returns true when pref is null/undefined"
  hasPref({ pref: ["x"] }, null) === true
  hasPref({ pref: ["x"] }, undefined) === true

"returns true when exercise has the pref"
  hasPref({ pref: ["strength_main", "hypertrophy"] }, "strength_main") === true

"returns false when exercise does not have the pref"
  hasPref({ pref: ["strength_main"] }, "hypertrophy_secondary") === false

"returns false when pref array is empty"
  hasPref({ pref: [] }, "strength_main") === false
```

### `isConditioning`

```
"returns true for mp=conditioning"
  isConditioning({ mp: "conditioning", sw: "", sw2: "", n: "" }) === true

"returns true for mp=cardio"
  isConditioning({ mp: "cardio", sw: "", sw2: "", n: "" }) === true

"returns true when sw contains engine"
  isConditioning({ mp: "", sw: "cardio_engine", sw2: "", n: "" }) === true

"returns true for name containing bike"
  isConditioning({ mp: "", sw: "", sw2: "", n: "Air Bike Intervals" }) === true

"returns false for normal strength exercise"
  isConditioning({ mp: "squat", sw: "squat_group", sw2: "squat_comp", n: "Squat" }) === false
```

### `isLoadable`

```
"returns true when load=true"
  isLoadable({ load: true }) === true

"returns false when load=false"
  isLoadable({ load: false }) === false

"returns true when eq contains barbell and no load field"
  isLoadable({ eq: ["barbell"] }) === true

"returns false for bodyweight exercise"
  isLoadable({ eq: ["bodyweight"] }) === false
```

### `dayHasRealExercise`

```
"returns false for empty blocks"
  dayHasRealExercise([]) === false

"returns false when all blocks lack ex_id"
  dayHasRealExercise([{ fill: "add_sets" }]) === false

"returns true when any block has ex_id"
  dayHasRealExercise([{ ex_id: "ex1" }]) === true
```

---

## Prompt 2 — `pickBest` + `pickWithFallback` + `pickSeedExerciseForSlot`

Continue in the same `exerciseSelector.test.js` file.

### `pickBest`

```
"returns null for empty allowedSet"
  pool = makeSelectorPool([makeExercise({ id: "ex1", sw: "sq_group", sw2: "sq_comp" })])
  emptySet = new Set()
  pickBest(emptySet, pool.byId, { sw2: "sq_comp" }, null, null) === null

"returns null when no exercise reaches score > 0"
  // exercises have sw2="other" but sel requests sw2="target" — score stays 0
  pickBest(pool.allowedSet, pool.byId, { sw2: "target_group" }, null, null) === null

"sw2 match scores highest (12 points)"
  ex_sw2 = makeExercise({ id: "a", sw2: "sq_comp" })
  ex_sw  = makeExercise({ id: "b", sw: "sq_group", sw2: "other" })
  pool = makeSelectorPool([ex_sw2, ex_sw])
  sel = { mp: null, sw: "sq_group", sw2: "sq_comp" }
  result = pickBest(pool.allowedSet, pool.byId, sel, null, null)
  → result.id === "a"  // sw2 match beats sw-only match

"sw match scores above mp match (10 vs 4)"
  ex_sw = makeExercise({ id: "a", mp: "squat", sw: "sq_group", sw2: "other" })
  ex_mp = makeExercise({ id: "b", mp: "squat", sw: "other_group", sw2: "other" })
  pool = makeSelectorPool([ex_sw, ex_mp])
  sel = { mp: "squat", sw: "sq_group", sw2: null }
  result = pickBest(pool.allowedSet, pool.byId, sel, null, null)
  → result.id === "a"  // sw wins over mp-only

"requirePref strict mode excludes exercises without the pref"
  ex_with_pref    = makeExercise({ id: "a", sw2: "sq_comp", pref: ["strength_main"] })
  ex_without_pref = makeExercise({ id: "b", sw2: "sq_comp", pref: [] })
  pool = makeSelectorPool([ex_with_pref, ex_without_pref])
  sel = { sw2: "sq_comp", requirePref: "strength_main", pref_mode: "strict" }
  result = pickBest(pool.allowedSet, pool.byId, sel, null, null)
  → result.id === "a"  // "b" excluded by strict gate

"requirePref soft mode gives bonus but does not exclude"
  ex_with_pref    = makeExercise({ id: "a", sw2: "sq_comp", pref: ["strength_main"] })
  ex_without_pref = makeExercise({ id: "b", sw2: "sq_comp", pref: [] })
  pool = makeSelectorPool([ex_with_pref, ex_without_pref])
  sel = { sw2: "sq_comp", requirePref: "strength_main", pref_mode: "soft", pref_bonus: 4 }
  result = pickBest(pool.allowedSet, pool.byId, sel, null, null)
  → result.id === "a"  // wins on score, but "b" was not excluded

"region overlap penalty: exercises with 2+ overlapping regions score lower"
  ex_overlap = makeExercise({ id: "a", sw: "sq_group", sw2: "sq_comp", regions: ["quads", "glutes"] })
  ex_clean   = makeExercise({ id: "b", sw: "sq_group", sw2: "sq_comp", regions: ["traps"] })
  pool = makeSelectorPool([ex_overlap, ex_clean])
  usedRegions = new Set(["quads", "glutes"])
  sel = { sw2: "sq_comp" }
  result = pickBest(pool.allowedSet, pool.byId, sel, null, usedRegions)
  → result.id === "b"  // overlap penalty makes b win

"avoidSw2 skips matching exercise"
  ex_avoid = makeExercise({ id: "a", sw: "sq_group", sw2: "avoid_this", mp: "squat" })
  ex_ok    = makeExercise({ id: "b", sw: "sq_group", sw2: "ok_group", mp: "squat" })
  pool = makeSelectorPool([ex_avoid, ex_ok])
  sel = { sw: "sq_group", avoidSw2: "avoid_this" }
  result = pickBest(pool.allowedSet, pool.byId, sel, null, null)
  → result.id === "b"

"usedSet (already used this week) causes exercise to be skipped"
  ex = makeExercise({ id: "ex1", sw2: "sq_comp" })
  pool = makeSelectorPool([ex])
  usedWeek = new Set(["ex1"])
  result = pickBest(pool.allowedSet, pool.byId, { sw2: "sq_comp" }, usedWeek, null)
  → result === null
```

### `pickWithFallback` — fallback chain

```
"returns sw2 match on first attempt (stats.picked_sw2_pref incremented)"
  ex = makeExercise({ id: "ex1", sw2: "sq_comp" })
  pool = makeSelectorPool([ex])
  stats = makeStats()
  result = pickWithFallback(pool.allowedSet, pool.byId,
    { sw2: "sq_comp", requirePref: null }, new Set(), stats, new Set(), new Set())
  → result.id === "ex1"
  → stats.picked_sw2_pref === 1

"requirePref relaxation: falls back to sw2 without pref when all pref attempts fail"
  ex_no_pref = makeExercise({ id: "ex1", sw2: "sq_comp", pref: [] })
  pool = makeSelectorPool([ex_no_pref])
  stats = makeStats()
  sel = { sw2: "sq_comp", requirePref: "strength_main", pref_mode: "soft" }
  result = pickWithFallback(pool.allowedSet, pool.byId, sel, new Set(), stats, new Set(), new Set())
  → result.id === "ex1"  // found on relaxed fallback

"returns null when allowedSet is empty"
  result = pickWithFallback(new Set(), {}, { sw2: "x" }, new Set(), makeStats(), new Set(), new Set())
  → result === null
```

### `pickSeedExerciseForSlot`

```
"returns null when allowedSet is empty"
  pool = makeSelectorPool([])
  pickSeedExerciseForSlot(new Set(), {}, { sw2: "sq_comp" }) === null

"returns first non-conditioning exercise when no sw/sw2/mp match"
  ex1 = makeExercise({ id: "ex1", mp: "other", sw: "other", sw2: "other" })
  pool = makeSelectorPool([ex1])
  sel = { sw2: "nonexistent", mp: null }
  result = pickSeedExerciseForSlot(pool.allowedSet, pool.byId, sel)
  → result.id === "ex1"

"skips conditioning exercises"
  cardio = makeExercise({ id: "c1", mp: "conditioning" })
  real   = makeExercise({ id: "ex1", mp: "squat" })
  pool = makeSelectorPool([cardio, real])
  sel = { sw2: null, sw: null, mp: null, requirePref: null }
  result = pickSeedExerciseForSlot(pool.allowedSet, pool.byId, sel)
  → result.id === "ex1"

"prefers requirePref match over plain first exercise"
  ex_plain  = makeExercise({ id: "a", mp: "squat", pref: [] })
  ex_pref   = makeExercise({ id: "b", mp: "squat", pref: ["strength_main"] })
  pool = makeSelectorPool([ex_plain, ex_pref])
  sel = { sw2: null, mp: null, requirePref: "strength_main" }
  result = pickSeedExerciseForSlot(pool.allowedSet, pool.byId, sel)
  → result.id === "b"
```

---

## Prompt 3 — `selectorStrategies.test.js`

Create `api/engine/__tests__/selectorStrategies.test.js`.

Import: `resolveStrategy`, `fillSlot` from `../selectorStrategies.js`.
Import helpers from `../exerciseSelector.js` and use the shared `makeExercise` /
`makeSelectorPool` helpers.

```
"resolveStrategy throws for unknown strategy name"
  → assert.throws(() => resolveStrategy("nonexistent_strategy"), /Unknown selector strategy/)

"resolveStrategy returns a function for best_match_by_movement"
  strategy = resolveStrategy("best_match_by_movement")
  → typeof strategy === "function"

"fillSlot delegates to best_match_by_movement and returns matching exercise"
  ex = makeExercise({ id: "ex1", mp: "squat", sw: "sq_group", sw2: "sq_comp" })
  pool = makeSelectorPool([ex])

  slotDef = {
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
  }

  state = {
    compiledConfig: { programType: "strength" },
    rankValue: 0,
    usedIdsWeek: new Set(),
    usedSw2Today: new Set(),
    usedRegionsToday: new Set(),
    stats: makeStats(),
    conditioning: null,
  }

  result = fillSlot(slotDef, pool, state)
  → result.id === "ex1"

"fillSlot with unknown selector_strategy throws"
  slotDef = { ...validSlotDef, selector_strategy: "unknown_strategy" }
  → assert.throws(() => fillSlot(slotDef, pool, state), /Unknown selector strategy/)

"fillSlot returns null when allowedSet is empty"
  emptyPool = { byId: {}, allowedSet: new Set() }
  result = fillSlot(slotDef, emptyPool, state)
  → result === null

"preferCompound bias applied for A-block slots"
  ex_compound  = makeExercise({ id: "a", sw2: "sq_comp", mc: "compound" })
  ex_isolation = makeExercise({ id: "b", sw2: "sq_comp", mc: "isolation" })
  pool = makeSelectorPool([ex_compound, ex_isolation])
  slotDef.slot = "A:squat"  // A-block → preferCompound = true
  result = fillSlot(slotDef, pool, state)
  → result.id === "a"  // compound wins A-block bias

"preferIsolation bias applied for C-block slots"
  ex_compound  = makeExercise({ id: "a", sw2: "sq_comp", mc: "compound" })
  ex_isolation = makeExercise({ id: "b", sw2: "sq_comp", mc: "isolation" })
  pool = makeSelectorPool([ex_compound, ex_isolation])
  slotDef.slot = "C:arms"  // C-block → preferIsolation = true
  result = fillSlot(slotDef, pool, state)
  → result.id === "b"  // isolation wins C-block bias
```

### Verification for Prompt 3

```bash
node --check api/engine/__tests__/exerciseSelector.test.js
node --check api/engine/__tests__/selectorStrategies.test.js
node --test api/engine/__tests__/exerciseSelector.test.js
node --test api/engine/__tests__/selectorStrategies.test.js
cd api && npm test -- --test-concurrency=1
# All tests pass — no regressions
```
