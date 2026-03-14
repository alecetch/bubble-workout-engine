# Exercise Slot Assignment — Reference Architecture

**Scope:** How the workout engine selects exercises from the catalogue and assigns them to slots during program generation.

---

## 1. Overview

Exercise assignment is handled entirely in **Step 1** of the pipeline (`api/engine/steps/01_buildProgramFromDefinition.js`). By the time Step 1 runs, the eligible exercise set has already been computed. Step 1 iterates over every slot in every day template, scores all eligible candidates against the slot's selector criteria, picks the best match, and falls back gracefully when no ideal match exists.

The process is **deterministic given a fixed allowed-exercise list** — there is no random element. The same profile + config will always produce the same workout structure.

---

## 2. Pre-Step: Building the Eligible Exercise Set

**File:** `api/engine/getAllowedExercises.js`

Before the pipeline runs, a single SQL query reduces the full catalogue to only the exercises the user can be assigned:

```sql
SELECT exercise_id
FROM exercise_catalogue
WHERE is_archived = false
  AND min_fitness_rank <= $1                             -- rank gate
  AND NOT (contraindications_slugs && $2::text[])        -- injury gate
  AND equipment_items_slugs <@ $3::text[]                -- equipment gate
```

| Gate | Behaviour |
|------|-----------|
| **Rank** | `min_fitness_rank` on the exercise must be ≤ the user's `fitness_rank` (0–3) |
| **Injury** | Any overlap between exercise `contraindications_slugs` and user `injury_flags_slugs` excludes the exercise |
| **Equipment** | Every slug in `equipment_items_slugs` must be present in the user's owned equipment. An exercise with an empty equipment array is always eligible |

Step 1 additionally excludes the movement classes `cardio`, `conditioning`, and `locomotion` from the selection pool for strength slots.

---

## 3. Slot Definition Fields

Slots are defined inside `program_generation_config_json → builder → day_templates[].ordered_slots[]`.

| Field | Type | Purpose |
|-------|------|---------|
| `slot` | string | Identifier in format `LETTER:key` (e.g. `A:squat`, `C:calves`). The letter maps to a block in `segmentation.block_semantics`. |
| `sw2` | string | `swap_group_id_2` — the highest-specificity selector (+12 score). Identifies a movement family (e.g. `squat_compound`, `hinge_compound`). |
| `sw` | string | `swap_group_id_1` — secondary selector (+10 score). More specific than `mp` but broader than `sw2`. |
| `swAny` | string[] | Ordered list of `sw` alternatives. The engine tries each in turn. |
| `mp` | string | `movement_pattern_primary` — broadest movement matcher (+4 score). Falls back to this if `sw`/`sw2` fail. |
| `requirePref` | string \| null | If set, only exercises whose `preferred_in_json` array contains this value are considered at first pass. Relaxed if no match found. |
| `preferLoadable` | boolean | Adds +1.0 to score for exercises with `is_loadable = true`; −0.1 for non-loadable. |
| `fill_fallback_slot` | string \| null | If the slot cannot be filled, add a set to this named slot instead of leaving a gap. |
| `selector_strategy` | string | Must be `"best_match_by_movement"` (only supported strategy). |

---

## 4. Scoring Algorithm

**File:** `api/engine/exerciseSelector.js` — `pickBest()`

Every eligible exercise is scored against the active slot's selectors. The highest scorer wins.

```
score = 0

if exercise.swap_group_id_2 === slot.sw2     → +12
if exercise.swap_group_id_1 === slot.sw      → +10
if exercise.movement_pattern_primary === slot.mp → +4

if slot letter is 'A' (primary block) and exercise.movement_class === 'compound'   → +1.5
if slot letter is 'C' (accessory block) and exercise.movement_class === 'isolation' → +1.5

if slot.preferLoadable:
    if exercise.is_loadable                  → +1.0
    else                                     → −0.1

if target region already used today (1 region)  → −0.3
if target region already used today (2+ regions) → −1.5

if exercise.density_rating === 1             → +0.2
if exercise.complexity_rank === 1            → +0.05
```

Exercises already used **this week** (across all days) are unconditionally skipped before scoring.

---

## 5. Fallback Tier Chain

**File:** `api/engine/exerciseSelector.js` — `pickWithFallback()`

When `pickBest()` finds no exercise at the strictest constraint level, the engine progressively relaxes. The tiers, in order:

| Tier | Constraint | Tracked in stats as |
|------|-----------|---------------------|
| 1 | `sw2` + `requirePref` | `picked_sw2_pref` |
| 2 | `sw` (or each in `swAny`) + `requirePref` | `picked_sw_pref` |
| 3 | `mp` + `requirePref` | `picked_mp_pref` |
| 4 | `sw2` (pref relaxed) | `picked_sw2_relaxed` |
| 5 | `sw` / `swAny` (pref relaxed) | `picked_sw_relaxed` |
| 6 | `mp` (pref relaxed) | `picked_mp_relaxed` |
| 7 | All constraints off, duplicates allowed | `picked_allow_dup` |

The tier at which an exercise is actually selected is written to the generation stats object and surfaced in observability logs.

---

## 6. Anti-Repeat Logic

The engine operates three independent deduplication layers:

### 6a. Week-level deduplication
`state.usedIdsWeek` (a `Set`) is maintained across all days in the program week. Any exercise already used in the week is skipped by `pickBest()`. This prevents the same exercise appearing on Monday and Thursday.

### 6b. Swap-group-2 anti-repeat within a day
`state.usedSw2Today` tracks which `sw2` values have already been assigned within the current day. If a slot's requested `sw2` is already taken, `attemptAvoidRepeatSw2()` tries to find an alternative with the same `sw` or `mp` but a different `sw2`. This prevents, for example, two `squat_compound` exercises in the same session.

### 6c. Target region overlap penalty
`state.usedRegionsToday` accumulates the `target_regions_json` tags of every exercise placed so far in the day. Scoring applies a −0.3 penalty per region overlap (one region shared) and −1.5 for two or more regions shared. This is a soft penalty, not a hard exclusion — if no non-overlapping exercise exists, an overlapping one will still be selected.

---

## 7. When No Exercise Can Be Filled

If all seven tiers are exhausted and no exercise is found for a slot:

1. If the day has **no real exercises yet**, a seed exercise is attempted (`pickSeedExerciseForSlot`) — a relaxed, unconstrained pick to ensure the day is never completely empty.
2. If still no exercise, an `add_sets` instruction is emitted:
   - Target: `slot.fill_fallback_slot` if defined, otherwise the first real slot in the day, otherwise `"A:squat"`.
   - This tells Step 2 to add one extra set to the target slot rather than leaving a blank.

The coverage report highlights slots where this fallback fires frequently — these are genuine gaps in the catalogue.

---

## 8. Coverage Report — What Counts as Eligible

**File:** `api/src/routes/adminCoverage.js`

The coverage report pre-computes per-slot exercise counts for every combination of `(config_key, day_key, slot, preset, rank)`. An exercise is counted as eligible for a slot if:

```
is_archived = false
AND movement_class NOT IN ('cardio', 'conditioning', 'locomotion')
AND min_fitness_rank <= rank_value
AND equipment_items_slugs <@ preset_slugs          -- equipment gate
AND (
      slot is unconstrained (no sw/sw2/mp)          -- catch-all
   OR swap_group_id_1 = sw
   OR swap_group_id_2 = sw2
   OR swap_group_id_1 = ANY(swAny)
   OR movement_pattern_primary = mp
)
AND (requirePref IS NULL OR preferred_in_json @> to_jsonb(requirePref))
```

A count of **0** means the slot will always fail at runtime for that preset/rank combination. A count of **1** means there is no variation — the same exercise is always selected. The goal is ≥ 3 per slot/preset/rank combination.

---

## 9. Key Exercise Catalogue Fields Used in Selection

| Column | Alias in engine | Role |
|--------|----------------|------|
| `exercise_id` | `id` | Unique identifier |
| `movement_pattern_primary` | `mp` | Broadest selector |
| `swap_group_id_1` | `sw` | Secondary selector |
| `swap_group_id_2` | `sw2` | Primary (highest-specificity) selector |
| `preferred_in_json` | `pref` | Matched against slot `requirePref` |
| `movement_class` | `mc` | `compound`/`isolation` bias; `cardio` etc. excluded |
| `is_loadable` | `load` | Affects score when `preferLoadable` is set on slot |
| `equipment_items_slugs` | `eq` (slugs) | Pre-filter gate — must be subset of user equipment |
| `target_regions_json` | `tr` | Drives region-overlap penalty |
| `min_fitness_rank` | — | Pre-filter gate — must be ≤ user rank |
| `contraindications_slugs` | — | Pre-filter gate — must not overlap user injuries |
| `density_rating` | `den` | Minor score bonus (+0.2) |
| `complexity_rank` | `cx` | Minor score bonus (+0.05) |
| `engine_anchor` | — | Not used in slot selection; reserved |

---

## 10. Key File Map

| Concern | File |
|---------|------|
| Eligible exercise SQL filter | `api/engine/getAllowedExercises.js` |
| Step 1 — slot iteration loop | `api/engine/steps/01_buildProgramFromDefinition.js` |
| Scoring (`pickBest`) and fallback chain | `api/engine/exerciseSelector.js` |
| Strategy dispatch | `api/engine/selectorStrategies.js` |
| Slot field normalisation | `api/engine/steps/01_buildProgramFromDefinition.js` (`normalizeSlotDefinition`) |
| Config validation (slot schema) | `api/engine/configValidation.js` |
| Coverage report eligibility SQL | `api/src/routes/adminCoverage.js` |
| Pipeline entry point | `api/src/routes/generateProgramV2.js` |

---

## 11. Diagnostic Stats

Every program generation emits a stats object per day that captures which fallback tier was used per slot:

```
picked_sw2_pref      — ideal: sw2 + requirePref matched
picked_sw_pref       — sw + requirePref matched
picked_mp_pref       — mp + requirePref matched
picked_sw2_relaxed   — sw2 matched, pref ignored
picked_sw_relaxed    — sw matched, pref ignored
picked_mp_relaxed    — mp matched, pref ignored
picked_allow_dup     — week-dedup relaxed (low catalogue variety)
fills_add_sets       — slot unfillable, extra set added to sibling slot
avoided_repeat_sw2   — anti-repeat sw2 logic triggered
```

High counts in `picked_mp_relaxed`, `picked_allow_dup`, or `fills_add_sets` for a specific slot are the signal that the catalogue needs new exercises for that movement pattern or swap group.

---

## 12. Segment Type Assignment (Step 2)

**File:** `api/engine/steps/02_segmentProgram.js`

### 12.1 What Determines Segment Type

Segment type is **block-letter-driven, not exercise-driven**. The decision is made entirely by the `preferred_segment_type` value attached to each block letter in `segmentation.block_semantics` inside the config JSON.

```json
"segmentation": {
  "block_semantics": {
    "A": { "preferred_segment_type": "single",    "purpose": "main" },
    "B": { "preferred_segment_type": "superset",  "purpose": "secondary" },
    "C": { "preferred_segment_type": "giant_set", "purpose": "accessory" },
    "D": { "preferred_segment_type": "single",    "purpose": "accessory" }
  }
}
```

The exercise properties themselves have no bearing on whether it becomes a single, superset, or giant set. The slot's block letter is the only key.

### 12.2 Decision Logic

After Step 1, exercises are grouped by their block letter. Step 2 iterates each group and applies the following rules:

**`single`**
- Every exercise in the group becomes its own independent segment.
- Each segment has `rounds = exercise.sets`, `items = [exercise]`.

**`superset`**
- If the group has only 1 exercise → treated as `single`.
- If 2 or more exercises: the **first two** are combined into one superset segment. `rounds` is set to `max(sets)` across the pair, and each item is normalised to `sets: 1`.
- Any exercises beyond index 2 fall back to individual `single` segments.

**`giant_set`**
- If the group has only 1 exercise → treated as `single`.
- If 2 or more exercises: the **first three** are combined (capped at 3). `rounds = max(sets)` across the group, items normalised to `sets: 1`.
- Any exercises beyond index 3 fall back to individual `single` segments.

### 12.3 Output Structure

```
segment {
  segment_index:  int
  segment_type:   "single" | "superset" | "giant_set"
  purpose:        "main" | "secondary" | "accessory"
  rounds:         int
  items: [
    { ex_id, ex_name, slot, sets: 1 }
  ]
}
```

The `purpose` on the segment is taken from `block_semantics[letter].purpose`, not from the exercise itself.

### 12.4 Extension Analysis — AMRAP, EMOM, Ladder, etc.

The current architecture supports exactly three segment types, enforced as a hard whitelist in config validation. Extending to additional types is **architecturally feasible** but would require coordinated changes across multiple layers:

| Layer | Change Required |
|-------|----------------|
| **Config validation** (`configValidation.js`) | Add new string to the allowed enum. Currently: `"single" \| "superset" \| "giant_set"`. |
| **Step 2 — segmentation** | Add a new `case` branch to the decision logic. Define how many exercises are grouped (e.g., AMRAP and EMOM could group all exercises in the block; Ladders might stay single but carry a duration context). |
| **Step 4 — rep rules** | The `program_rep_rule` table has a `segment_type` column used as a matching key. New rules keyed to the new type would be needed to supply appropriate rep/timing prescriptions. |
| **Step 5 — narration** | Narration templates similarly match on `segment_type`. New templates would be needed. |
| **Step 6 — emitter** | The emitter serialises segment data to pipe-delimited rows. New fields (e.g., `amrap_duration_secs`, `emom_interval_secs`) would need to be added to the output schema and any downstream consumers (Bubble, mobile app). |
| **Admin config editor** | The UI `preferred_segment_type` dropdown would need the new option. |

**Type-specific design notes:**

- **AMRAP** — most naturally modelled as a `giant_set` variant where `rounds` is replaced by a time cap. A new `amrap_duration_secs` field on the segment would carry the intent. No structural change to grouping logic needed.
- **EMOM** — requires a per-interval duration per item (`emom_interval_secs`). Grouping can follow the same pattern as `superset` but with a time dimension instead of a rep prescription.
- **Ladder set** — a single exercise performed for ascending/descending rep counts. Best modelled as a `single` with a `ladder_scheme` field (e.g., `[1,2,3,2,1]`) rather than a new segment type.
- **Drop set / Rest-pause** — these are rep-execution modifiers on a `single`, not structural groupings. They are better expressed as fields on the item (e.g., `execution_mode: "drop_set"`) fed from a rep rule rather than as a new segment type.

**Recommended approach for extension:** Add the new type to the config enum and Step 2 logic first, keep the grouping model the same as the closest existing type, and express the new behaviour through additional fields on the segment/item object. This is the lowest-risk path and preserves backward compatibility with all downstream consumers that already handle the three existing types.

---

## 13. Rep Count Calculation (Step 4)

**Files:** `api/engine/steps/04_applyRepRules.js`, `api/src/services/repRules.js`

### 13.1 The `program_rep_rule` Table

Rep prescriptions are not hardcoded in the engine — they are stored as rows in `program_rep_rule` and loaded at runtime. Each row is a conditional rule: "for exercises that match these criteria, apply these rep/timing values."

**Schema (key columns):**

| Column | Type | Role |
|--------|------|------|
| `rule_id` | text | Human-readable unique identifier |
| `priority` | int \| null | Higher number = evaluated first. NULL sorts last. |
| `program_type` | text | **Mandatory match key** — `hypertrophy`, `strength`, etc. |
| `day_type` | text \| null | Optional — matches the day's type (e.g., `strength`) |
| `segment_type` | text \| null | Optional — `single`, `superset`, `giant_set` |
| `purpose` | text \| null | Optional — `main`, `secondary`, `accessory` |
| `movement_pattern` | text \| null | Optional — `squat`, `hinge`, `push_horizontal`, etc. |
| `swap_group_id_2` | text \| null | Optional — most specific movement key |
| `movement_class` | text \| null | Optional — `compound`, `isolation`, etc. |
| `equipment_slug` | text \| null | Optional — `barbell`, `dumbbells`, etc. |
| `rep_low` | int \| null | Minimum of prescribed rep range |
| `rep_high` | int \| null | Maximum of prescribed rep range |
| `reps_unit` | text \| null | `reps` or `seconds` |
| `rir_min/max/target` | int \| null | Reps in reserve (effort prescription) |
| `tempo_eccentric/pause_bottom/concentric/pause_top` | int \| null | Tempo in tenths of a second |
| `rest_after_set_sec` | int \| null | Rest between sets (within a segment) |
| `rest_after_round_sec` | int \| null | Rest between rounds (superset/giant_set) |
| `logging_prompt_mode` | text \| null | How the mobile app prompts for logging |
| `notes_style` | text \| null | Tone/style for any narration note |

### 13.2 Rule Loading and Sort Order

All active rules are fetched once per pipeline run (`is_active = true`) and sorted:

1. `priority DESC NULLS LAST` — explicit priority wins
2. `rule_id ASC` — alphabetical tiebreaker

### 13.3 Matching Algorithm

For each exercise item in the program, the engine builds a **context object** from the item's position in the program and the exercise's catalogue properties:

```
context = {
  program_type      ← from config (mandatory)
  schema_version    ← from config
  day_type          ← from the day's type
  segment_type      ← from the segment (single/superset/giant_set)
  purpose           ← from block_semantics via the segment
  movement_pattern  ← exercise.movement_pattern_primary
  swap_group_id_2   ← exercise.swap_group_id_2
  movement_class    ← exercise.movement_class
  equipment_slug    ← derived from exercise.equipment_json
  target_regions    ← exercise.target_regions_json
}
```

A rule **matches** if:
- `program_type` equals the context value (no wildcards — this is the only mandatory field)
- Every non-null optional field on the rule equals the corresponding context value (target_regions uses overlap rather than exact match)

Among all matching rules, the **best** is selected by:
1. `priority` (descending)
2. **Specificity score** (descending) — one point per non-null optional field on the rule. A rule specifying `purpose + movement_pattern + swap_group_id_2` (score 3) beats one specifying only `purpose` (score 1).
3. `rule_id` alphabetically as tiebreaker

### 13.4 Practical Matching Cascade

For a hypertrophy program's main-block single squat:

```
Try:  program_type=hypertrophy, purpose=main, segment_type=single,
      movement_pattern=squat, swap_group_id_2=squat_compound, ...

→ Best match: e.g. hyp_main_squat_v1 (priority 10, specificity 5)
  → 6–10 reps, 120s rest, RIR 2

No match at that level?
  → Fallback: context with movement_pattern/sw2/class/equipment blanked
  → Matches: hyp_main_default_v1 (priority 5, specificity 2)
  → 6–10 reps, 90s rest

Still no match?
  → hyp_global_fallback_v1 (priority 1, specificity 0)
  → 8–12 reps, 75s rest
```

### 13.5 How Values Are Written

The engine applies values using a **write-once** pattern — a field is only written if it is currently empty. This means more-specific rules applied first cannot be overwritten by broader fallback rules. The matched `rule_id` is always recorded on the item/segment for traceability.

Fields written to each **item**:
- `reps_prescribed` — formatted string, e.g. `"8–12"` or `"30 secs"`
- `reps_unit`, `rir_target`, `rir_min`, `rir_max`
- `tempo_prescribed` — formatted as `"eccentric-pause-concentric-pause"`, e.g. `"3-1-1-0"`
- `rest_after_set_sec`, `logging_prompt_mode`, `notes_style`
- `rep_rule_id` — the rule that matched (always overwritten for traceability)

Fields written to the **segment**:
- `rest_after_set_sec`, `rest_after_round_sec`
- `rep_rule_id`

### 13.6 Fallback When No Rule Matches

If both the exact-context pass and the blanked-context pass find no matching rule, the item receives no rep prescription and a warning is logged. This is a catalogue-configuration gap — it means the `program_rep_rule` table has no rule covering this `program_type` + context combination. The minimum mitigation is a global fallback rule: one row with only `program_type` set and all optional fields null.

### 13.7 Designing New Rep Rules

When adding exercises to new movement patterns, or launching a new `program_type`, the minimum set of rules needed is:

1. **Global fallback** — `program_type` only, all optionals null. Catches everything.
2. **Purpose-level defaults** — one rule per `purpose` value (`main`, `secondary`, `accessory`). Sets different rep ranges per block role.
3. **Segment-type overrides** — separate rules for `superset` and `giant_set` purposes (typically lower rest, slightly higher rep ranges).
4. **Movement-specific rules** — for movements that need bespoke prescriptions (e.g., calves at 15–20 reps, heavy compounds at 4–6 reps).

Rules are managed via the `R__seed_program_rep_rules.sql` repeatable migration. Adding a new row and re-running Flyway is sufficient — no code change required.

---

*Last updated: 2026-03-07*
