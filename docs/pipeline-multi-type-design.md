# Pipeline Multi-Type Design

> Design review for generalising the program-generation pipeline to support strength, conditioning, Hyrox, and other program types beyond hypertrophy.
>
> Covers: current-state findings, target architecture, config schema, migration plan, performance notes, code sketches, and anti-patterns.
>
> Based on full code reads of all six step files, `runPipeline.js`, `getAllowedExercises.js`, and `buildInputsFromDevProfile.js`.

---

## A. Findings: What Is Hardcoded vs Already Generic

### A.1 The hard gate — `runPipeline.js:112`

```js
if (programType !== "hypertrophy") {
  throw new Error(`Unsupported programType: ${programType}`);
}
```

This is the entry-point guard. Every other hardcoded assumption below is moot until this is removed.

Also on `runPipeline.js:258`:
```js
await applyProgression({ ..., programType: "hypertrophy", ... })
```
`programType` is already in scope as a variable — it should be passed through, not re-hardcoded.

---

### A.2 Step 01 — `buildBasicHypertrophyProgram.js` (the big one)

Four distinct hardcoded layers:

**Layer 1 — Day template definitions** (`templates` object, line ~516)
```js
const templates = {
  day1: ["A:squat", "B:lunge", "C:quad", "C:hamstring", "D:calf"],
  day2: ["A:push", "B:pull", "C:shoulder", "D:bicep", "D:tricep"],
  day3: ["A:hinge", "B:squat_v2", "C:glute", "C:abductor", "D:core"],
};
```
This is the structural heart of hypertrophy. Different program types need entirely different slot definitions. This is the primary thing to externalise.

**Layer 2 — Slot-to-selector mapping** (`slotToSelector` function, line ~228)
```js
function slotToSelector(slot) {
  switch(slot) {
    case "A:squat": return { mp: "squat", sw: "leg_press", requirePref: "strength_main" };
    case "B:lunge":  return { mp: "lunge", requirePref: "hypertrophy_secondary" };
    ...
  }
}
```
The `requirePref` values (`"strength_main"`, `"hypertrophy_secondary"`) are catalogue tags from `preferred_in_json`. These already exist as a tagging system in the exercise catalogue — they just need to be expressed in config rather than in code.

**Layer 3 — Set/duration tables** (`setsByDuration`, `blockBudget`, lines ~198–210)
```js
const setsByDuration = {
  40: { A: 3, B: 2, C: 2 },
  50: { A: 4, B: 3, C: 2 },
  60: { A: 5, B: 3, C: 2, D: 2 },
};
const blockBudget = { 40: 4, 50: 5, 60: 7 };
```
Hypertrophy-specific volumes. Strength programs use lower rep ranges but similar set structures. These belong in config.

**Layer 4 — Output schema tags** (lines ~634, ~645)
```js
day_type: "hypertrophy"
schema: "program_hypertrophy_v1"
```
Should be `day_type: programType` and `schema: \`program_${programType}_v1\``.

**What is already generic in Step 01:**
- `pickBest` scoring (sw2=+12, sw=+10, mp=+4) — these weights are reasonable across program types
- `getAllowedExercises` call — fully generic
- The slot-filling loop — generic once `slotToSelector` is config-driven
- `fillTargetForKey` fallback — minor; can be expressed in slot config

---

### A.3 Step 02 — `segmentHypertrophy.js`

The function `segmentDayFromBlocks` at line 125 hardcodes block letter semantics:

```js
// A-block always single (main)
// B-block → single "secondary" if 1, superset "secondary" if 2+
// C-block → single "accessory" if 1, giant_set "accessory" if 2+
// D-block → accessory singles
```

These are hypertrophy-specific conventions. Strength programs might want all B-block exercises to remain singles (no supersets). Conditioning programs might want C-block as a circuit. Hyrox has a fixed station structure that doesn't fit the A/B/C/D model at all.

Also hardcoded:
- `schema: "program_hypertrophy_v1_segmented"` (line 270)
- `day_type: "hypertrophy"` fallback (line 291)

---

### A.4 Step 03 — `applyProgression.js`

**Already generic.** Reads `program_generation_config` rows keyed by `programType` + `schemaVersion`. Adding a new program type requires only new DB rows, no code changes.

The only assumption to note: default `apply_to_purposes = ["main", "secondary", "accessory"]`. This is fine for strength and conditioning. Hyrox might use different purpose labels — make this configurable in the PGC row.

---

### A.5 Step 04 — `applyRepRules.js`

**Already generic.** `ruleMatches` at line 171 mandates `rule.program_type === ctx.program_type`. Any new program type just needs new rows in the `rep_rules` table. No code changes needed.

Note: the `ctx.program_type` is derived at line 292 from `out.program_type || out.programType || "hypertrophy"` — the `"hypertrophy"` fallback is only reached if Step 01 sets no `program_type` on the output (which it currently does via the hardcoded string). Once Step 01 is fixed, Step 04 needs no changes.

---

### A.6 Steps 05, 06 — narration + emitter

Not audited in detail, but both steps receive a `program` object with `program_type` set and operate on the generic `weeks[].days[].segments[].items[]` structure. Neither step hardcodes hypertrophy in its matching logic (narration templates and emitter rows both use program_type from the program object). No changes expected.

---

### A.7 `getAllowedExercises.js`

**Fully generic.** Filters by `min_fitness_rank`, `contraindications_slugs`, `equipment_items_slugs`. No program-type awareness — intentionally so. `preferred_in_json` is a selection hint, not an eligibility gate (see anti-patterns).

---

### A.8 Summary table

| Component | Hardcoded? | Effort |
|---|---|---|
| `runPipeline` guard | Explicit throw | Trivial — remove |
| `runPipeline` Step 3 programType | Wrong variable | Trivial — fix |
| Step 01 — day templates | Deep | Medium — externalise to config |
| Step 01 — slot selectors | Deep | Medium — externalise to config |
| Step 01 — set/duration tables | Deep | Medium — externalise to config |
| Step 01 — schema/day_type tags | Minor | Trivial — use variable |
| Step 02 — block semantics | Moderate | Small — externalise to config |
| Step 02 — schema/day_type tags | Minor | Trivial — use variable |
| Step 03 | None | No change |
| Step 04 | None | No change |
| Steps 05, 06 | None expected | No change expected |
| getAllowedExercises | None | No change |

---

## B. Recommended Target Architecture

### B.1 Core principle: Declarative config for structure, code for algorithms

The distinction the user asked for:

**Declarative config (goes in `program_generation_config_json` JSONB):**
- Day template definitions — which slots, in which order
- Slot-to-selector mappings — movement pattern hints, swap group hints, `requirePref` tag
- Set/duration tables — how many sets per block letter at each session duration
- Block-letter semantics — what segment type and purpose each letter produces
- Progression parameters — already in PGC

**Code (stays as algorithms, not data):**
- Exercise selection engine — `pickBest` scoring, `fillSlot`, fallback logic
- Segmentation engine — how to assemble `blocks[]` into `segments[]` given block semantics
- Rep rule matching — `ruleMatches`, `specificityScore`
- Progression arithmetic — `computeSetsForWeek`

This distinction means: adding a new standard program type (strength, conditioning) requires **zero new step files** — you write a config row. Only truly exotic programs (Hyrox, powerlifting peaking) that need custom structural logic would require a new step variant.

---

### B.2 Module layout (target state)

```
api/engine/
  runPipeline.js              — dispatches based on programType; builds compiledConfig
  resolveCompiledConfig.js    — NEW: resolves + validates config from DB or request
  getAllowedExercises.js       — unchanged
  resolveHeroMedia.js         — unchanged

  steps/
    01_buildProgram.js        — RENAMED/REFACTORED: reads day_templates from compiledConfig
    02_segmentProgram.js      — RENAMED/REFACTORED: reads block_semantics from compiledConfig
    03_applyProgression.js    — unchanged
    04_applyRepRules.js       — unchanged
    05_applyNarration.js      — unchanged
    06_emitPlan.js            — unchanged

  steps/variants/
    01_buildHyroxProgram.js   — NEW (when needed): custom Step 01 for fixed-station Hyrox
```

Note: the existing `01_buildBasicHypertrophyProgram.js` and `02_segmentHypertrophy.js` stay in place during transition (see migration plan). The new generic variants are written alongside, and `runPipeline.js` dispatches to the appropriate one.

---

### B.3 The compiled config object

`runPipeline.js` resolves this once before calling any steps, and threads it through:

```js
const compiledConfig = await resolveCompiledConfig(dbClient, { programType, schemaVersion, request });
```

`compiledConfig` shape:
```js
{
  programType: "strength",
  schemaVersion: 1,
  configKey: "strength_default_v1",
  source: "db",                       // "db" | "request" | "hardcoded"

  // Step 01
  dayTemplates: [ ... ],              // from program_generation_config_json
  setsByDuration: { ... },
  blockBudget: { ... },

  // Step 02
  blockSemantics: { ... },            // A/B/C/D → segment_type + purpose rules

  // Step 03
  progressionByRank: { ... },
  weekPhaseConfig: { ... },
  totalWeeksDefault: 8,
  applyToPurposes: ["main", "secondary", "accessory"],

  // Raw PGC row for Steps 05/06 compatibility
  programGenerationConfigJson: { ... },
}
```

This is constructed once per generation request. No repeated parsing. Steps receive the compiled object directly.

---

## C. Proposed `program_generation_config_json` Schema

The JSONB `program_generation_config_json` column on the `program_generation_config` table is extended:

```json
{
  "program_type": "strength",
  "schema_version": 1,
  "total_weeks_default": 8,

  "day_templates": [
    {
      "day_key": "day1",
      "focus": "lower_push",
      "slots": [
        {
          "slot": "A:squat",
          "mp": "squat",
          "sw": "leg_press",
          "sw2": null,
          "requirePref": "strength_main"
        },
        {
          "slot": "B:hinge",
          "mp": "hinge",
          "sw": "rdl",
          "requirePref": "strength_main"
        },
        {
          "slot": "C1:row",
          "mp": "row",
          "requirePref": "strength_secondary"
        },
        {
          "slot": "D:carry",
          "sw2": "carry_variant",
          "requirePref": null
        }
      ]
    },
    { "day_key": "day2", "focus": "upper_push", "slots": [ ... ] },
    { "day_key": "day3", "focus": "full_body",  "slots": [ ... ] }
  ],

  "sets_by_duration": {
    "40": { "A": 3, "B": 3, "C": 2 },
    "50": { "A": 4, "B": 3, "C": 2 },
    "60": { "A": 5, "B": 4, "C": 3, "D": 2 }
  },

  "block_budget": {
    "40": 5,
    "50": 6,
    "60": 8
  },

  "block_semantics": {
    "A": { "segment_type": "single",    "purpose": "main"      },
    "B": { "segment_type": "single",    "purpose": "secondary" },
    "C": { "segment_type": "single",    "purpose": "accessory" },
    "D": { "segment_type": "single",    "purpose": "accessory" }
  },

  "progression_by_rank_json": {
    "beginner":     { "weekly_set_step": 0, "max_extra_sets": 0 },
    "intermediate": { "weekly_set_step": 1, "max_extra_sets": 2 },
    "advanced":     { "weekly_set_step": 1, "max_extra_sets": 3 },
    "elite":        { "weekly_set_step": 1, "max_extra_sets": 4 }
  },

  "week_phase_config_json": {
    "default_phase_sequence": ["BASELINE", "BUILD", "BUILD", "BUILD", "BUILD", "BUILD", "BUILD", "CONSOLIDATE"],
    "last_week_mode": "consolidate"
  },

  "apply_to_purposes": ["main", "secondary", "accessory"]
}
```

Key design decisions:
- **Single JSONB blob** per program type — not normalised. One row in `program_generation_config` = complete definition.
- `block_semantics` for strength uses `"single"` for all letters — no supersets. This is the key difference from hypertrophy (which uses `"superset"` for B and `"giant_set"` for C).
- `slots[].requirePref` maps to `preferred_in_json` catalogue tags. Strength uses `"strength_main"` and `"strength_secondary"`. For exercises where any match is fine, `requirePref: null`.
- `day_templates` closely mirrors the current hardcoded `templates` object in Step 01 — the migration is straightforward.

### Hypertrophy comparison (what changes in its config)

The existing hypertrophy PGC row would add:

```json
"block_semantics": {
  "A": { "segment_type": "single",    "purpose": "main"      },
  "B": { "segment_type": "superset",  "purpose": "secondary" },
  "C": { "segment_type": "giant_set", "purpose": "accessory" },
  "D": { "segment_type": "single",    "purpose": "accessory" }
}
```

This makes the Step 02 behaviour for hypertrophy explicit and config-driven rather than hardcoded, with zero functional change.

---

## D. Migration Plan (minimal disruption)

### Phase 0 — Preparation (no functional change)

1. **Add `day_templates`, `sets_by_duration`, `block_budget`, `block_semantics` keys to the existing hypertrophy PGC row in `R__seed_program_generation_config.sql`.**
   Values are exactly what Step 01 and Step 02 currently hardcode. Behaviour is unchanged.

2. **Write `resolveCompiledConfig.js`** (new file). Reads PGC row from DB, parses the JSONB blob, returns the compiled config object. Falls back to hardcoded defaults if JSONB keys are absent (so existing rows without these keys still work — backward compatible).

3. **Refactor `runPipeline.js`**: remove the `programType !== "hypertrophy"` guard; add `resolveCompiledConfig` call; thread `compiledConfig` to Step 01 and Step 02.

4. Deploy. Run existing tests. Behaviour identical to before.

### Phase 1 — Strength (first new program type)

5. **Refactor Step 01 (`01_buildProgram.js`)**: new generic version that reads `compiledConfig.dayTemplates`, `compiledConfig.setsByDuration`, `compiledConfig.blockBudget`. Falls back to current hardcoded hypertrophy values if compiledConfig is absent (safety net, removable later).

6. **Refactor Step 02 (`02_segmentProgram.js`)**: new generic version that reads `compiledConfig.blockSemantics` to decide segment type and purpose per block letter. Falls back to current hypertrophy defaults.

7. **Write the strength PGC seed row** in `R__seed_program_generation_config.sql` with full `day_templates` etc. for strength.

8. **Write strength rep rules** in `R__seed_rep_rules.sql` with `program_type = 'strength'`.

9. **Write strength narration templates** in `R__seed_narration_templates.sql` with `program_type = 'strength'`.

10. Deploy. `POST /api/program/generate` with `programType: "strength"` now works.

### Phase 2 — Conditioning

11. Add conditioning PGC row + rep rules + narration templates.

12. If `block_semantics` for conditioning needs a new segment type (e.g., `"circuit"` or `"amrap"`), add handling in the refactored Step 02. This is a small, localised change.

### Phase 3 — Hyrox (custom)

Hyrox has a fixed prescribed structure (8 stations × fixed exercises). The config-driven approach cannot express "always use exercise X at station 3". This warrants:

13. `api/engine/steps/variants/01_buildHyroxProgram.js` — custom Step 01 with the fixed station structure.

14. `runPipeline.js` dispatch: if `programType === "hyrox"`, use `buildHyroxProgram` for Step 01 instead of the generic builder.

15. Steps 02–06 continue unchanged — Hyrox output still produces the same `days[].blocks[]` structure.

---

## E. Performance and Risk Analysis

### Performance

The refactored pipeline adds:

- **1 additional DB fetch** per generation request: `resolveCompiledConfig` reads the PGC row. This is already done for Step 3 — it's the same query, deduplicated. Net additional queries: zero (merge with existing PGC fetch in Step 3).
- **1 JSON parse** of the JSONB blob to extract `day_templates` etc. Sub-millisecond.
- **No additional DB queries during steps** — all config is resolved before Step 01 starts.

Net performance impact: negligible. The existing pipeline is already I/O-bound by the initial PGC + rep_rules + narration fetch. The refactor adds nothing new.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Malformed `day_templates` in config causes Step 01 panic | Low | Validate config on write (seed migration); add config schema check in `resolveCompiledConfig` |
| New `block_semantics` value not handled by Step 02 | Low | Default to `single + accessory` for unrecognised block letters |
| `requirePref` tag in slot config doesn't exist in catalogue | Medium | `requirePref` is a preference hint, not a hard gate — no match just means the slot falls back to any matching exercise |
| Step 03 `apply_to_purposes` not set for new type | Low | Default `["main", "secondary", "accessory"]` applies universally |
| Existing hypertrophy generation regresses | Low | Phase 0 adds hypertrophy config values matching current hardcoded logic exactly — covered by existing tests |

---

## F. Code-Level Sketches

### F.1 `resolveCompiledConfig.js`

```js
// api/engine/resolveCompiledConfig.js

import { fetchProgramGenerationConfigByKey, fetchProgramGenerationConfigs }
  from "../src/services/programGenerationConfig.js";

const HYPERTROPHY_FALLBACK = {
  dayTemplates: [
    { day_key: "day1", slots: [
      { slot: "A:squat",     mp: "squat",  sw: "leg_press", requirePref: "strength_main" },
      { slot: "B:lunge",     mp: "lunge",                   requirePref: "hypertrophy_secondary" },
      { slot: "C:quad",      mp: "quad",                    requirePref: "hypertrophy_secondary" },
      // ... (mirrors current hardcoded templates)
    ]},
    // day2, day3 ...
  ],
  setsByDuration: { 40: { A: 3, B: 2, C: 2 }, 50: { A: 4, B: 3, C: 2 }, 60: { A: 5, B: 3, C: 2, D: 2 } },
  blockBudget:    { 40: 4, 50: 5, 60: 7 },
  blockSemantics: {
    A: { segment_type: "single",    purpose: "main"      },
    B: { segment_type: "superset",  purpose: "secondary" },
    C: { segment_type: "giant_set", purpose: "accessory" },
    D: { segment_type: "single",    purpose: "accessory" },
  },
};

export async function resolveCompiledConfig(dbClient, { programType, schemaVersion = 1, request }) {
  // 1. Resolve PGC row (reuse existing logic from runPipeline)
  let pgcRow = null;
  if (request?.config_key) {
    pgcRow = await fetchProgramGenerationConfigByKey(dbClient, request.config_key);
  } else {
    const rows = await fetchProgramGenerationConfigs(dbClient, programType, schemaVersion);
    pgcRow = rows?.[0] ?? null;
  }

  const pgcJson = pgcRow?.program_generation_config_json ?? {};
  const fallback = programType === "hypertrophy" ? HYPERTROPHY_FALLBACK : {};

  return {
    programType,
    schemaVersion,
    configKey: pgcRow?.config_key ?? `hardcoded_${programType}_v${schemaVersion}`,
    source: pgcRow ? "db" : "hardcoded",

    dayTemplates:         pgcJson.day_templates    ?? fallback.dayTemplates    ?? [],
    setsByDuration:       pgcJson.sets_by_duration ?? fallback.setsByDuration  ?? {},
    blockBudget:          pgcJson.block_budget     ?? fallback.blockBudget     ?? {},
    blockSemantics:       pgcJson.block_semantics  ?? fallback.blockSemantics  ?? {},

    progressionByRank:    pgcRow?.progression_by_rank_json ?? {},
    weekPhaseConfig:      pgcRow?.week_phase_config_json   ?? {},
    totalWeeksDefault:    pgcRow?.total_weeks_default       ?? 4,
    applyToPurposes:      pgcJson.apply_to_purposes ?? ["main", "secondary", "accessory"],

    programGenerationConfigJson: pgcJson,
    _pgcRow: pgcRow,
  };
}
```

---

### F.2 `01_buildProgram.js` — new generic Step 01 (sketch)

```js
// api/engine/steps/01_buildProgram.js
// Generic replacement for 01_buildBasicHypertrophyProgram.js.
// Reads day_templates, sets_by_duration, block_budget from compiledConfig.

export async function buildProgramStep({ inputs, request, compiledConfig }) {
  const { programType, dayTemplates, setsByDuration, blockBudget } = compiledConfig;

  const duration   = request?.duration_mins ?? inputs?.clientProfile?.response?.minutes_per_session ?? 50;
  const daysPerWk  = request?.days_per_week ?? inputs?.clientProfile?.response?.preferred_days_count ?? 3;
  const allowedIds = new Set(inputs?.allowed_exercise_ids ?? []);
  const catalog    = buildCatalogIndex(inputs);   // shared utility

  const templates = selectDayTemplates(dayTemplates, daysPerWk);  // pick first N templates

  const days = templates.map((tmpl, i) => {
    const slots = resolveSets(tmpl.slots, duration, setsByDuration, blockBudget);
    const blocks = slots.map(slotDef =>
      fillSlot(slotDef, catalog, allowedIds, programType)   // reuse existing pickBest logic
    );
    return {
      day_index: i + 1,
      day_type: programType,
      duration_mins: duration,
      blocks,
    };
  });

  return {
    program: {
      program_type: programType,
      schema: `program_${programType}_v1`,
      days_per_week: daysPerWk,
      duration_mins: duration,
      days,
    },
    debug: { ... },
  };
}
```

The `fillSlot` function is extracted from the existing `slotToSelector` + exercise-selection logic in Step 01, made generic over `slotDef.mp`, `slotDef.sw`, `slotDef.sw2`, `slotDef.requirePref`.

---

### F.3 `02_segmentProgram.js` — new generic Step 02 (sketch)

```js
// api/engine/steps/02_segmentProgram.js
// Generic replacement for 02_segmentHypertrophy.js.
// Reads block_semantics from compiledConfig.

export async function segmentProgram({ program, compiledConfig }) {
  const { blockSemantics } = compiledConfig;
  const programType = program.program_type ?? "hypertrophy";

  const days = program.days.map(day => {
    const segments = groupBlocksIntoSegments(day.blocks, blockSemantics);
    return {
      ...day,
      day_type: day.day_type || programType,
      segments,
    };
  });

  return {
    program: {
      schema: `program_${programType}_v1_segmented`,
      duration_mins: program.duration_mins,
      days_per_week: program.days_per_week,
      days,
    },
    debug: { ... },
  };
}

function groupBlocksIntoSegments(blocks, blockSemantics) {
  // Group blocks by letter.
  const byLetter = groupBy(blocks, b => getBlockLetter(b.slot)); // A, B, C, D

  const segments = [];
  for (const [letter, exs] of Object.entries(byLetter)) {
    const sem = blockSemantics[letter] ?? { segment_type: "single", purpose: "accessory" };

    if (sem.segment_type === "single" || exs.length === 1) {
      for (const ex of exs) {
        segments.push({ segment_type: "single", purpose: sem.purpose, items: [ex] });
      }
    } else if (sem.segment_type === "superset") {
      const pair = exs.slice(0, 2);
      segments.push({ segment_type: "superset", purpose: sem.purpose, items: pair });
      for (const overflow of exs.slice(2)) {
        segments.push({ segment_type: "single", purpose: "accessory", items: [overflow] });
      }
    } else if (sem.segment_type === "giant_set") {
      const group = exs.slice(0, 3);
      segments.push({ segment_type: "giant_set", purpose: sem.purpose, items: group });
      for (const overflow of exs.slice(3)) {
        segments.push({ segment_type: "single", purpose: "accessory", items: [overflow] });
      }
    }
  }
  return segments;
}
```

This is a near-direct extraction of what `02_segmentHypertrophy.js` already does, parameterised by `blockSemantics`.

---

### F.4 `runPipeline.js` — changes required

```js
// REMOVE:
if (programType !== "hypertrophy") throw new Error(...);

// ADD (before Step 1):
const compiledConfig = await resolveCompiledConfig(dbClient, { programType, schemaVersion, request });

// Step 1 — dispatch
const step1Fn = programType === "hyrox"
  ? buildHyroxProgramStep           // future custom variant
  : buildProgramStep;               // new generic step 01

const step1 = await step1Fn({ inputs, request, compiledConfig });

// Step 2
const step2 = await segmentProgram({ program: step1.program, compiledConfig });

// Step 3 — fix hardcoded programType
const step3 = await applyProgression({
  program: step2.program,
  programType,                      // WAS: "hypertrophy"
  ...
  programGenerationConfigs: [compiledConfig._pgcRow].filter(Boolean),
  ...
});
```

---

## G. Anti-Patterns — What Not To Do

**1. Don't filter `getAllowedExercises` by program type.**
`preferred_in_json` is a selection hint, not an eligibility gate. A barbell squat is eligible for both hypertrophy and strength. Filtering by `preferred_in_json` as a hard gate would silently reduce the exercise pool for new program types before you've audited catalogue coverage. Use it only as a scoring preference inside Step 01's `fillSlot`.

**2. Don't create a separate Postgres table for day templates.**
`day_templates` is config, not operational data. It doesn't need its own table, its own migrations, or its own CRUD endpoints. Keep it in the `program_generation_config_json` JSONB blob. One row = one complete program type definition.

**3. Don't try to express Hyrox via the generic template system.**
Hyrox stations are prescribed (you don't pick from a pool — there are specific exercises at each station). A config template system based on movement pattern hints and swap groups is the wrong model for Hyrox. Write a dedicated `01_buildHyroxProgram.js` instead and dispatch to it explicitly. Don't contort the generic system trying to fit it.

**4. Don't add new `program_type` values to the `runPipeline` guard before writing the config.**
The existing guard (`if (programType !== "hypertrophy") throw`) exists as a safety net. When removing it, immediately add validation in `resolveCompiledConfig` that throws if the resolved config's `dayTemplates` is empty — so you fail loudly if a config row is missing, not silently produce a broken program.

**5. Don't rename or remove the A/B/C/D block letter system from Step 01/02.**
The block letters are a useful structural alphabet. Downstream code (`02_segmentProgram.js`, `getBlockLetter`) depends on them. The letters themselves are cheap — their semantics (what segment type they produce) are what varies by program type, and that's what goes in `block_semantics` config. Don't conflate renaming the letters with making them configurable.

**6. Don't try to make `block_semantics` fully polymorphic for conditioning in Phase 1.**
Conditioning programs may eventually need new segment types (`"emom"`, `"amrap"`, `"tabata"`). Don't try to design for these in the Phase 1 strength refactor. Add `"single"` and `"superset"` support generically (which you already need), and leave conditioning-specific segment types for when you actually build conditioning. Designing now for segment types you can't yet test is premature.

**7. Don't write a new runPipeline function for each program type.**
There is one pipeline. Different program types are different configurations of the same pipeline. The single dispatch point (`step1Fn = programType === "hyrox" ? ... : ...`) is sufficient.

**8. Don't add program type as a filter in narration templates without auditing coverage.**
Step 05 narration templates match by `program_type`. If you add `"strength"` as a new program type but forget to seed strength narration templates, you'll get silent gaps (no narration on strength programs). This isn't a runtime error — it's a silent quality failure. Always add narration templates and rep rules together with the PGC row as a unit.

---

## Implementation Order (recommended)

1. **Phase 0** — Populate config, add `resolveCompiledConfig.js`, refactor `runPipeline.js` (remove guard, thread config). Hypertrophy behaviour unchanged. **Deploy + verify existing tests pass.**

2. **Phase 1a** — Refactor Step 01 and Step 02 to read from `compiledConfig`, with hypertrophy hardcoded values as fallback. **Deploy + verify hypertrophy still works.**

3. **Phase 1b** — Write the strength PGC seed row, strength rep rules, strength narration templates. Remove the fallback hardcoding once tests confirm strength works. **Deploy.**

4. **Phase 2+** — Conditioning, then Hyrox (custom step variant), in separate sprints.
