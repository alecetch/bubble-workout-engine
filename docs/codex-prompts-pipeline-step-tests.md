# Codex Spec: Pipeline Steps 01 / 02 / 03 Unit Tests

**Why:** Steps 04 (rep rules), 05 (narration), and 06 (emitter) all have unit tests.
Steps 01 (build program from definition), 02 (segment program), and 03 (apply progression)
— which determine workout structure, slot selection, segmentation, and week layout — have
none. The `hypertrophyParity` and `strengthGeneration` tests exercise these steps
indirectly, but a structural bug in 01 or 02 would produce a wrong-shaped program with no
CI signal.

---

## Context for Codex

Read before starting:
- `api/engine/steps/01_buildProgramFromDefinition.js` — full source
- `api/engine/steps/02_segmentProgram.js` — full source
- `api/engine/steps/03_applyProgression.js` — full source
- `api/engine/steps/__tests__/04_applyRepRules.test.js` — test structure to follow
- `api/engine/steps/__tests__/05_applyNarration.test.js` — test structure to follow
- `api/engine/__tests__/equipmentAwareSelection.test.js` — `makeExercise` helper pattern

No DB, no real pipeline run — these are pure function tests.

---

## Shared helpers (define once, reuse across all three test files)

### `makeExercise(overrides)`

Mirror the helper from `equipmentAwareSelection.test.js`:

```js
function makeExercise({ id, name = "Test Ex", mp = "squat", sw = "squat_group",
                        sw2 = "squat_compound", pref = [], mc = "compound",
                        loadable = false, regions = [] } = {}) {
  return {
    exercise_id: id,
    name,
    movement_pattern_primary: mp,
    swap_group_id_1: sw,
    swap_group_id_2: sw2,
    preferred_in_json: pref,
    movement_class: mc,
    is_loadable: loadable,
    equipment_json: [],
    density_rating: 1,
    complexity_rank: 1,
    target_regions_json: regions,
    warmup_hooks: [],
  };
}
```

### `makeMinimalCompiledConfig(overrides)`

```js
function makeMinimalCompiledConfig(overrides = {}) {
  return {
    programType: "strength",
    schemaVersion: 1,
    configKey: "strength_test_v1",
    source: "test",
    builder: {
      dayTemplates: [["A:squat", "B:pull_horizontal"]],
      setsByDuration: { "50": { A: 5, B: 4, C: 3, D: 2 } },
      blockBudget: { "50": 5 },
      slotDefaults: {},
    },
    segmentation: {
      blockSemantics: {
        A: { preferred_segment_type: "single", purpose: "main", post_segment_rest_sec: 90 },
        B: { preferred_segment_type: "single", purpose: "secondary", post_segment_rest_sec: 60 },
        C: { preferred_segment_type: "superset", purpose: "accessory", post_segment_rest_sec: 45 },
        D: { preferred_segment_type: "giant_set", purpose: "accessory", post_segment_rest_sec: 30 },
      },
      blockSemanticsByFocus: {},
    },
    ...overrides,
  };
}
```

---

## Prompt 1 — `01_buildProgramFromDefinition.test.js`

Create `api/engine/steps/__tests__/01_buildProgramFromDefinition.test.js`.

Import: `buildProgramFromDefinition`, `deriveEquipmentProfile`, `resolveSlotVariant`
from `../01_buildProgramFromDefinition.js`.

### `deriveEquipmentProfile` — pure, no exercises needed

```
"returns full when barbell is present"
  deriveEquipmentProfile(["barbell", "dumbbells"]) === "full"

"returns full when trap_bar is present"
  deriveEquipmentProfile(["trap_bar"]) === "full"

"returns minimal when only dumbbells"
  deriveEquipmentProfile(["dumbbells"]) === "minimal"

"returns bodyweight when empty"
  deriveEquipmentProfile([]) === "bodyweight"

"returns bodyweight when null"
  deriveEquipmentProfile(null) === "bodyweight"
```

### `resolveSlotVariant` — pure

```
"returns slotDef unchanged when no variants array"
  slotDef = { slot: "A:squat", sw: "squat" }
  resolveSlotVariant(slotDef, "full") === slotDef (same reference)

"returns slotDef unchanged when no variant matches equipment_profile"
  slotDef = {
    slot: "A:squat",
    variants: [{ when: { equipment_profile: "bodyweight" }, sw: "bodyweight_squat" }]
  }
  resolveSlotVariant(slotDef, "full").sw === slotDef.sw  // no match → original

"applies matching variant fields and preserves slot name"
  slotDef = {
    slot: "A:squat",
    sw: "squat_group",
    variants: [{ when: { equipment_profile: "bodyweight" }, sw: "bodyweight_squat" }]
  }
  result = resolveSlotVariant(slotDef, "bodyweight")
  → result.slot === "A:squat"
  → result.sw === "bodyweight_squat"
```

### `buildProgramFromDefinition` — async, minimal catalog

Build a minimal exercise list and verify output shape:

```js
function makeInputs(exercises = []) {
  return {
    clientProfile: { response: { equipment_items_slugs: ["barbell"], minutes_per_session: 50 } },
    exercises: { response: { results: exercises } },
  };
}
```

```
"throws when catalog is empty"
  inputs = makeInputs([])  // empty exercise list → Invalid catalog_json
  compiledConfig = makeMinimalCompiledConfig()
  → rejects with /Invalid catalog_json/i

"returns program with correct shape for 1 day / 2 slots"
  exercises = [makeExercise({ id: "ex1", mp: "squat", sw: "squat_group", sw2: "squat_comp" }),
               makeExercise({ id: "ex2", mp: "pull", sw: "pull_group", sw2: "pull_comp" })]
  compiledConfig = makeMinimalCompiledConfig()  // 1 dayTemplate with A:squat + B:pull
  result = await buildProgramFromDefinition({ inputs, request: {}, compiledConfig })
  → result.program.days.length === 1
  → result.program.days_per_week === 1
  → result.program.duration_mins === 50
  → result.program.program_type === "strength"
  → result.program.schema === "program_strength_v1"
  → result.debug is object

"days_per_week is clamped to dayTemplates.length"
  compiledConfig has 2 dayTemplates
  request = { days_per_week: 99 }
  → result.program.days.length === 2   // capped at template count

"duration_mins is clamped to 40 when request says 30"
  request = { duration_mins: 30 }
  → result.program.duration_mins === 40

"duration_mins is clamped to 60 when request says 90"
  request = { duration_mins: 90 }
  → result.program.duration_mins === 60

"when exercise matches slot, block has ex_id and sets"
  exercises = [makeExercise({ id: "sq1", mp: "squat", sw: "squat_group", sw2: "squat_comp" })]
  compiledConfig dayTemplate = [{ slot: "A:squat", mp: "squat", sw: "squat_group", sw2: "squat_comp" }]
  block = result.program.days[0].blocks[0]
  → block.ex_id === "sq1"
  → Number.isFinite(block.sets) && block.sets > 0

"when no exercise matches slot, block is fill add_sets"
  exercises = [makeExercise({ id: "unrelated", mp: "pull", sw: "pull_group", sw2: "pull_comp" })]
  compiledConfig dayTemplate = ["A:squat"]  // slot requires squat, exercise is pull
  block = result.program.days[0].blocks[0]
  → block.fill === "add_sets"

"excludes conditioning exercises from allowedSet"
  cardio = makeExercise({ id: "bike1", mp: "conditioning" })
  squat = makeExercise({ id: "sq1", mp: "squat", sw: "squat_group", sw2: "squat_comp" })
  compiledConfig.builder.excludeMovementClasses = ["conditioning"]
  compiledConfig.builder.dayTemplates = [
    [{ slot: "A:squat", mp: "squat", sw: "squat_group", sw2: "squat_comp" }]
  ]
  → bike1 is never assigned to a block (sq1 is chosen, not bike1)
```

### Verification for Prompt 1

```bash
node --check api/engine/steps/__tests__/01_buildProgramFromDefinition.test.js
node --test api/engine/steps/__tests__/01_buildProgramFromDefinition.test.js
```

---

## Prompt 2 — `02_segmentProgram.test.js`

Create `api/engine/steps/__tests__/02_segmentProgram.test.js`.

Import: `segmentProgram` from `../02_segmentProgram.js`.

### Helper: `makeProgram`

```js
function makeProgram(days = []) {
  return {
    program_type: "strength",
    duration_mins: 50,
    days_per_week: days.length,
    days,
  };
}

function makeDay(blocks = [], overrides = {}) {
  return {
    day_index: 1,
    day_type: "strength",
    day_focus: null,
    duration_mins: 50,
    blocks,
    ...overrides,
  };
}

function makeBlock(overrides = {}) {
  return {
    block: "A",
    slot: "A:squat",
    ex_id: "ex1",
    ex_name: "Squat",
    sets: 5,
    ...overrides,
  };
}
```

### Tests

```
"throws when program.days is missing"
  segmentProgram({ program: {}, compiledConfig: makeMinimalCompiledConfig() })
  → rejects with /missing days/i

"throws when blockSemantics is missing from compiledConfig"
  program = makeProgram([makeDay([makeBlock()])])
  compiledConfig = { segmentation: {} }  // no blockSemantics
  → rejects with /blockSemantics/i

"single block letter with preferred_segment_type=single produces single segment"
  day = makeDay([makeBlock({ block: "A", slot: "A:squat", ex_id: "ex1", ex_name: "Squat", sets: 5 })])
  compiledConfig.segmentation.blockSemantics.A = { preferred_segment_type: "single", purpose: "main" }
  result = await segmentProgram({ program: makeProgram([day]), compiledConfig })
  seg = result.program.days[0].segments[0]
  → seg.segment_type === "single"
  → seg.purpose === "main"
  → seg.items[0].ex_id === "ex1"

"two C-block exercises with preferred_segment_type=superset produce one superset segment"
  blocks = [
    makeBlock({ block: "C", slot: "C:arms", ex_id: "ex2", ex_name: "Curl", sets: 3 }),
    makeBlock({ block: "C", slot: "C:tricep", ex_id: "ex3", ex_name: "Pushdown", sets: 3 }),
  ]
  day = makeDay(blocks)
  compiledConfig.segmentation.blockSemantics.C = { preferred_segment_type: "superset", purpose: "accessory" }
  result = await segmentProgram({ program: makeProgram([day]), compiledConfig })
  → result.program.days[0].segments[0].segment_type === "superset"
  → result.program.days[0].segments[0].items.length === 2

"single C-block exercise with preferred_segment_type=superset falls back to single"
  blocks = [makeBlock({ block: "C", slot: "C:arms", ex_id: "ex2", ex_name: "Curl", sets: 3 })]
  → segment_type === "single"  // superset of 1 → single

"three D-block exercises with preferred_segment_type=giant_set produce one giant_set"
  3 D-block blocks
  compiledConfig.segmentation.blockSemantics.D = { preferred_segment_type: "giant_set", purpose: "accessory" }
  → segment_type === "giant_set"
  → items.length === 3

"fill:add_sets blocks are resolved before segmentation (target block gains sets)"
  realBlock = makeBlock({ block: "A", slot: "A:squat", ex_id: "ex1", ex_name: "Squat", sets: 5 })
  fillBlock = { block: "C", slot: "C:filler", fill: "add_sets", target_slot: "A:squat", add_sets: 1 }
  day = makeDay([realBlock, fillBlock])
  result = await segmentProgram({ program: makeProgram([day]), compiledConfig })
  mainSeg = result.program.days[0].segments.find(s => s.items[0].ex_id === "ex1")
  → mainSeg.rounds === 6  // sets resolved from 5 + 1

"day_focus triggers blockSemanticsByFocus override"
  compiledConfig.segmentation.blockSemanticsByFocus = {
    upper: { A: { preferred_segment_type: "superset", purpose: "main" } }
  }
  day = makeDay(
    [makeBlock(), makeBlock({ slot: "A:push", ex_id: "ex2", ex_name: "Press" })],
    { day_focus: "upper" }
  )
  result = await segmentProgram({ program: makeProgram([day]), compiledConfig })
  → result.program.days[0].segments[0].segment_type === "superset"

"output preserves day_index, day_type, duration_mins"
  day = makeDay([makeBlock()], { day_index: 3, day_type: "strength", duration_mins: 60 })
  result.program.days[0].day_index === 3
  result.program.days[0].day_type === "strength"
  result.program.days[0].duration_mins === 60
```

### Verification for Prompt 2

```bash
node --check api/engine/steps/__tests__/02_segmentProgram.test.js
node --test api/engine/steps/__tests__/02_segmentProgram.test.js
```

---

## Prompt 3 — `03_applyProgression.test.js`

Create `api/engine/steps/__tests__/03_applyProgression.test.js`.

Import: `applyProgression` from `../03_applyProgression.js`.

### Helper: `makeSegmentedProgram` and `makeConfigRow`

```js
function makeSegmentedProgram(weeksCount, daysPerWeek = 1) {
  // produces a program with template days (no weeks array yet — that's step 3's job)
  const days = [];
  for (let d = 1; d <= daysPerWeek; d++) {
    days.push({
      day_index: d,
      day_type: "strength",
      day_focus: null,
      duration_mins: 50,
      segments: [
        {
          segment_index: 1,
          segment_type: "single",
          purpose: "main",
          rounds: 1,
          items: [{ ex_id: "ex1", ex_name: "Squat", sets: 4 }],
        },
        {
          segment_index: 2,
          segment_type: "single",
          purpose: "accessory",
          rounds: 1,
          items: [{ ex_id: "ex2", ex_name: "Leg Press", sets: 3 }],
        },
      ],
    });
  }
  return { program_type: "strength", duration_mins: 50, days_per_week: daysPerWeek, days };
}

function makeConfigRow(overrides = {}) {
  return {
    program_type: "strength",
    schema_version: 1,
    is_active: "yes",
    config_key: "strength_test_v1",
    total_weeks_default: 4,
    progression_by_rank_json: JSON.stringify({
      beginner: {
        apply_to_purposes: ["main", "secondary"],
        weekly_set_step: 1,
        max_extra_sets: 3,
      },
      intermediate: {
        apply_to_purposes: ["main", "secondary"],
        weekly_set_step: 1,
        max_extra_sets: 4,
      },
    }),
    ...overrides,
  };
}
```

### Tests

```
"throws when program.days is missing"
  → rejects with /missing days/i

"returns debug.ok=false when no matching config row"
  programGenerationConfigs = []  // empty — no row to match
  result = await applyProgression({ program, programType: "strength", programGenerationConfigs: [] })
  → result.debug.ok === false
  → result.debug.error matches /No active config row/i
  → result.program === the original program (unchanged)

"returns debug.ok=false when no row matches program_type"
  configRow has program_type: "hypertrophy"
  applyProgression with programType: "strength"
  → result.debug.ok === false

"program.weeks has correct week count from total_weeks_default"
  program = makeSegmentedProgram()
  configs = [makeConfigRow({ total_weeks_default: 4 })]
  result = await applyProgression({ program, programGenerationConfigs: configs,
                                    programType: "strength", fitnessRank: 1 })
  → result.program.weeks.length === 4
  → result.program.weeks_count === 4

"programLength overrides total_weeks_default"
  configs = [makeConfigRow({ total_weeks_default: 4 })]
  result = await applyProgression({ ..., programLength: 6 })
  → result.program.weeks.length === 6

"programLength is clamped to 12 at most"
  result = await applyProgression({ ..., programLength: 99 })
  → result.program.weeks.length === 12

"week 1 sets equal base sets for main purpose"
  configs = [makeConfigRow()]  // weekly_set_step: 1
  result = await applyProgression({ program, programGenerationConfigs: configs,
                                    programType: "strength", fitnessRank: 1 })
  week1Day = result.program.weeks[0].days[0]
  mainItem = week1Day.segments[0].items[0]  // purpose: "main"
  → mainItem.sets === 4  // base is 4, week 1 → no step added

"week 2 sets are base + weekly_set_step for main purpose"
  week2Day = result.program.weeks[1].days[0]
  mainItem = week2Day.segments[0].items[0]
  → mainItem.sets === 5  // 4 + 1 step

"accessory purpose not in apply_to_purposes is not progressed"
  // apply_to_purposes = ["main", "secondary"] — accessory excluded
  week2Day = result.program.weeks[1].days[0]
  accessoryItem = week2Day.segments[1].items[0]  // purpose: "accessory"
  → accessoryItem.sets === 3  // unchanged from base

"deload week reduces sets"
  configRow = makeConfigRow with progression_by_rank_json containing:
    beginner.deload = { week: 4, set_multiplier: 0.5, apply_to_all: true }
  result (4 weeks)
  week4MainItem = result.program.weeks[3].days[0].segments[0].items[0]
  → week4MainItem.sets === Math.max(1, Math.round(4 * 0.5))  // = 2

"fitnessRank 2 uses intermediate progression config"
  configs = [makeConfigRow()]  // has beginner and intermediate
  intermediate result = await applyProgression({ ..., fitnessRank: 2 })
  → intermediate result.debug.rank_key === "intermediate"

"each week entry has week_index starting at 1"
  result.program.weeks.forEach((wk, i) => assert.equal(wk.week_index, i + 1))

"template days preserved in program.days"
  result.program.days === original template days (length matches input)
```

### Verification for Prompt 3

```bash
node --check api/engine/steps/__tests__/03_applyProgression.test.js
node --test api/engine/steps/__tests__/03_applyProgression.test.js
```

---

## Final Verification (after all three prompts)

```bash
cd api && npm test -- --test-concurrency=1
# All tests pass — no regressions

# Count new test files:
ls api/engine/steps/__tests__/
# Should show: 01_, 02_, 03_, 04_, 05_ test files
```
