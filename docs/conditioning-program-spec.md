# Conditioning Program Type — Implementation Specification

**Status:** Proposal for Codex implementation
**Author:** Principal Engineer review, 2026-03-07
**Scope:** New `conditioning` program type across the full pipeline

---

## A. Codebase Findings

### A.1 Exercise Selection (Step 1)

**File:** `api/engine/steps/01_buildProgramFromDefinition.js`

Movement class exclusion is currently **hardcoded** at lines 207–217:
```javascript
const excludeMovementClasses = ["cardio", "conditioning", "locomotion"]
```
This unconditionally prevents all engine, locomotion, and conditioning-class exercises from being selected in any program. Conditioning requires inverting this — the config already has an `exclude_movement_classes` field in `builder` (surfaced by `resolveCompiledConfig`) but Step 1 ignores it and uses the hardcoded constant.

**Fix is one-line:** replace the hardcoded constant with `compiledConfig.builder.excludeMovementClasses ?? ["cardio","conditioning","locomotion"]`. This is fully backward-compatible; existing hypertrophy/strength configs already seed this field with those three values.

**Selector state** (`builderState` object, lines 266–271): currently tracks `usedIdsWeek`, `usedSw2Today`, `usedRegionsToday`, `stats`. No conditioning-specific state exists yet.

**File:** `api/engine/exerciseSelector.js`

`isConditioning(ex)` (lines 70–90) already exists and detects engine/conditioning exercises by movement pattern, swap group, or name. The scoring function `pickBest()` (lines 135–202) uses these exact point values:

| Criterion | Points |
|-----------|--------|
| `sw2` match | +12 |
| `sw` match | +10 |
| `mp` match | +4 |
| Movement class preference (compound/isolation) | +1.5 |
| `preferLoadable` satisfied | +1.0 / −0.1 |
| Region overlap (≥2 regions used) | −1.5 |
| Region overlap (1 region used) | −0.3 |
| `density_rating == 1` | +0.2 |
| `complexity_rank == 1` | +0.05 |

`density_rating` and `complexity_rank` are **already in the scoring formula** but weighted almost negligibly (+0.2, +0.05). For conditioning they should carry much more weight in the sequence layer (see Section D).

`impact_level` exists in the `exercise_catalogue` schema (V4 migration, column 19) and is already loaded into the exercise index. It is **not currently used in scoring at all**.

**File:** `api/engine/selectorStrategies.js`

Single strategy: `best_match_by_movement` (lines 3–24). Auto-biases block A toward compound, block C toward isolation. This heuristic is reasonable for conditioning too — A blocks should prefer high-power/engine exercises, C blocks prefer carries or accessory work.

### A.2 Movement Class Filtering in Coverage Report

**File:** `api/src/routes/adminCoverage.js`, lines 108–109:
```sql
(ec.movement_class IS NULL
 OR ec.movement_class NOT IN ('cardio','conditioning','locomotion'))
```
This exclusion is also hardcoded in the SQL. For conditioning the coverage report will show zero eligible exercises in all conditioning slots until this is made config-aware. **This needs to be patched in Phase 2** — the coverage endpoint must accept a `program_type` param and conditionally suppress or invert the class filter.

### A.3 Segment Types (Step 2)

**File:** `api/engine/steps/02_segmentProgram.js`

Three types supported. The decision is made by `blockSemantics[letter].preferred_segment_type`.

**File:** `api/engine/configValidation.js`, lines 46–50:
```javascript
if (!["single","superset","giant_set"].includes(sem.preferred_segment_type)) {
  errors.push(...)
}
```
This is the exact hard whitelist. Adding `"amrap"` and `"emom"` requires updating this line **and** adding handling branches in Step 2.

### A.4 Step 6 Emitter — Key Discovery

**File:** `api/engine/steps/06_emitPlan.js`, lines 150–178

The emitter already handles `amrap` and `emom` segment types in its `score_type` logic:
```javascript
if (segType === "emom")  → score_type: "reps",   labels: ["Total reps","Reps per interval"]
if (segType === "amrap") → score_type: "rounds", labels: ["Rounds","Extra reps"]
```
**This means the mobile/Bubble downstream consumers already expect these types.** The emission layer is ready; only Step 2 validation and branching is missing. This significantly reduces the risk of introducing AMRAP and EMOM as proper segment types.

### A.5 Step 5 Narration

**File:** `api/engine/steps/05_applyNarration.js`

Template matching scores by (scope + field + purpose + segment_type). Conditioning needs new templates for:
- `program` scope: `PROGRAM_TITLE`, `PROGRAM_SUMMARY`, `PROGRESSION_BLURB`
- `day` scope: `DAY_TITLE`, `DAY_GOAL`
- `segment` scope: `SEGMENT_TITLE`, `SEGMENT_EXECUTION`, `SEGMENT_INTENT` — especially for `amrap` and `emom` segment types
- `exercise` scope: `CUE_LINE` (pacing/intensity cues, not form cues)

Day focus resolution (lines 118–137) currently maps slot keys to strength-oriented labels. Conditioning will need new focus mappings for `engine_primary`, `mixed_modal`, `aerobic_base` etc. — or accept the default.

### A.6 Config Validation

**File:** `api/engine/configValidation.js`

`selector_strategy` must be `"best_match_by_movement"` (line 78). No change needed — conditioning reuses the same strategy.

`preferred_segment_type` whitelist (line 47) must be extended to `["single","superset","giant_set","amrap","emom"]` in Phase 3.

---

## B. Recommended Conditioning v1 Design

### B.1 Program Architecture Philosophy

Conditioning should feel structurally different from hypertrophy. The session format follows a **high-low-metabolic** arc:
- **Block A:** Primary energy system stimulus (hardest, most specific)
- **Block B:** Density / structured circuit work
- **Block C:** Metabolic accessory (carries, mixed modal)
- **Block D:** Finisher or sustainable cooldown engine

This is not "hypertrophy but faster." It produces genuinely different workouts.

### B.2 Day Templates

Three day types provide variety across the week without forcing artificial variety:

**Day 1 — Power & Engine**
Focus: High-power outputs, brief but intense

| Slot | Block | sw2 | sw | mp | requirePref | Notes |
|------|-------|-----|----|----|-------------|-------|
| A:engine_power | A | `high_power` | `engine` | `cyclical_engine` | `conditioning_main` | Assault bike sprint, sled push, box jump |
| B:mixed_modal | B | `mixed_modal` | `engine` | `cyclical_engine` | `conditioning_main` | KB swing, wall ball, battle ropes |
| C:carry | C | — | `carry` | `carry` | — | Farmer carry, sled pull |
| D:finisher | D | `locomotion_explosive` | `locomotion` | — | `finisher` | Burpee, bear crawl |

**Day 2 — Mixed Modal & Circuits**
Focus: Work capacity, muscular endurance

| Slot | Block | sw2 | sw | mp | requirePref | Notes |
|------|-------|-----|----|----|-------------|-------|
| A:hinge_ballistic | A | `hinge_ballistic` | `hinge` | `hinge` | `conditioning_main` | KB swing (primary), pull-through |
| B:locomotion | B | `locomotion_explosive` | `locomotion` | `locomotion` | `conditioning_main` | Box jump, broad jump, lateral bound |
| C:engine_circuit | C | `mixed_modal` | `engine` | `cyclical_engine` | — | Row erg, ski erg short intervals |
| D:carry_unilateral | D | — | `carry` | `carry` | — | Single-arm carry, suitcase carry |

**Day 3 — Aerobic Base & Threshold**
Focus: Aerobic capacity, lower peak demand

| Slot | Block | sw2 | sw | mp | requirePref | Notes |
|------|-------|-----|----|----|-------------|-------|
| A:engine_sustained | A | `sustainable` | `engine` | `cyclical_engine` | `conditioning_main` | Rower, assault bike (aerobic), treadmill |
| B:engine_tempo | B | `sustainable` | `engine` | `cyclical_engine` | `conditioning_main` | Different sustainable engine, or same at different effort |
| C:lunge | C | — | `lunge` | `lunge` | — | Walking lunge, reverse lunge (active recovery) |
| D:core_antiext | D | — | `core` | `anti_extension` | — | Plank, dead bug (trunk chassis) |

> **Note on swap groups:** The catalogue must have matching `swap_group_id_2` values for `high_power`, `mixed_modal`, `sustainable`, `hinge_ballistic`, and `locomotion_explosive`. Validate this in the exercise catalogue before wiring slots. If these don't exist as sw2 values, use `sw` and `mp` as primary selectors instead and add sw2 in a later migration.

### B.3 Block Semantics (Segment Strategy)

For Phase 1, start conservatively:

```json
"block_semantics": {
  "A": { "purpose": "main",      "preferred_segment_type": "single" },
  "B": { "purpose": "secondary", "preferred_segment_type": "superset" },
  "C": { "purpose": "accessory", "preferred_segment_type": "giant_set" },
  "D": { "purpose": "accessory", "preferred_segment_type": "single" }
}
```

In Phase 3, after AMRAP/EMOM are added:

```json
"block_semantics": {
  "A": { "purpose": "main",      "preferred_segment_type": "amrap" },
  "B": { "purpose": "secondary", "preferred_segment_type": "emom" },
  "C": { "purpose": "accessory", "preferred_segment_type": "giant_set" },
  "D": { "purpose": "accessory", "preferred_segment_type": "single" }
}
```

### B.4 Duration / Volume Structure

```
sets_by_duration:
  "40": { "A": 2, "B": 2, "C": 2, "D": 1 }   // 7 total slots → trim by block_budget
  "50": { "A": 3, "B": 2, "C": 2, "D": 1 }   // 8 total slots
  "60": { "A": 3, "B": 3, "C": 2, "D": 2 }   // 10 total slots

block_budget:
  "40": 4,   // Take only first 4 slots from ordered_slots
  "50": 4,   // Take first 4
  "60": 4    // Take all 4 (or add 5th if needed)
```

**Session feel by duration:**
- **40 min:** One primary engine block (A), one density block (B/C), no finisher. Fast, focused.
- **50 min:** Primary engine + density circuit + carry. Leaves time for a proper warm-up.
- **60 min:** Full structure — primary, density, accessory, finisher.

Conditioning sets are not "sets of 10" — A-block is likely 1–2 long efforts or interval structures. The `sets` value here controls rounds of the interval, not traditional sets. Rep rules will translate these into timed prescriptions.

### B.5 Rep Rule Strategy

**Minimum viable rule set for launch:**

| rule_id | program_type | priority | purpose | segment_type | sw2/mp | rep_low | rep_high | reps_unit | rest_sec | Notes |
|---------|-------------|----------|---------|--------------|--------|---------|---------|-----------|----------|-------|
| `cond_global_fallback_v1` | conditioning | 1 | — | — | — | 10 | 15 | reps | 60 | Catch-all |
| `cond_main_single_v1` | conditioning | 5 | main | single | — | — | — | seconds | 90 | Time-based effort |
| `cond_main_high_power_v1` | conditioning | 10 | main | single | `high_power` | 5 | 8 | reps | 120 | Sprint/explosive intervals |
| `cond_main_sustained_v1` | conditioning | 10 | main | single | `sustainable` | — | — | seconds | 0 | LISS — no rep count |
| `cond_main_hinge_ballistic_v1` | conditioning | 10 | main | single | `hinge_ballistic` | 10 | 15 | reps | 90 | KB swing primary |
| `cond_sec_superset_v1` | conditioning | 5 | secondary | superset | — | 8 | 12 | reps | 60 | Circuit pairs |
| `cond_sec_emom_v1` | conditioning | 5 | secondary | emom | — | 5 | 8 | reps | 0 | EMOM — rest is in-minute |
| `cond_main_amrap_v1` | conditioning | 5 | main | amrap | — | 5 | 8 | reps | 0 | AMRAP — no external rest |
| `cond_acc_giant_set_v1` | conditioning | 5 | accessory | giant_set | — | 10 | 15 | reps | 45 | Metabolic circuit |
| `cond_acc_carry_v1` | conditioning | 8 | accessory | single | — | 20 | 30 | seconds | 45 | Timed carry |
| `cond_finisher_v1` | conditioning | 7 | accessory | single | — | 10 | 20 | reps | 30 | Short/intense finisher |

For AMRAP and EMOM: `rest_after_set_sec = 0` because rest is implicit (remaining minute for EMOM; none for AMRAP). The `rest_after_round_sec` on the segment carries the between-round rest.

---

## C. Recommended Engine Changes

### C.1 Config Validation (`configValidation.js`)

**Change:** Extend `preferred_segment_type` whitelist.

```javascript
// Current (line 47):
if (!["single","superset","giant_set"].includes(sem.preferred_segment_type))

// New:
if (!["single","superset","giant_set","amrap","emom"].includes(sem.preferred_segment_type))
```

Scope: 1 line. Zero risk to existing configs.

### C.2 Step 1 — Movement Class Filter

**Change:** Replace hardcoded exclusion with config-driven value.

```javascript
// Current (line 207):
const excludeMovementClasses = ["cardio", "conditioning", "locomotion"]

// New:
const excludeMovementClasses =
  compiledConfig.builder.excludeMovementClasses ?? ["cardio","conditioning","locomotion"]
```

Existing hypertrophy and strength configs already have `exclude_movement_classes: ["cardio","conditioning","locomotion"]` in their seed data. This change is entirely backward-compatible.

**Additionally:** The auto-bias in `selectorStrategies.js` (`preferCompound` for A blocks, `preferIsolation` for C blocks) should be suppressed for conditioning — or made configurable. For Phase 1, the simplest approach is to check `programType` in the strategy:

```javascript
// In selectorStrategies.js, best_match_by_movement:
const isConditioning = (compiledConfig?.programType === 'conditioning')
sel.preferCompound  = !isConditioning && slotDef.slot?.[0] === 'A'
sel.preferIsolation = !isConditioning && slotDef.slot?.[0] === 'C'
```

### C.3 Step 2 — Segmentation (`02_segmentProgram.js`)

**Phase 1:** No change (use `single`, `superset`, `giant_set` only).

**Phase 3 — Add AMRAP:**
```javascript
case "amrap": {
  // Same as giant_set grouping but emits segment_type: "amrap"
  // amrap has an implicit time cap — supply via rep rule or segment field
  // Treat as a single block; all exercises in the group become items
  const amrapItems = group.slice(0, 4)  // up to 4 exercises per AMRAP
  const rounds = deriveRounds(amrapItems)
  segments.push({
    segment_type: "amrap",
    purpose: sem.purpose,
    rounds,
    items: mkItems(amrapItems),
  })
  // Overflow to single
  group.slice(4).forEach(ex => segments.push(singleSegment(ex, sem.purpose)))
  break
}
```

**Phase 3 — Add EMOM:**
```javascript
case "emom": {
  // Each exercise in the group is assigned to a minute slot
  // Up to 4 exercises (4-minute EMOM block per round)
  const emomItems = group.slice(0, 4)
  const rounds = deriveRounds(emomItems)
  segments.push({
    segment_type: "emom",
    purpose: sem.purpose,
    rounds,           // = number of minutes × EMOM repeats
    items: mkItems(emomItems),
  })
  group.slice(4).forEach(ex => segments.push(singleSegment(ex, sem.purpose)))
  break
}
```

Key decision: **AMRAP and EMOM use the same grouping model as `giant_set`** (up to 3–4 exercises per segment). The only difference is `segment_type` and how the emitter and rep rules interpret the result. This is low-risk — minimal new Step 2 code.

### C.4 Step 4 — Rep Rules

No code changes. New rows in `program_rep_rule` with `program_type = 'conditioning'` are sufficient. The existing matching algorithm handles them correctly.

One important nuance: for time-based conditioning exercises (sustainable engines), set `rep_low = null`, `rep_high = null`, and `reps_unit = 'seconds'`. The narration layer can annotate with duration text ("Row for 10 minutes at conversational pace").

### C.5 Step 5 — Narration

No code changes to the engine. New rows in `narration_template` with appropriate `scope`, `field`, `purpose`, and `segment_type` values cover conditioning.

**Minimum template set:**
- `program` / `PROGRAM_TITLE` (conditioning)
- `program` / `PROGRAM_SUMMARY` (conditioning)
- `program` / `PROGRESSION_BLURB` (conditioning)
- `day` / `DAY_TITLE` (3 variants per day focus)
- `day` / `DAY_GOAL` (per day focus)
- `segment` / `SEGMENT_TITLE` (per purpose + segment_type)
- `segment` / `SEGMENT_EXECUTION` (amrap, emom, giant_set, superset — each needs distinct instructions)
- `exercise` / `CUE_LINE` (conditioning-flavoured: pace, effort level, breathing)

The day focus resolver (`api/engine/steps/05_applyNarration.js`, lines 118–137) should have conditioning-aware mappings added. Simple approach: add `engine_power`, `mixed_modal`, and `aerobic_base` keys mapping to conditioning-appropriate labels.

### C.6 Step 6 — Emitter

**No code changes required in Phase 1–3.** The emitter already handles `amrap` and `emom` in its `score_type` resolution (lines 150–178). These were anticipated.

The timing estimation logic (lines 367–436) uses `rep_high × tempo` to estimate exercise duration. For time-based conditioning items where `reps_unit = 'seconds'`, this estimate will be inaccurate. This is a cosmetic issue (it affects predicted session duration display only) — acceptable for Phase 1. Fix in Phase 4 if needed by checking `reps_unit` and using `rep_high` directly as seconds when unit is `'seconds'`.

### C.7 Admin Coverage Report

**Change needed in Phase 2:** The SQL in `adminCoverage.js` (lines 108–109) has a hardcoded movement class exclusion. It must be made program-type-aware:

```sql
-- Current (always excludes conditioning-class exercises):
AND (ec.movement_class IS NULL
     OR ec.movement_class NOT IN ('cardio','conditioning','locomotion'))

-- New approach: pass program_type as query param; invert for conditioning:
AND (
  $program_type = 'conditioning'
  OR ec.movement_class IS NULL
  OR ec.movement_class NOT IN ('cardio','conditioning','locomotion')
)
```

Without this fix the coverage report shows 0 eligible exercises for all conditioning slots, making it useless for catalogue management.

### C.8 Config Seed Data

Add to `migrations/R__seed_program_generation_config.sql`:

```sql
INSERT INTO program_generation_config (
  config_key, program_type, schema_version, is_active, total_weeks_default,
  progression_by_rank_json, program_generation_config_json
)
SELECT
  'conditioning_default_v1', 'conditioning', 1, true, 4,
  '{
    "beginner":     {"weekly_set_step": 0, "max_extra_sets": 0},
    "intermediate": {"weekly_set_step": 0, "max_extra_sets": 1},
    "advanced":     {"weekly_set_step": 1, "max_extra_sets": 2},
    "elite":        {"weekly_set_step": 1, "max_extra_sets": 2}
  }'::jsonb,
  '{ ... full config JSON per Section B ... }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM program_generation_config WHERE config_key = 'conditioning_default_v1'
);
```

---

## D. Sequence-Aware Exercise Selection

### D.1 Problem Statement

For conditioning, the order of exercises within a session matters in a way it does not for hypertrophy. Placing two `high_power` efforts back-to-back (e.g., sled push → box jump) is appropriate for elite athletes but dangerous for beginners. The engine should discourage this through soft scoring penalties, not hard bans.

### D.2 Additional Builder State

Extend the `builderState` object in Step 1 to carry conditioning-specific state. These fields are only populated and used when `programType === 'conditioning'`:

```javascript
builderState = {
  // Existing:
  usedIdsWeek: Set,
  usedSw2Today: Set,
  usedRegionsToday: Set,
  stats: { ... },

  // New — conditioning only:
  conditioning: {
    lastImpactLevel: null,           // impact_level of previous exercise (0–3)
    lastEngineRole: null,            // engine_role of previous exercise
    lastMovementClass: null,         // movement_class of previous exercise
    cumulativeImpactToday: 0,        // Running sum of impact_level across the session
    blockTransitionPending: false,   // Set to true when crossing a block letter boundary
    sequencePenaltyLog: [],          // Debug: list of penalties applied (for stats)
  }
}
```

Update these fields in Step 1's post-selection recording block (after each exercise is picked).

### D.3 Scoring Function

Add to `api/engine/selectorStrategies.js` (or a new `api/engine/conditioningScoring.js` module):

```javascript
/**
 * Returns a penalty score (≤ 0) for conditioning sequence stress.
 * Only called when programType === 'conditioning'.
 *
 * @param {object} candidate  — normalised exercise (id, den, cx, impact_level, engine_role, mc)
 * @param {object} condState  — builderState.conditioning
 * @param {number} rankValue  — 0=beginner, 1=intermediate, 2=advanced, 3=elite
 * @param {object} thresholds — from compiledConfig.builder.conditioningThresholds (optional)
 * @returns {number} penalty (0 or negative)
 */
export function scoreConditioningSequence(candidate, condState, rankValue, thresholds = {}) {
  const {
    adjacentHighPowerPenalty  = [-4, -3, -1.5, -0.5],   // per rank [beginner→elite]
    adjacentSameRolePenalty   = [-2, -1.5, -0.5, 0],
    cumulativeImpactSoftCap   = [6, 8, 10, 12],          // per rank
    cumulativeOverCapPenalty  = [-1.5, -1, -0.5, -0.2],  // per point over cap
    densityBonusMultiplier    = [0.5, 0.8, 1.2, 1.5],    // scale density bonus by rank
  } = thresholds

  let penalty = 0

  // 1. Adjacency: high_power → high_power
  if (condState.lastEngineRole === 'high_power' && candidate.engine_role === 'high_power') {
    penalty += adjacentHighPowerPenalty[rankValue] ?? -1.5
  }

  // 2. Adjacency: same engine_role (any role) repeated
  if (condState.lastEngineRole &&
      condState.lastEngineRole === candidate.engine_role &&
      condState.lastEngineRole !== 'sustainable') {  // sustained repetition is fine (LISS day)
    penalty += adjacentSameRolePenalty[rankValue] ?? -0.5
  }

  // 3. Cumulative impact soft cap
  const cap = cumulativeImpactSoftCap[rankValue] ?? 10
  const currentImpact = condState.cumulativeImpactToday
  const candidateImpact = candidate.impact_level ?? 0
  if (currentImpact >= cap) {
    penalty += (cumulativeOverCapPenalty[rankValue] ?? -0.5) * candidateImpact
  }

  // 4. Density bonus scaled by rank (elite athletes benefit more from dense exercises)
  const densityBonus = (candidate.den ?? 0) * (densityBonusMultiplier[rankValue] ?? 1.0)

  return penalty + densityBonus
}
```

### D.4 Integration into pickBest()

Add the conditioning sequence score inside `pickBest()` in `api/engine/exerciseSelector.js`:

```javascript
// After existing score calculation (line ~196), before return:
if (programType === 'conditioning' && condState) {
  score += scoreConditioningSequence(ex, condState, rankValue, thresholds)
}
```

This requires threading `programType`, `condState`, `rankValue`, and `thresholds` into `pickBest()`. The cleanest way: expand the existing `sel` object to carry these as optional fields (`sel.programType`, `sel.condState`, `sel.rankValue`, `sel.condThresholds`), defaulting to no-op if absent. No change to existing callers.

### D.5 State Update

After each exercise is selected in Step 1, update conditioning state:

```javascript
if (programType === 'conditioning' && builderState.conditioning) {
  const c = builderState.conditioning
  c.lastImpactLevel = ex.impact_level ?? 0
  c.lastEngineRole = ex.engine_role ?? null
  c.lastMovementClass = ex.mc
  c.cumulativeImpactToday += ex.impact_level ?? 0
}
```

Reset per-day fields (`lastImpactLevel`, `lastEngineRole`, `lastMovementClass`, `cumulativeImpactToday`) at the start of each day loop iteration. `usedIdsWeek` already resets per the existing week loop.

### D.6 Configurable Thresholds

Store thresholds in `program_generation_config_json.builder.conditioning_thresholds`. If absent, the function uses the defaults above. This avoids hardcoding rank sensitivity values in the engine while keeping the config simple enough for an admin editor.

Example (optional, can be omitted in Phase 1):
```json
"conditioning_thresholds": {
  "adjacent_high_power_penalty": [-4, -3, -1.5, -0.5],
  "adjacent_same_role_penalty":  [-2, -1.5, -0.5, 0],
  "cumulative_impact_soft_cap":  [6, 8, 10, 12],
  "cumulative_over_cap_penalty": [-1.5, -1, -0.5, -0.2],
  "density_bonus_multiplier":    [0.5, 0.8, 1.2, 1.5]
}
```

---

## E. Incremental Implementation Plan

### Phase 1 — Config Foundation (lowest risk, no engine changes)

**Goal:** End-to-end conditioning program generation using existing segment types.

**Deliverables:**

1. **`migrations/R__seed_program_generation_config.sql`** — Add `conditioning_default_v1` config row with:
   - `program_type = 'conditioning'`
   - `exclude_movement_classes: []`
   - Day templates for Day1/Day2/Day3 using `single`, `superset`, `giant_set` only
   - `block_semantics` as per Section B.3 (Phase 1 version)

2. **`api/engine/steps/01_buildProgramFromDefinition.js`** — Replace hardcoded `excludeMovementClasses` constant with `compiledConfig.builder.excludeMovementClasses ?? [...]`. One line change.

3. **`migrations/R__seed_program_rep_rules.sql`** — Add conditioning rep rules (global fallback + purpose-level + movement-specific per Section B.5).

4. **`migrations/R__seed_narration_templates.sql`** — Add minimum conditioning narration templates (program, day, segment scopes).

5. **`api/src/routes/adminCoverage.js`** — Make the movement class exclusion SQL conditional on `program_type`. Needed for the coverage report to work for conditioning slots.

**Validation:** Run full pipeline for a conditioning program. Confirm exercises are selected, segments formed, rep rules applied, narration populated. Check debug stats for fallback tier distribution.

**Risk:** Minimal. The `excludeMovementClasses` change is backward-compatible. No other existing code changes.

---

### Phase 2 — Catalogue Quality & Coverage

**Goal:** Ensure the exercise catalogue has sufficient conditioning exercises with correct fields.

**Deliverables:**

1. **`migrations/R__seed_exercise_catalogue.sql`** — Audit and complete conditioning exercises:
   - Ensure `swap_group_id_2` values match slot selectors (`high_power`, `sustainable`, `mixed_modal`, `hinge_ballistic`, `locomotion_explosive`)
   - Populate `impact_level` for all conditioning exercises (critical for Phase 4)
   - Populate `density_rating` (0–3)
   - Ensure `preferred_in_json` includes `"conditioning_main"` or `"finisher"` as appropriate
   - Ensure equipment slugs are accurate

2. **Admin coverage report** — Use the patched coverage report to verify ≥3 eligible exercises per slot/preset/rank combination for all conditioning day templates. Fix any gaps with new exercises or wider slot selectors.

**Validation:** Coverage report for `conditioning_default_v1` shows no zero-count slots for commercial_gym + rank 0–3.

---

### Phase 3 — AMRAP and EMOM Segment Types

**Goal:** Unlock conditioning-native session formats.

**Deliverables:**

1. **`api/engine/configValidation.js`** — Add `"amrap"` and `"emom"` to the `preferred_segment_type` whitelist.

2. **`api/engine/steps/02_segmentProgram.js`** — Add `amrap` and `emom` case branches (per Section C.3). These follow the same grouping model as `giant_set`.

3. **`migrations/R__seed_program_generation_config.sql`** — Update `conditioning_default_v1` block semantics to use `amrap` (Block A) and `emom` (Block B).

4. **`migrations/R__seed_program_rep_rules.sql`** — Add AMRAP and EMOM rep rule rows.

5. **`migrations/R__seed_narration_templates.sql`** — Add narration for `amrap` and `emom` segment types (execution instructions are meaningfully different: "Go until the clock stops" vs "Each minute, complete X reps, rest the remainder").

6. **Admin config editor** — Add `amrap` and `emom` to the `preferred_segment_type` dropdown in `api/admin/index.html`.

**Validation:** Generate a conditioning program, confirm AMRAP and EMOM segments appear, verify emitter output has correct `score_type` and labels.

**Risk:** Low. Step 6 emitter already handles both types. Step 2 code change is ~40 lines following existing pattern.

---

### Phase 4 — Sequence-Aware Scoring

**Goal:** Conditioning session quality improves via rank-sensitive sequencing.

**Deliverables:**

1. **`api/engine/conditioningScoring.js`** (new file) — `scoreConditioningSequence()` function.

2. **`api/engine/exerciseSelector.js`** — Wire conditioning score into `pickBest()` via optional fields on `sel`.

3. **`api/engine/selectorStrategies.js`** — Suppress compound/isolation auto-bias for conditioning; pass `condState`, `rankValue`, `thresholds` into `sel`.

4. **`api/engine/steps/01_buildProgramFromDefinition.js`** — Extend `builderState` with `conditioning` sub-object; update it after each exercise selection; reset per-day.

5. **`migrations/R__seed_program_generation_config.sql`** — Add `conditioning_thresholds` JSON block to `conditioning_default_v1` config (optional; engine uses defaults if absent).

**Validation:** Generate conditioning programs at rank 0 and rank 3. Confirm rank-0 programs avoid consecutive high-power exercises. Check `sequencePenaltyLog` in debug stats.

---

### Phase 5 — Optional / Later

These are improvements for after v1 is stable in production:

- **Ladder sets** as an execution modifier (`execution_mode: "ladder"`) on `single` segment items — narration-driven, no Step 2 changes
- **Timed emit fix** — update Step 6 timing estimate to respect `reps_unit = 'seconds'`
- **Multi-config conditioning** — `conditioning_home_gym_v1`, `conditioning_hiit_v1` etc. — pure config/seed work
- **Progression for conditioning** — currently set to `weekly_set_step: 0`. Later: increase interval count or duration per week rather than set count

---

## F. Risks, Anti-Patterns, and Trade-offs

### F.1 Anti-patterns to Avoid

**Do not introduce a new selection strategy.** The `best_match_by_movement` strategy with sequence scoring layered on top is the correct architecture. Creating a `best_match_conditioning` strategy would duplicate the entire selection engine for one program type.

**Do not hardcode rank thresholds in the engine.** Put them in `conditioning_thresholds` in the config JSON. The engine reads them; the config defines them. Scattered hardcoded rank logic is a maintenance problem.

**Do not make AMRAP and EMOM mutually exclusive with existing types.** They must coexist — a conditioning config might have Block A as `amrap`, Block C as `giant_set`, and Block D as `single`. The validation whitelist extension is the only gate.

**Do not use `impact_level` for hard exclusions.** It should only drive soft penalties. Hard exclusions cause `fills_add_sets` when the catalogue is sparse, producing empty-looking workouts.

**Do not skip Phase 2 (catalogue quality).** The selection engine is only as good as the data it works with. If `swap_group_id_2` values in slots don't match anything in the catalogue, every slot falls to tier 7 (allow_dup) and the workout quality collapses silently.

**Do not over-engineer the narration layer.** Conditioning narration doesn't need fundamentally different template matching logic — it just needs different text in the templates. Add rows to the DB, not new code paths.

**Do not introduce randomness.** The engine is intentionally deterministic. Conditioning variety should come from day template diversity and anti-repeat logic, not from random exercise selection.

### F.2 Known Risks

**Catalogue coverage risk (high priority):** The conditioning catalogue may be sparse. Phase 2 exists specifically to address this. Without it, slots will frequently fall to tier 6/7, producing repetitive workouts.

**`impact_level` data quality:** This field must be populated accurately for Phase 4 to work. If all exercises have `impact_level = 0`, the sequence scoring does nothing. Audit the seed data in Phase 2.

**Week dedup for conditioning:** The `usedIdsWeek` set prevents the same exercise appearing twice in a week. For a 3-day conditioning program with limited catalogue depth, this may force tier 7 (allow_dup) by Day 3. Consider reducing week-dedup strictness for conditioning to `usedIdsSameDay` only. This is a config-driven option to add in Phase 4.

**Sustainable engine slot on Day 3:** "Row for 10 minutes" has `rep_low = null`. Step 4 and Step 6 handle null reps gracefully (they produce empty strings). Narration templates must carry the timing instruction instead. This is a design constraint, not a bug.

**Admin config editor (index.html):** The `preferred_segment_type` dropdown will need `amrap` and `emom` options added after Phase 3. Without this, admins can't set these types through the UI (though they can via direct DB edit).

### F.3 Trade-offs Made

**Single strategy, not two:** Using the existing `best_match_by_movement` strategy with a conditioning scoring layer (rather than a dedicated strategy) means the conditioning scoring function is a no-op for hypertrophy/strength. Acceptable — the `if (programType === 'conditioning')` guard is clear and the dead-code cost is zero.

**AMRAP/EMOM as true segment types, not narration-only:** The emitter already anticipates these. Adding them as proper types gives the mobile app the correct `score_type` metadata. The alternative (narration-only cue like "AMRAP: do this for 10 minutes") would lose the structured logging interface. Verdict: true segment types are worth the small Step 2 addition.

**Ladder not a segment type:** A ladder (1-2-3-2-1 reps) is an execution modifier on a `single`, not a structural grouping. Making it a new segment type would complicate Step 2 for no benefit — the engine doesn't need to know whether it's a ladder to assign exercises to it. A future `execution_mode: "ladder"` field on items is the right extension point.

---

## G. Concrete Recommendations

### G.1 Day Slot Tables (Final Recommendation)

**Day 1 — Power & Engine**

| # | Slot | Block | sw2 | sw | mp | requirePref | preferLoadable | fill_fallback |
|---|------|-------|-----|----|----|-------------|----------------|---------------|
| 1 | A:engine_power | A | `high_power` | `engine` | `cyclical_engine` | `conditioning_main` | false | — |
| 2 | B:mixed_modal | B | `mixed_modal` | `engine` | `cyclical_engine` | `conditioning_main` | false | A:engine_power |
| 3 | C:carry | C | — | `carry` | `carry` | — | true | A:engine_power |
| 4 | D:finisher | D | — | `locomotion` | `locomotion` | `finisher` | false | B:mixed_modal |

**Day 2 — Mixed Modal**

| # | Slot | Block | sw2 | sw | mp | requirePref | preferLoadable | fill_fallback |
|---|------|-------|-----|----|----|-------------|----------------|---------------|
| 1 | A:hinge_ballistic | A | `hinge_ballistic` | `hinge` | `hinge` | `conditioning_main` | true | — |
| 2 | B:locomotion | B | `locomotion_explosive` | `locomotion` | `locomotion` | `conditioning_main` | false | A:hinge_ballistic |
| 3 | C:engine_circuit | C | `mixed_modal` | `engine` | `cyclical_engine` | — | false | A:hinge_ballistic |
| 4 | D:carry | D | — | `carry` | `carry` | — | true | B:locomotion |

**Day 3 — Aerobic Base**

| # | Slot | Block | sw2 | sw | mp | requirePref | preferLoadable | fill_fallback |
|---|------|-------|-----|----|----|-------------|----------------|---------------|
| 1 | A:engine_sustained | A | `sustainable` | `engine` | `cyclical_engine` | `conditioning_main` | false | — |
| 2 | B:engine_tempo | B | `sustainable` | `engine` | `cyclical_engine` | `conditioning_main` | false | A:engine_sustained |
| 3 | C:lunge | C | — | `lunge` | `lunge` | — | false | A:engine_sustained |
| 4 | D:core | D | — | `core` | `anti_extension` | — | false | B:engine_tempo |

### G.2 Block Semantics

**Phase 1 (launch):**
```json
"A": { "purpose": "main",      "preferred_segment_type": "single" },
"B": { "purpose": "secondary", "preferred_segment_type": "superset" },
"C": { "purpose": "accessory", "preferred_segment_type": "giant_set" },
"D": { "purpose": "accessory", "preferred_segment_type": "single" }
```

**Phase 3 (after AMRAP/EMOM):**
```json
"A": { "purpose": "main",      "preferred_segment_type": "amrap" },
"B": { "purpose": "secondary", "preferred_segment_type": "emom" },
"C": { "purpose": "accessory", "preferred_segment_type": "giant_set" },
"D": { "purpose": "accessory", "preferred_segment_type": "single" }
```

### G.3 Duration Structure

| Duration | A sets | B sets | C sets | D sets | Block budget | Session feel |
|----------|--------|--------|--------|--------|--------------|--------------|
| 40 min | 2 | 2 | 2 | 1 | 4 | Primary effort + circuit. No finisher. |
| 50 min | 3 | 2 | 2 | 1 | 4 | Primary + density + one carry. |
| 60 min | 3 | 3 | 2 | 2 | 4 | Full structure — primary, density, metabolic, finisher. |

### G.4 Segment Type Verdict

| Format | Recommendation | Rationale |
|--------|---------------|-----------|
| **AMRAP** | True segment type | Emitter already supports it. Mobile app gets correct score_type. Worth the Phase 3 Step 2 addition. |
| **EMOM** | True segment type | Same reasons as AMRAP. Distinct execution instruction ("go on the minute") requires its own narration. |
| **Ladder** | Item modifier (`execution_mode: "ladder"`) | Not a structural grouping. Engine doesn't need to know about ladders to assign exercises. Add `execution_mode` field to item output; narration and logging handle the rest. |
| **Drop set** | Item modifier (`execution_mode: "drop_set"`) | Same reasoning as ladder. |
| **Tabata** | EMOM with specific rep rules | A Tabata is 20s on / 10s off × 8 = EMOM with timed intervals. Express via rep rules (`reps_unit: "seconds"`, `rep_low: 20`, `rep_high: 20`, `rest_after_set_sec: 10`). No new type needed. |

---

*Last updated: 2026-03-07*
