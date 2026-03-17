# Spec: Equipment-Aware Selection & Conditional Slot Logic

**Version:** 1.1
**Status:** Ready for implementation
**Audience:** Codex

---

## 1. Executive Summary

The current exercise selector cannot produce valid workouts for users with `no_equipment` or `minimal_equipment` presets because slot definitions are written for a fully-equipped gym and `requirePref` acts as a hard gate that silently eliminates all candidates. The result is FILL blocks (no exercise placed) in A and B slots — the highest-value positions in a workout.

This spec introduces three coordinated changes:

1. **Equipment profile** — the builder derives a coarse profile (`full` / `minimal` / `bodyweight`) from the user's equipment set and uses it to select the correct slot variant.
2. **Conditional slot variants** — a slot may declare multiple `variants`, each activated by an `equipment_profile` condition, replacing the current single hard definition.
3. **Soft preference mode** — `requirePref` becomes configurable as `"strict"` (current hard gate) or `"soft"` (score bonus), eliminating silent zero-candidate situations.

Supporting changes include new swap groups for pattern-level abstraction, a `strength_equivalent` flag on exercises, and catalogue additions for low-equipment exercises.

The changes are fully backward-compatible. Existing single-definition slots continue to work unchanged. New behaviour is opt-in at the slot level.

---

## 2. Problem Statement

### 2a. Symptom

Coverage report shows `no_equipment` and `minimal_equipment` columns are zero for virtually every A and B slot across `strength_default_v1` and `hypertrophy_default_v1`, at all fitness ranks.

### 2b. Root causes

**Root cause 1 — `requirePref` is a hard gate with no fallback**

Slot `A:squat` in `hypertrophy_default_v1`:
```json
{ "sw2": "squat_compound", "requirePref": "strength_main" }
```
The selector rejects any exercise that does not have `"strength_main"` in `preferred_in_json` before scoring begins. A goblet squat or air squat tagged with `"hypertrophy_secondary"` is discarded even though it would be a valid training choice for a minimal-equipment user.

The fallback chain (Steps 4–7 in `pickWithFallback`) eventually drops `requirePref`, but it never fires because Step 1 (`sw2 + requirePref`) returns null and Steps 4–6 (`sw2/sw/mp` without pref) require the exercise to also match `sw2: "squat_compound"` — a group that contains only barbell-based exercises. So the entire fallback chain returns null.

**Root cause 2 — `sw2` values encode equipment assumptions**

`squat_compound` contains only exercises requiring `{barbell}`. There is no swap group expressing "any squat-pattern exercise regardless of equipment". The slot has no way to ask for a lower-equipment substitute.

**Root cause 3 — slot definitions are not equipment-aware**

The same slot definition is used for a commercial-gym user (barbell available) and a bodyweight user (nothing available). There is no mechanism to say "if the user has a barbell, ask for `squat_compound`; if not, ask for anything with a squat pattern."

---

## 3. Goals

- **G1** — Produce at least 1 valid exercise for every A and B slot for `minimal_equipment` users across `strength` and `hypertrophy` configs.
- **G2** — Produce at least 1 valid exercise for every A and B slot for `no_equipment` users for bodyweight-viable program types.
- **G3** — Maintain existing behaviour for `commercial_gym` and `crossfit_hyrox_gym` presets exactly.
- **G4** — Existing configs without `variants` continue to work without modification.
- **G5** — Coverage score (as shown in admin UI) improves by ≥ 20 percentage points after implementation.
- **G6** — Debugging output explains which variant was chosen and why a candidate won.

---

## 4. Non-Goals

- Redesigning the conditioning or hyrox program types (they have separate slot definitions and separate coverage gaps).
- A full rewrite of `exerciseSelector.js` or `pickBest`.
- Changing the DB schema for `program_generation_config` (config remains JSON in a single column).
- Changing how equipment presets are stored in `equipment_items`.
- UI changes to admin coverage report (beyond what is already implemented).
- Personalised programme substitution per-user at exercise level.

---

## 5. Current-State Architecture Summary

### Selection pipeline (per slot)

```
runPipeline
  └─ Step 01: buildProgramFromDefinition
       ├─ resolveAllowedExerciseIds()      // SQL: rank + injury + equipment gate
       ├─ buildIndex(cat)                  // in-memory byId index
       ├─ allowedSet = pre-filter by excludeMovementClasses
       └─ for each slot in dayTemplate:
            └─ fillSlot(slotDef, catalogIndex, builderState)
                 └─ pickWithFallback(allowedSet, byId, sel, ...)
                      ├─ [0] attemptAvoidRepeatSw2
                      ├─ [1] sw2 + requirePref  (strict gate)
                      ├─ [2] sw/swAny + requirePref
                      ├─ [3] mp + requirePref
                      ├─ [4] sw2 only           (drops requirePref)
                      ├─ [5] sw/swAny only
                      ├─ [6] mp only
                      └─ [7] allow duplicates   (re-tries 1-6 ignoring usedWeek)
```

### Scoring in `pickBest`

| Condition | Delta |
|---|---|
| `sw2` match | +12 |
| `sw` match | +10 |
| `mp` match | +4 |
| No match (score = 0) | **rejected** |
| `requirePref` absent from exercise | **rejected before scoring** |
| `preferIsolation` (C-block) + isolation class | +1.5 |
| `preferCompound` (A-block) + compound class | +1.5 |
| `preferLoadable` + loadable | +1.0 |
| Target region overlap (1) | -0.3 |
| Target region overlap (2+) | -1.5 |
| Low density (den=1) | +0.2 |
| Low complexity (cx=1) | +0.05 |

### Slot definition (current)

```json
{
  "slot": "A:squat",
  "sw2": "squat_compound",
  "requirePref": "strength_main",
  "preferLoadable": true,
  "selector_strategy": "best_match_by_movement"
}
```

A slot has exactly one set of constraints. No equipment awareness.

### Relevant files

| File | Role |
|---|---|
| `api/engine/exerciseSelector.js` | `pickBest`, `pickWithFallback`, `pickSeedExerciseForSlot` |
| `api/engine/selectorStrategies.js` | `fillSlot`, `bestMatchByMovement` |
| `api/engine/steps/01_buildProgramFromDefinition.js` | day-building loop, `allowedSet` construction |
| `api/engine/getAllowedExercises.js` | SQL pre-filter |
| `migrations/R__seed_exercise_catalogue.sql` | Exercise catalogue seed |
| `migrations/R__seed_program_generation_config.sql` | Config seed (contains slot JSON) |

---

## 6. Proposed Architecture

### Overview

```
Builder receives clientProfile (includes equipment_items_slugs)
  │
  ├─ deriveEquipmentProfile(equipment_items_slugs)
  │    → "full" | "minimal" | "bodyweight"
  │
  └─ for each slot in dayTemplate:
       ├─ resolveSlotVariant(slotDef, equipmentProfile)
       │    → picks the best-matching variant (or uses slotDef as-is)
       │
       └─ fillSlot(resolvedSlot, catalogIndex, builderState)
            └─ pickWithFallback(..., prefMode)
                 ├─ "strict" → current behaviour (hard gate)
                 └─ "soft"   → score bonus instead of gate
```

The resolved slot is a plain slot definition — identical in structure to what the selector already receives. `fillSlot` and `pickBest` require minimal changes; the new logic sits in `resolveSlotVariant` and in the scoring path of `pickBest`.

---

## 7. Detailed Data Model Changes

### 7a. `exercise_catalogue` — new fields

#### `strength_equivalent` (MUST-HAVE)

```sql
ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS strength_equivalent BOOLEAN NOT NULL DEFAULT FALSE;
```

**Semantics:** `true` if this exercise produces a meaningful strength stimulus and is a valid substitute in strength-oriented A/B slots, even though it is not a classic barbell compound.

The `strength_equivalent` column is **mandatory** — it must be present on every exercise row (the column defaults to `FALSE`; set it explicitly to `TRUE` in the seed for qualifying exercises). Its use as a scoring bonus (+3) is **opt-in at the slot level** via `strength_equivalent_bonus: true` in a slot variant. It must NOT be omitted from any exercise seed row.

**Rules:**
- `true`: pistol squat, goblet squat (loaded), double DB front squat, KB deadlift, B-stance RDL, ring row (loaded), weighted push-up (weighted vest / loaded), feet-elevated push-up, inverted row (feet elevated), trap bar deadlift, hack squat, leg press
- `false`: air squat, bodyweight lunge, band pull-apart, seated calf raise

This is a boolean. It is NOT a replacement for `preferred_in_json`; it is additive scoring only. It MUST NOT act as a hard filter.

#### `swap_group_id_1` / `swap_group_id_2` — new values

No schema change required. New string values are added in the seed (see §7b).

### 7b. New swap groups

The following swap groups are introduced to support equipment-agnostic matching.

#### `sw` (swap_group_id_1) — primary swap group

Existing `sw` values remain unchanged. New additions:

| Group | Purpose | Example exercises |
|---|---|---|
| `squat_pattern` | Any squat-family exercise, any equipment | goblet squat, air squat, pistol squat, KB front squat, hack squat |
| `hinge_pattern` | Any hip-hinge exercise, any equipment | KB deadlift, KB RDL, single-leg RDL (BW), good morning |
| `push_horizontal_pattern` | Any horizontal push, any equipment | push-up variants, DB bench, machine chest press |
| `pull_horizontal_pattern` | Any horizontal pull, any equipment | inverted row, ring row, DB row, cable row |
| `push_vertical_pattern` | Any vertical push, any equipment | DB shoulder press, pike push-up, machine shoulder press |
| `pull_vertical_pattern` | Any vertical pull, any equipment | pull-up, ring row (vertical variant), lat pulldown, banded pull-down |
| `lunge_pattern` | Any lunge-family exercise, any equipment | reverse lunge BW, walking lunge, split squat BW, step-up |

#### `sw2` (swap_group_id_2) — movement rollup group

Existing `sw2` values remain unchanged. New additions:

| Group | Purpose | Relationship to existing |
|---|---|---|
| `squat_pattern_compound` | Rollup for any squat-pattern, compound or isolation | Broader than `squat_compound` (barbell only) |
| `hinge_pattern_compound` | Rollup for any hinge, compound or isolation | Broader than `hinge_compound` (barbell only) |
| `push_horizontal_any` | Rollup for all horizontal pushes | Broader than `push_horizontal_compound` |
| `pull_horizontal_any` | Rollup for all horizontal pulls | Broader than `pull_horizontal_compound` |

**Naming convention:** `*_compound` = barbell/machine compound. `*_pattern` = any equipment, same movement family.

#### Tagging existing exercises

The following existing exercises have their swap group values **overwritten** (via `ON CONFLICT DO UPDATE` in the seed). Because `swap_group_id_1` and `swap_group_id_2` are single-value string columns, an exercise can carry exactly one `sw` and one `sw2` at any time — the values below **replace** the previous values.

| exercise_id | Overwrite sw | Overwrite sw2 | Notes |
|---|---|---|---|
| `goblet_squat` | `squat_pattern` | `squat_pattern_compound` | **Conditional** — only reclassify if coverage gap persists after new exercises are added (see §16) |
| `double_db_front_squat` | `squat_pattern` | `squat_pattern_compound` | |
| `kb_rdl` | `hinge_pattern` | `hinge_pattern_compound` | |
| `single_leg_rdl` | `hinge_pattern` | `hinge_pattern_compound` | |
| `db_flat_press` | `push_horizontal_pattern` | `push_horizontal_any` | |
| `db_incline_press` | `push_horizontal_pattern` | `push_horizontal_any` | |
| `db_row` | `pull_horizontal_pattern` | `pull_horizontal_any` | |
| `ring_row` | `pull_horizontal_pattern` | `pull_horizontal_any` | |
| `db_shoulder_press` | `push_vertical_pattern` | (existing sw2 preserved) | |
| `walking_lunges` | `lunge_pattern` | (existing sw2 preserved) | |
| `bodyweight_reverse_lunge` | `lunge_pattern` | (existing sw2 preserved) | |

> **Constraint — single-value fields:** `swap_group_id_1` and `swap_group_id_2` are single-value string columns. An exercise carries exactly one `sw` value and one `sw2` value at any time. Broader matching across multiple groups is achieved via slot-side `swAny` (matches multiple `sw` values) and `sw2Any` (matches multiple `sw2` values) arrays, not by storing multiple values in catalogue fields.

> **Pattern groups vs compound rollup groups:** New pattern groups (`squat_pattern`, `hinge_pattern`, etc.) are assigned as `sw` (swap_group_id_1) values — either as overwrites on reclassified existing exercises, or as the primary `sw` on new catalogue entries. The existing `sw2` compound rollup groups (`squat_compound`, `hinge_compound`, etc.) are **NOT replaced** — they remain as the `sw2` value on full-equipment exercises and continue to be referenced by `"full"` equipment profile variants via `sw2: "squat_compound"`. Pattern-group exercises use the new broader `sw2` rollup values (`squat_pattern_compound`, `hinge_pattern_compound`, etc.) instead.

### 7c. Recommended catalogue additions (MUST-HAVE for `no_equipment` / `minimal_equipment` viability)

The following exercises MUST be added to the seed. Field-level production metadata is out of scope for this spec; the spec defines the structural tagging required for slot selection.

#### Squat pattern — bodyweight / minimal

| exercise_id | Name | equipment | sw | sw2 | pref | strength_equivalent | min_rank |
|---|---|---|---|---|---|---|---|
| `pistol_squat` | Pistol Squat | `{}` | `squat_pattern` | `squat_pattern_compound` | `["hypertrophy_secondary"]` | true | 2 |
| `assisted_pistol_squat` | Assisted Pistol Squat | `{}` | `squat_pattern` | `squat_pattern_compound` | `["hypertrophy_secondary"]` | true | 1 |
| `shrimp_squat` | Shrimp Squat | `{}` | `squat_pattern` | `squat_pattern_compound` | `["hypertrophy_secondary"]` | true | 2 |
| `cyclist_squat` | Cyclist Squat (Heels Elevated) | `{}` | `squat_pattern` | `squat_pattern_compound` | `["hypertrophy_secondary"]` | false | 0 |
| `landmine_squat` | Landmine Squat | `{barbell}` | `squat_pattern` | `squat_pattern_compound` | `["strength_main","hypertrophy_secondary"]` | true | 1 |

#### Hinge pattern — minimal

| exercise_id | Name | equipment | sw | sw2 | pref | strength_equivalent | min_rank |
|---|---|---|---|---|---|---|---|
| `kb_deadlift` | Kettlebell Deadlift | `{kettlebells}` | `hinge_pattern` | `hinge_pattern_compound` | `["strength_main","hypertrophy_secondary"]` | true | 0 |
| `db_rdl` | Dumbbell RDL | `{dumbbells}` | `hinge_pattern` | `hinge_pattern_compound` | `["strength_main","hypertrophy_secondary"]` | true | 1 |
| `bstance_rdl` | B-Stance RDL | `{dumbbells}` | `hinge_pattern` | `hinge_pattern_compound` | `["hypertrophy_secondary"]` | true | 1 |
| `bw_rdl` | Single-Leg Bodyweight RDL | `{}` | `hinge_pattern` | `hinge_pattern_compound` | `["hypertrophy_secondary"]` | false | 0 |

#### Push horizontal — minimal / bodyweight

| exercise_id | Name | equipment | sw | sw2 | pref | strength_equivalent |
|---|---|---|---|---|---|---|
| `weighted_pushup` | Weighted Push-Up | `{bodyweight}` | `push_horizontal_pattern` | `push_horizontal_any` | `["strength_main","hypertrophy_secondary"]` | true |
| `feet_elevated_pushup` | Feet-Elevated Push-Up | `{}` | `push_horizontal_pattern` | `push_horizontal_any` | `["hypertrophy_secondary"]` | false |
| `ring_pushup` | Ring Push-Up | `{rings}` | `push_horizontal_pattern` | `push_horizontal_any` | `["hypertrophy_secondary"]` | true |

#### Pull horizontal — minimal / bodyweight

| exercise_id | Name | equipment | sw | sw2 | pref | strength_equivalent |
|---|---|---|---|---|---|---|
| `inverted_row` | Inverted Row | `{}` | `pull_horizontal_pattern` | `pull_horizontal_any` | `["strength_main","hypertrophy_secondary"]` | true |
| `feet_elevated_inverted_row` | Feet-Elevated Inverted Row | `{}` | `pull_horizontal_pattern` | `pull_horizontal_any` | `["strength_main","hypertrophy_secondary"]` | true |
| `towel_row` | Towel Row | `{}` | `pull_horizontal_pattern` | `pull_horizontal_any` | `["hypertrophy_secondary"]` | false |

> Ring row (`ring_row`) already exists; update its `sw` to include `pull_horizontal_pattern` via the seed update.

---

## 8. Program Config Schema Changes

### 8a. Equipment profile derivation (builder-side, no config change required)

Equipment profile is **derived by the builder** from `clientProfile.equipment_items_slugs`, not passed explicitly. This avoids coupling the config to a concept the user never directly sets.

```
deriveEquipmentProfile(slugs):
  if slugs contains any of {barbell, trap_bar, hack_squat, leg_press, cable}:
    return "full"
  if slugs contains any of {dumbbells, kettlebells, sandbag}:
    return "minimal"
  return "bodyweight"
```

This classification is intentionally coarse. Edge cases (e.g. user has only a cable machine) resolve conservatively. The profile is used only for variant selection, not as a hard filter on exercise eligibility.

### 8b. Slot definition — extended schema

The current slot object gains two optional fields:

```ts
SlotDefinition {
  // existing fields — all preserved
  slot: string
  sw?: string
  sw2?: string
  swAny?: string[]       // match any of these sw (swap_group_id_1) values
  sw2Any?: string[]      // match any of these sw2 (swap_group_id_2) values — NEW
  mp?: string
  requirePref?: string
  preferLoadable?: boolean
  selector_strategy?: string
  fill_fallback_slot?: string
  is_buy_in?: boolean

  // NEW — optional
  pref_mode?: "strict" | "soft"       // default: "strict"
  pref_bonus?: number                  // only used when pref_mode = "soft"; default: 4
  variants?: SlotVariant[]             // conditional overrides
}

SlotVariant {
  when: { equipment_profile: "full" | "minimal" | "bodyweight" }
  // any fields from SlotDefinition except slot and variants
}
```

### 8c. Variant resolution

When a slot has `variants`, the builder calls `resolveSlotVariant(slotDef, equipmentProfile)`:

```
resolveSlotVariant(slotDef, profile):
  candidates = slotDef.variants filtered to where variant.when.equipment_profile === profile
  if candidates is empty:
    return slotDef  // use base definition unchanged
  bestVariant = candidates[0]  // first match wins; variants are ordered by specificity
  return merge(slotDef, bestVariant, exclude=["when", "variants"])
```

**Merge semantics:** variant fields OVERWRITE base fields. Fields not present in the variant are inherited from the base. The `slot` name is always taken from the base.

**Default behaviour:** if no variant matches (including if `variants` is absent or empty), the base slot definition is used exactly as today. This preserves full backward compatibility.

### 8d. `pref_mode` semantics

| `pref_mode` | `requirePref` behaviour |
|---|---|
| `"strict"` (default) | Current behaviour: any exercise without the pref tag is rejected before scoring |
| `"soft"` | `requirePref` becomes a score bonus: exercises WITH the tag score `+pref_bonus` (default 4), exercises WITHOUT are still considered |

`pref_bonus` defaults to `4` — matching the score delta of an `mp` match, making a soft-pref match equivalent in weight to a movement pattern match. Implementors MAY adjust this value in config; `4` is the recommended default.

`allowPrefFallback` (legacy name, NICE-TO-HAVE) is an alias for `pref_mode: "soft"`. If both are present, `pref_mode` takes precedence.

### 8e. Full slot example with variants

```json
{
  "slot": "A:squat",
  "pref_mode": "strict",
  "preferLoadable": true,
  "variants": [
    {
      "when": { "equipment_profile": "full" },
      "sw2": "squat_compound",
      "requirePref": "strength_main"
    },
    {
      "when": { "equipment_profile": "minimal" },
      "swAny": ["squat_pattern"],
      "requirePref": "strength_main",
      "pref_mode": "soft",
      "pref_bonus": 4
    },
    {
      "when": { "equipment_profile": "bodyweight" },
      "swAny": ["squat_pattern"],
      "mp": "squat",
      "requirePref": "hypertrophy_secondary",
      "pref_mode": "soft",
      "strength_equivalent_bonus": true
    }
  ]
}
```

> **Note:** `squat_compound` is an `sw2` (swap_group_id_2) value — it must never appear inside `swAny`. The full variant reaches it via `sw2: "squat_compound"`. The minimal and bodyweight variants use `swAny: ["squat_pattern"]` to match `sw` (swap_group_id_1) values only. `squat_compound` exercises require a barbell and will not appear in the `allowedSet` for minimal/bodyweight users anyway, so there is no need to reference them in those variants.

---

## 9. Builder / Selection Algorithm Changes

### 9a. `01_buildProgramFromDefinition.js`

**Add:**
```
const equipmentProfile = deriveEquipmentProfile(
  clientProfile.equipment_items_slugs ?? []
);
```

**In slot loop, before `fillSlot`:**
```
const resolvedSlot = resolveSlotVariant(slotDef, equipmentProfile);
```

Pass `resolvedSlot` to `fillSlot` instead of `slotDef`.

Pass `equipmentProfile` into `builderState` so it is accessible downstream if needed.

### 9b. `selectorStrategies.js` — `bestMatchByMovement`

Add `sw2Any`, `prefMode`, `prefBonus`, and `strengthEquivalentBonus` to the selector object passed to `pickWithFallback`:

```js
const sel = {
  // existing fields ...
  sw2Any: resolvedSlot.sw2Any || null,      // NEW — array of sw2 values to match
  prefMode: resolvedSlot.pref_mode ?? "strict",
  prefBonus: resolvedSlot.pref_bonus ?? 4,
  strengthEquivalentBonus: resolvedSlot.strength_equivalent_bonus === true,
};
```

### 9c. `exerciseSelector.js` — `pickBest`

**Add `sw2Any` structural match (alongside existing `sw2` match):**

```
// NEW — sw2Any: score +12 for each matching sw2 value
if (sel.sw2Any && Array.isArray(sel.sw2Any)) {
  for (const v of sel.sw2Any) {
    if (exSw2 === v) { score += 12; break; }
  }
}
```

This block executes in the same position as the existing `if (sw2) { if (exSw2 === sw2) score += 12; }` check. A slot should use EITHER `sw2` (single value) OR `sw2Any` (array), not both. `swAny` must ONLY be used for `sw` (swap_group_id_1) values — never pass `sw2` group names to `swAny`.

**Change the `requirePref` handling:**

```
// CURRENT (strict only):
if (requirePref && !hasPref(ex, requirePref)) continue;

// NEW:
const hasPrefMatch = requirePref ? hasPref(ex, requirePref) : true;
if (requirePref && sel.prefMode === "strict" && !hasPrefMatch) continue;
// (if soft, hasPrefMatch is used for scoring below)
```

**Add to scoring block:**
```
// Soft pref bonus
if (requirePref && sel.prefMode === "soft" && hasPrefMatch) {
  score += sel.prefBonus ?? 4;
}

// strength_equivalent bonus (MUST-HAVE, applied when slot requests it)
if (sel.strengthEquivalentBonus && ex.strength_equivalent === true) {
  score += 3;
}
```

**Complete updated scoring table:**

| Condition | Delta | Notes |
|---|---|---|
| `sw2` match | +12 | unchanged |
| `sw2Any` match (any element matches `ex.sw2`) | +12 | NEW — do NOT use `swAny` for sw2 values |
| `sw` match | +10 | unchanged |
| `swAny` match (any element matches `ex.sw`) | +10 | unchanged |
| `mp` match | +4 | unchanged |
| score = 0 (no sw2/sw2Any/sw/swAny/mp match) | rejected | unchanged |
| `requirePref` present, `pref_mode: strict`, no match | rejected | unchanged |
| `requirePref` present, `pref_mode: soft`, match | +4 (configurable) | NEW |
| `strength_equivalent = true` (when `strengthEquivalentBonus` active) | +3 | NEW |
| `preferIsolation` + isolation class | +1.5 | unchanged |
| `preferCompound` + compound class | +1.5 | unchanged |
| `preferLoadable` + loadable | +1.0 | unchanged |
| Region overlap 1 | -0.3 | unchanged |
| Region overlap 2+ | -1.5 | unchanged |
| Low density (den=1) | +0.2 | unchanged |
| Low complexity (cx=1) | +0.05 | unchanged |

### 9d. `pickWithFallback` — no structural change required

The fallback chain remains unchanged. When `pref_mode: soft` is used, Steps 1–3 (which pass `requirePref` to `pickBest`) will now return results even when no exercise has the exact pref — eliminating the silent fall-through to Steps 4–6. Steps 4–6 remain as backstop for cases where even soft-pref produces nothing.

### 9e. New functions to add

#### `deriveEquipmentProfile(slugs: string[]): "full" | "minimal" | "bodyweight"`

```
function deriveEquipmentProfile(slugs) {
  const s = new Set(slugs);
  const fullMarkers = ["barbell", "trap_bar", "hack_squat", "leg_press", "cable"];
  const minimalMarkers = ["dumbbells", "kettlebells", "sandbag", "rings"];
  if (fullMarkers.some(m => s.has(m))) return "full";
  if (minimalMarkers.some(m => s.has(m))) return "minimal";
  return "bodyweight";
}
```

Add to `01_buildProgramFromDefinition.js` (or a shared `equipmentProfile.js` utility if preferred).

#### `resolveSlotVariant(slotDef, equipmentProfile)`

```
function resolveSlotVariant(slotDef, profile) {
  const variants = slotDef.variants;
  if (!Array.isArray(variants) || variants.length === 0) return slotDef;
  const match = variants.find(v => v.when?.equipment_profile === profile);
  if (!match) return slotDef;
  const { when, ...variantFields } = match;
  return { ...slotDef, ...variantFields };
}
```

Add to `01_buildProgramFromDefinition.js`.

### 9f. Candidate admission and scoring precedence

Every call to `pickBest` processes candidates through the following ordered pipeline. Codex MUST implement each stage in this exact order:

```
Stage 1 — allowedSet gate
  Candidate must be in allowedSet (pre-filtered by SQL: active status, fitness rank, injury flags,
  equipment compatibility). Candidates NOT in allowedSet are never seen by pickBest.

Stage 2 — Structural match required (score > 0)
  Candidate must score at least 1 point from the structural match block. Score is computed as:
    sw2Any match (any element matches ex.sw2)  → +12
    sw2 match (ex.sw2 === sel.sw2)             → +12
    swAny match (any element matches ex.sw)    → +10
    sw match (ex.sw === sel.sw)                → +10
    mp match (ex.mp === sel.mp)                → +4
  All structural terms are CUMULATIVE — an exercise can score across multiple terms simultaneously
  (e.g. sw2Any match +12 AND mp match +4 = +16 structural score). At most one sw2/sw2Any term and
  one sw/swAny term will fire per exercise (since ex.sw2 and ex.sw are single values), but the mp
  term always evaluates independently and stacks with either.
  If total structural score = 0 → candidate is rejected. No bonuses can rescue a zero-score candidate.

Stage 3 — Strict pref gate (if applicable)
  If sel.prefMode === "strict" (the default) AND sel.requirePref is set:
    If ex does NOT have sel.requirePref in preferred_in_json → candidate is rejected.
  If sel.prefMode === "soft" → this gate is skipped; pref match is handled in Stage 4 scoring.

Stage 4 — Scoring bonuses applied to surviving candidates
  soft pref match (prefMode=soft, pref present on ex)   → +sel.prefBonus (default 4)
  strength_equivalent (when strengthEquivalentBonus)    → +3
  preferIsolation + isolation movement_class            → +1.5
  preferCompound + compound movement_class              → +1.5
  preferLoadable + is_loadable                          → +1.0
  target region overlap (1 region)                      → -0.3
  target region overlap (2+ regions)                    → -1.5
  low density (den = 1)                                 → +0.2
  low complexity (cx = 1)                               → +0.05

Stage 5 — Winner selection
  Candidate with highest total score wins. Ties broken by iteration order of allowedSet
  (deterministic for a given catalogue state).
```

**Key invariants:**
- `sw2Any` and `swAny` are distinct: `sw2Any` matches against `ex.sw2`; `swAny` matches against `ex.sw`. Never pass `sw2` group names into `swAny` or vice versa.
- The structural match score (Stage 2) is computed BEFORE any rejection decisions. Reject only if the total is 0 after all structural terms are summed.
- The pref gate (Stage 3) runs AFTER structural scoring, so a candidate may be rejected even if it scored +12 on sw2 match.

### 9g. Debug logging

The builder MUST log the following at debug level for each slot:

```json
{
  "event": "slot_resolved",
  "slot": "A:squat",
  "equipment_profile": "minimal",
  "variant_matched": true,
  "resolved_sw2": null,
  "resolved_swAny": ["squat_pattern"],
  "resolved_sw2Any": null,
  "resolved_pref_mode": "soft"
}
```

And in `pickBest` (or its caller), when a winner is selected:

```json
{
  "event": "exercise_selected",
  "slot": "A:squat",
  "exercise_id": "goblet_squat",
  "score": 14.5,
  "sw2_match": false,
  "sw_match": true,
  "mp_match": false,
  "pref_match": true,
  "pref_mode": "soft",
  "strength_equivalent": true
}
```

---

## 10. Migration / Backward Compatibility Plan

### Rule 1 — Existing slots without `variants` are untouched

If a slot has no `variants` array, `resolveSlotVariant` returns the slot as-is. Zero behaviour change.

### Rule 2 — Existing `pref_mode` default is `"strict"`

The `pref_mode` field defaults to `"strict"` if absent. Existing `requirePref` usage is unchanged.

### Rule 3 — Swap group vocabulary is additive; exercise rows are single-valued and may be deliberately reclassified

New group names (`squat_pattern`, `hinge_pattern`, etc.) are additions to the vocabulary. They do not remove or rename existing group names like `squat_compound`. Any slot that currently references `sw2: "squat_compound"` continues to work unchanged.

Exercise rows, however, are single-valued: updating an exercise's `sw` or `sw2` **overwrites** the previous value. When an exercise is reclassified (e.g. `goblet_squat.sw: quad_iso_squat → squat_pattern`), it is **no longer reachable** by any slot targeting `sw: "quad_iso_squat"`. Before reclassifying any existing exercise, verify that no current slot definition references the exercise's previous group value, or that coverage under that group is intentionally being transferred to another exercise. Refer to §7b for the full reclassification table and the deliberate-reclassification note on `goblet_squat` in §16.

### Rule 4 — `strength_equivalent` column defaults to `false`

The migration adds the column with `DEFAULT FALSE`. All existing exercises score 0 from this field until explicitly tagged. No existing behaviour changes.

### Migration sequence

1. Run `V23__add_strength_equivalent_to_exercise_catalogue.sql`
2. Update `R__seed_exercise_catalogue.sql` with:
   - new exercises (pistol squat, inverted row, etc.)
   - updated `sw` / `sw2` values on existing exercises
   - `strength_equivalent = true` on qualifying exercises
3. Update `R__seed_program_generation_config.sql` with `variants` added to target slots
4. Deploy builder changes (`deriveEquipmentProfile`, `resolveSlotVariant`, `pickBest` scoring)
5. Run Flyway

Steps 1–2 and step 4 are independently deployable. The config change (step 3) only takes effect after the builder supports it (step 4).

---

## 11. Testing Plan

### Unit tests (write first)

All in `api/src/services/__tests__/` or `api/engine/__tests__/`.

| Test | Description |
|---|---|
| `deriveEquipmentProfile` | `["barbell"]` → `"full"`, `["dumbbells"]` → `"minimal"`, `[]` → `"bodyweight"`, `["barbell","dumbbells"]` → `"full"` |
| `resolveSlotVariant` — no variants | Returns slot unchanged |
| `resolveSlotVariant` — matching variant | Returns merged slot with variant fields overwriting base |
| `resolveSlotVariant` — no matching variant | Returns base slot (falls through to default) |
| `resolveSlotVariant` — variant merge semantics | Checks that `slot` name is preserved from base, and that absent variant fields inherit base values |
| `pickBest` — soft pref | Exercise WITHOUT pref is returned when `pref_mode: soft`; exercise WITH pref scores higher than one without |
| `pickBest` — strict pref | Exercise WITHOUT pref is never returned when `pref_mode: strict` |
| `pickBest` — strength_equivalent bonus | Exercise with `strength_equivalent: true` scores +3 when `strengthEquivalentBonus: true` in selector |
| `pickWithFallback` — soft pref produces result | Slot with `pref_mode: soft` and limited pool returns an exercise rather than null |
| Coverage integration: minimal equipment, squat slot | `deriveEquipmentProfile(["dumbbells"])` → `"minimal"` → squat variant resolves → goblet squat or double DB front squat is selected |
| Coverage integration: bodyweight, squat slot | `deriveEquipmentProfile([])` → `"bodyweight"` → bodyweight variant resolves → assisted pistol squat or cyclist squat is selected |
| Coverage integration: full equipment, squat slot | `deriveEquipmentProfile(["barbell"])` → `"full"` → compound variant resolves → barbell back squat is selected |

### Integration tests

- Generate full program for `minimal_equipment` profile: assert zero FILL blocks in A/B slots.
- Generate full program for `no_equipment` profile: assert zero FILL blocks in A/B slots.
- Generate full program for `commercial_gym`: assert identical output to pre-change baseline (regression).
- Coverage API returns ≥ 1 for `minimal_equipment_1` on all A/B slots in `hypertrophy_default_v1` and `strength_default_v1`.

### Regression test

Run the existing test suite in full. No existing tests should break.

---

## 12. Rollout Plan

### Phase 1 — Data (no behaviour change)

- Add `V23__add_strength_equivalent_to_exercise_catalogue.sql`
- Update exercise seed: new exercises + updated swap groups + `strength_equivalent` tags
- Run Flyway, verify via `qa:seeds`
- **Effect:** The catalogue pool becomes broader — more exercises are available in `allowedSet` per equipment preset. However, **slot-fill coverage does not visibly improve** (admin coverage counts do not change) until Phase 3 (builder variant resolution) and Phase 4 (config variants) are deployed, because existing slot definitions still target `squat_compound` / `hinge_compound` groups that pattern-group exercises do not match. Builder behaviour is unchanged.

### Phase 2 — Builder soft-pref support (backward-compatible)

- Implement `pref_mode` / `pref_bonus` in `pickBest`
- No config changes yet; default is `"strict"` so no programmes change
- Deploy, verify all existing tests pass
- **Effect:** Infrastructure ready; zero user-visible change.

### Phase 3 — Builder equipment profile + variant resolution

- Implement `deriveEquipmentProfile` and `resolveSlotVariant`
- Pass `equipmentProfile` through `builderState`
- Deploy, verify via integration tests
- **Effect:** Variant-aware. Still no change until configs are updated.

### Phase 4 — Config updates

- Update `R__seed_program_generation_config.sql` for `strength_default_v1` and `hypertrophy_default_v1` to add `variants` to A and B slots
- Run Flyway
- Verify coverage report: `minimal_equipment` and `no_equipment` columns green for A/B slots
- **Effect:** Programmes now generate valid exercises for low-equipment users.

### Phase 5 — Monitoring and cleanup

- Check admin coverage score improves by ≥ 20 percentage points
- Verify no increase in FILL block rate for `commercial_gym` / `crossfit_hyrox_gym`
- Remove any now-redundant fallback behaviour if confirmed safe

---

## 13. Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| Soft-pref causes wrong exercise for full-equipment users | Low | Full-equipment slots use `pref_mode: strict` via `"full"` variant |
| New exercises not yet in DB when config variant is deployed | Medium | Phase 1 (data) must precede Phase 4 (config). Flyway ordering enforces this |
| `deriveEquipmentProfile` misclassifies edge-case presets | Low | Classification is conservative; unknown equipment → `bodyweight` (too restrictive, not too permissive) |
| `strength_equivalent` bonus over-promotes low-stimulus exercises | Low | Bonus is +3 (small). Score must still pass sw/sw2/mp matching to be in candidate set |
| Variant merge semantics surprising to config authors | Low | Document clearly; provide worked examples in the config seed comments |
| Existing configs with no variants behave differently | None | `resolveSlotVariant` returns the base slot unchanged when `variants` is absent |

---

## 14. Open Questions

| # | Question | Recommended resolution |
|---|---|---|
| OQ1 | Should `equipment_profile` be exposed as a field on `program_day` in the output for debugging? | Yes, NICE-TO-HAVE. Add to `debug` object in Step 01 output. |
| OQ2 | Should `pref_mode` be settable at the config level (not slot level) as a default? | NICE-TO-HAVE. For now, set at slot level only to keep scope contained. |
| OQ3 | Should `squat_pattern` be in `sw` or `sw2`? | `sw` (primary). The slot uses `swAny: ["squat_pattern"]` to match sw values. The full-equipment variant uses `sw2: "squat_compound"` to match sw2 values. `swAny` and `sw2Any` are never mixed in the same lookup. |
| OQ4 | Is a `"moderate"` equipment profile needed (e.g. resistance bands + bodyweight)? | Deferred. The three-tier model handles the primary gap. Re-evaluate after rollout. |
| OQ5 | Should the coverage API report on variant coverage separately (e.g. count per profile tier)? | NICE-TO-HAVE. Deferred to a follow-up admin UI change. |
| OQ6 | Should `strength_equivalent` be graded (true/false) or scored (0.0–1.0)? | Boolean for now. Avoids premature complexity. Re-evaluate if scoring proves insufficient. |

---

## 15. Example Config Before / After

### Before — `A:squat` slot in `strength_default_v1`

```json
{
  "slot": "A:squat_strength",
  "sw2": "squat_compound",
  "requirePref": "strength_main",
  "preferLoadable": true
}
```

Result for `minimal_equipment` user: **0 candidates** (no exercise has `sw2: squat_compound` AND `strength_main` pref AND fits `{dumbbells}`).

### After — `A:squat` slot in `strength_default_v1`

```json
{
  "slot": "A:squat_strength",
  "preferLoadable": true,
  "variants": [
    {
      "when": { "equipment_profile": "full" },
      "sw2": "squat_compound",
      "requirePref": "strength_main",
      "pref_mode": "strict"
    },
    {
      "when": { "equipment_profile": "minimal" },
      "swAny": ["squat_pattern"],
      "requirePref": "strength_main",
      "pref_mode": "soft",
      "pref_bonus": 4,
      "strength_equivalent_bonus": true
    },
    {
      "when": { "equipment_profile": "bodyweight" },
      "swAny": ["squat_pattern"],
      "mp": "squat",
      "requirePref": "hypertrophy_secondary",
      "pref_mode": "soft",
      "strength_equivalent_bonus": true
    }
  ]
}
```

Result for `minimal_equipment` user with `{dumbbells}`: **`double_db_front_squat`** selected (sw: `squat_pattern`, pref: `strength_main`, `strength_equivalent: true`, score ≈ 10 + 4 + 3 = 17).

Result for `full` user with `{barbell}`: **`barbell_back_squat`** selected — identical to pre-change behaviour.

---

## 16. Example Catalogue Entries Before / After

### Before — `goblet_squat`

```json
{
  "exercise_id": "goblet_squat",
  "movement_pattern_primary": "squat",
  "swap_group_id_1": "quad_iso_squat",
  "swap_group_id_2": "squat_compound",
  "preferred_in_json": ["strength_main", "hypertrophy_secondary"],
  "equipment_items_slugs": ["dumbbells"],
  "min_fitness_rank": 1,
  "strength_equivalent": false
}
```

Matched by: `sw2: squat_compound` (score +12) but rejected by `requirePref: strength_main` under `pref_mode: strict` since it HAS `strength_main` ✓. Actually goblet squat already has `strength_main` — so it would pass strict pref. The issue is `min_fitness_rank: 1` blocking beginners.

### After — `goblet_squat` (updated)

```json
{
  "exercise_id": "goblet_squat",
  "movement_pattern_primary": "squat",
  "swap_group_id_1": "squat_pattern",
  "swap_group_id_2": "squat_pattern_compound",
  "preferred_in_json": ["strength_main", "hypertrophy_secondary", "hyrox_power"],
  "equipment_items_slugs": ["dumbbells"],
  "min_fitness_rank": 0,
  "strength_equivalent": true
}
```

Changes: `sw` updated to `squat_pattern`, `sw2` updated to `squat_pattern_compound`, `min_fitness_rank` lowered to 0 (goblet squat is appropriate for beginners), `strength_equivalent: true`.

> **Reclassification is conditional.** The `sw` overwrite (`quad_iso_squat → squat_pattern`) removes `goblet_squat` from the `quad_iso_squat` swap group. This reclassification should **only be applied if the coverage report still shows a gap for minimal/bodyweight squat slots after the new exercises** (`double_db_front_squat`, `pistol_squat`, `assisted_pistol_squat`, etc.) are added in Phase 1. If new exercises alone close the gap, leave `goblet_squat.sw` as `quad_iso_squat`. The `min_fitness_rank` correction (0) and `strength_equivalent: true` tag should be applied regardless.

### New — `inverted_row`

```json
{
  "exercise_id": "inverted_row",
  "name": "Inverted Row",
  "movement_class": "compound",
  "movement_pattern_primary": "pull_horizontal",
  "swap_group_id_1": "pull_horizontal_pattern",
  "swap_group_id_2": "pull_horizontal_any",
  "preferred_in_json": ["strength_main", "hypertrophy_secondary"],
  "equipment_items_slugs": [],
  "is_loadable": false,
  "min_fitness_rank": 0,
  "strength_equivalent": true,
  "target_regions_json": ["upper_back", "biceps"],
  "warmup_hooks": ["general_heat", "t_spine", "scap_pull"]
}
```

Why: fills `B:pull_horizontal` for any equipment preset. Matches `swAny: ["pull_horizontal_pattern"]` in the minimal/bodyweight variant. `strength_equivalent: true` because it is a genuine rowing stimulus.

---

## 17. Acceptance Criteria for Codex

The implementation is complete when ALL of the following pass:

| # | Criterion | How to verify |
|---|---|---|
| AC1 | `deriveEquipmentProfile(["dumbbells"])` returns `"minimal"` | Unit test |
| AC2 | `resolveSlotVariant` returns base slot when `variants` absent | Unit test |
| AC3 | `resolveSlotVariant` returns merged slot for matching profile | Unit test |
| AC4 | `pickBest` with `pref_mode: "soft"` returns a candidate without the pref tag | Unit test |
| AC5 | `pickBest` with `pref_mode: "strict"` never returns a candidate without the pref tag | Unit test |
| AC6 | Exercise with `strength_equivalent: true` scores 3 higher than identical exercise without it, when `strengthEquivalentBonus: true` | Unit test |
| AC7 | Full programme generation for `minimal_equipment` profile: zero FILL blocks in A/B slots for `strength_default_v1` | Integration test |
| AC8 | Full programme generation for `no_equipment` profile: zero FILL blocks in A/B slots for `hypertrophy_default_v1` | Integration test |
| AC9 | Full programme generation for `commercial_gym` profile: output identical to pre-change baseline (all A/B slots filled with same exercise types) | Regression test |
| AC10 | `qa:seeds` passes after all migration steps | CI pipeline |
| AC11 | Coverage report score increases by ≥ 20 percentage points after Phase 4 | Manual admin UI check |
| AC12 | Builder logs include `slot_resolved` event per slot with `equipment_profile` and `variant_matched` fields | Log inspection |
| AC13 | No existing unit tests regress | `npm test` |

---

## 18. Worked Examples

### Example 1 — Full equipment, strength lower day, A:squat

**User:** `commercial_gym`, rank 2 (Advanced)
**Equipment slugs:** `["barbell", "bench", "dumbbells", "cable", ...]`
**Derived profile:** `"full"` (barbell present)
**Resolved variant:**
```json
{ "sw2": "squat_compound", "requirePref": "strength_main", "pref_mode": "strict" }
```
**Candidate pool (filtered):** `barbell_back_squat`, `barbell_front_squat`, `hack_squat`, `leg_press`
**Winner:** `barbell_back_squat` — sw2 match (+12), strength_main pref (+0 strict), compound class +1.5, low density +0.2 = **score 13.7**
**Outcome:** Same as current behaviour. ✓

---

### Example 2 — Minimal equipment, hypertrophy lower day, A:squat

**User:** `decent_home_gym`, rank 1 (Intermediate)
**Equipment slugs:** `["dumbbells", "kettlebells", "bodyweight", "pullup_bar"]`
**Derived profile:** `"minimal"` (dumbbells present, no barbell)
**Resolved variant:**
```json
{
  "swAny": ["squat_pattern"],
  "requirePref": "strength_main",
  "pref_mode": "soft",
  "pref_bonus": 4,
  "strength_equivalent_bonus": true
}
```
**Candidate pool:** `goblet_squat` (sw: squat_pattern, pref: strength_main, strength_equivalent: true), `double_db_front_squat` (sw: squat_pattern, pref: strength_main, strength_equivalent: true)

**Scoring `goblet_squat`:**
- sw match (squat_pattern via swAny) → +10
- soft pref match (strength_main) → +4
- strength_equivalent bonus → +3
- preferCompound A-block + isolation class → +0 (goblet is isolation)
- **Total: 17**

**Winner:** `goblet_squat` (or `double_db_front_squat` — similar score; usedWeek tiebreak)
**Outcome:** Valid exercise placed. No FILL block. ✓

---

### Example 3 — Bodyweight only, strength-pattern substitution, B:pull_horizontal

**User:** `no_equipment`, rank 0 (Beginner)
**Equipment slugs:** `["bodyweight"]`
**Derived profile:** `"bodyweight"`
**Resolved variant:**
```json
{
  "swAny": ["pull_horizontal_pattern"],
  "mp": "pull_horizontal",
  "requirePref": "hypertrophy_secondary",
  "pref_mode": "soft",
  "strength_equivalent_bonus": true
}
```
**Candidate pool:** `inverted_row` (sw: pull_horizontal_pattern, pref: strength_main + hypertrophy_secondary, strength_equivalent: true, equipment: `[]`), `feet_elevated_inverted_row` (same)

**Scoring `inverted_row`:**
- sw match (pull_horizontal_pattern via swAny) → +10
- mp match (pull_horizontal) → +4
- soft pref match (hypertrophy_secondary) → +4
- strength_equivalent bonus → +3
- **Total: 21**

**Outcome:** `inverted_row` placed. User gets a genuine rowing stimulus with zero equipment. ✓

---

## Implementation Handoff for Codex

### Phased task list

#### Phase 1 — Data layer (implement and test independently)

1. Write `V23__add_strength_equivalent_to_exercise_catalogue.sql`
   - Adds `strength_equivalent BOOLEAN NOT NULL DEFAULT FALSE`
2. Update `migrations/R__seed_exercise_catalogue.sql`:
   - Add all new exercises from §7c (pistol squat, inverted row, etc.)
   - Update `swap_group_id_1` / `swap_group_id_2` on existing exercises from §7b tagging table
   - Set `strength_equivalent = true` on qualifying exercises (§7a)
   - Update `min_fitness_rank` where corrected (e.g. goblet squat to 0)
3. Run Flyway. Run `qa:seeds`. Confirm no failures.
4. Verify coverage API shows improved counts for `minimal_equipment` and `no_equipment` (even before builder changes).

#### Phase 2 — Builder: soft pref + strength_equivalent scoring

5. In `api/engine/exerciseSelector.js`, update `pickBest`:
   - Add `prefMode` / `prefBonus` to `sel` parameter handling
   - Change `requirePref` guard to respect `prefMode`
   - Add soft-pref score bonus
   - Add `strengthEquivalentBonus` score bonus (requires reading `ex.strength_equivalent`)
6. Write unit tests for `pickBest`:
   - AC4, AC5, AC6 from §17
7. In `api/engine/selectorStrategies.js`, pass `prefMode`, `prefBonus`, `strengthEquivalentBonus` from `slotDef` to `sel`.
8. Ensure `buildIndex` in `exerciseSelector.js` reads `strength_equivalent` from exercise rows.

#### Phase 3 — Builder: equipment profile + variant resolution

9. Add `deriveEquipmentProfile(slugs)` to `01_buildProgramFromDefinition.js`
10. Add `resolveSlotVariant(slotDef, profile)` to `01_buildProgramFromDefinition.js`
11. In the slot loop in `buildProgramFromDefinition`, call `resolveSlotVariant` before `fillSlot`
12. Pass `equipmentProfile` into `builderState`
13. Add `slot_resolved` debug log per slot
14. Write unit tests: AC1, AC2, AC3

#### Phase 4 — Config updates

15. Update `migrations/R__seed_program_generation_config.sql`:
    - Add `variants` to A and B slots in `strength_default_v1` and `hypertrophy_default_v1`
    - Use the schema from §8e; at minimum cover squat, hinge, push_horizontal, pull_horizontal slots
16. Run Flyway
17. Run integration tests: AC7, AC8, AC9

#### Phase 5 — Validation and cleanup

18. Run full test suite (`npm test`): AC13
19. Run `qa:seeds`: AC10
20. Check coverage report manually: AC11
21. Inspect builder logs for `slot_resolved` entries: AC12

---

### Files / modules likely to change

| File | Change type |
|---|---|
| `migrations/V23__add_strength_equivalent_to_exercise_catalogue.sql` | NEW |
| `migrations/R__seed_exercise_catalogue.sql` | UPDATE (new exercises, new swap groups, strength_equivalent) |
| `migrations/R__seed_program_generation_config.sql` | UPDATE (variants on A/B slots) |
| `api/engine/exerciseSelector.js` | UPDATE (pickBest: soft pref, strength_equivalent bonus) |
| `api/engine/selectorStrategies.js` | UPDATE (pass prefMode/prefBonus/strengthEquivalentBonus to sel) |
| `api/engine/steps/01_buildProgramFromDefinition.js` | UPDATE (deriveEquipmentProfile, resolveSlotVariant, slot loop) |
| `api/src/services/buildInputsFromDevProfile.js` | REVIEW ONLY (no expected changes, but verify `strength_equivalent` is passed through in exercise row mapping) |

---

### Test cases Codex must write first (before implementation)

Write these as failing tests, then implement to make them pass:

```
1. deriveEquipmentProfile(["barbell"]) === "full"
2. deriveEquipmentProfile(["dumbbells"]) === "minimal"
3. deriveEquipmentProfile([]) === "bodyweight"
4. deriveEquipmentProfile(["barbell", "dumbbells"]) === "full"  // barbell wins
5. resolveSlotVariant({slot:"A:squat"}, "minimal") returns slot unchanged (no variants)
6. resolveSlotVariant({slot:"A:squat", variants:[{when:{equipment_profile:"minimal"}, sw2:"x"}]}, "minimal").sw2 === "x"
7. resolveSlotVariant({slot:"A:squat", variants:[{when:{equipment_profile:"full"}, sw2:"x"}]}, "minimal").sw2 !== "x"  // no match, base used
8. pickBest with pref_mode:"soft", exercise without pref → not rejected, lower score
9. pickBest with pref_mode:"strict", exercise without pref → null
10. pickBest with strengthEquivalentBonus:true and ex.strength_equivalent:true → score +3 vs same ex with strength_equivalent:false
```

---

### Migration safeguards Codex must preserve

1. **Do not remove `requirePref` support.** `pref_mode` defaults to `"strict"`, which is identical to the current behaviour. Any slot without `pref_mode` set must behave exactly as today.

2. **Do not change the fallback chain order** in `pickWithFallback`. The chain structure must remain identical; only `pickBest` internal behaviour changes.

3. **Treat existing exercise reclassifications as conditional** (see §10 Rule 3 and §16). Adding new exercises (Phase 1) may be sufficient to close coverage gaps without touching existing exercises. Check the coverage report after Phase 1 data deployment. Only apply reclassifications from the §7b table to exercises marked **Conditional** if coverage gaps persist after new exercises are added. Unconditional reclassifications (all non-conditional rows in the §7b table) should always be applied. Document every reclassification with a comment in the seed explaining the reason and the previous value.

4. **`qa:seeds` must pass after every Flyway run.** Update the check counts in `check_seeds.mjs` to reflect new exercises before running CI.

5. **Do not add `variants` to conditioning or hyrox config slots** in Phase 4. Scope is `strength_default_v1` and `hypertrophy_default_v1` A/B slots only.

6. **The `strength_equivalent` column must have `DEFAULT FALSE`.** No existing exercise should change its selection behaviour unless explicitly tagged in the seed.

7. **Run the full test suite before and after each phase commit.** No phase should introduce a regression in any previously-passing test.
