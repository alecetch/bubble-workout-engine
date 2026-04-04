# Exercise Selection Requirement: Current Logic and Proposed Amendment

## Purpose

This document has two goals:

1. Summarise the current exercise-selection logic that is already implemented in code.
2. Capture the proposed amendment for review, so it is clear which parts are already coded and which parts would require a change.

This is a requirements document only. It does not implement any behaviour.

## Current Coded Behaviour

### Main runtime files

- [01_buildProgramFromDefinition.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/01_buildProgramFromDefinition.js)
- [selectorStrategies.js](/c:/Users/alecp/bubble-workout-engine/api/engine/selectorStrategies.js)
- [exerciseSelector.js](/c:/Users/alecp/bubble-workout-engine/api/engine/exerciseSelector.js)
- [variabilityState.js](/c:/Users/alecp/bubble-workout-engine/api/engine/variabilityState.js)
- [index.html](/c:/Users/alecp/bubble-workout-engine/api/admin/index.html)
- [exercise-slot-assignment.md](/c:/Users/alecp/bubble-workout-engine/docs/exercise-slot-assignment.md)
- [feature-merge-summary-2026-03.md](/c:/Users/alecp/bubble-workout-engine/docs/feature-merge-summary-2026-03.md)

### 1. Slot inputs used by selection

Each slot can currently carry:

- `mp`
- `sw`
- `sw2`
- `swAny`
- `sw2Any`
- `slot_family`
- `variability_policy`
- `requirePref`
- `pref_mode`

The slot family and variability policy are normalised in Step 01 and then passed into the selector flow.

### 2. What currently controls "simulation" selection behaviour

There are two separate day-level fields visible in the admin UI:

- `Day type`
- `Ordered simulation day`

Current code does not treat these as equivalent.

#### 2a. `day_type`

`day_type` is currently metadata. It is used downstream for things like rep-rule matching and output tagging, but it is not the switch that changes slot-selection anti-repeat behaviour.

In other words:

- setting `day_type = "simulation"` does not currently disable repeat avoidance
- setting `day_type = "simulation"` does not currently force exact station reuse

#### 2b. `is_ordered_simulation`

The real selection switch for ordered simulation behaviour is `is_ordered_simulation`.

When `is_ordered_simulation === true`, Step 01 uses the ordered simulation resolution path instead of the standard non-simulation `fillSlot(...)` path.

That ordered path affects:

- slot ordering
- station fallback resolution
- simulation metadata on the selected block

However, even in ordered simulation mode, the builder still carries `usedSw2Today`, and the normal anti-repeat machinery is still relevant unless a stronger reuse path bypasses it.

### 3. Current anti-repeat layers

The current engine applies multiple independent anti-repeat signals.

#### 3a. Week-level exact exercise dedupe

`usedIdsWeek` tracks exercise IDs already used in the week.

This is passed into selection and normally prevents the same exercise from being selected again in the same week.

There is one existing exception:

- `day_selection_mode = "benchmark_exactness"` can relax week-level exact-ID dedupe for that day by passing `usedIdsWeek = null` into the selector path

This is separate from variability policy.

#### 3b. Same-day exact-exercise anti-repeat

`usedIdsToday` tracks which exact exercise IDs have already been assigned in the current day.

The selector now uses a two-pass approach:

- first pass: avoid repeating an exact exercise already selected earlier in the day when possible
- fallback pass: allow the repeat if no suitable alternative exists

Important current rule:

- this does not exclude the whole `sw2` family
- a later slot can still select a different strong candidate with the same requested `sw2`

This means same-day duplicate pressure is now targeted at exact exercise reuse, not at the broader `sw2` family.

#### 3c. Same-day canonical-name soft avoidance

The selector also merges together canonical-name avoid sets so that previously chosen exercises are softly penalised rather than always being hard-excluded.

This is part of the normal non-exact ranking logic and also supports `variability_policy = "med"`.

#### 3d. Same-day region overlap penalty

Previously selected target regions create a soft penalty during scoring. This is not a hard exclusion.

### 4. Current meaning of `variability_policy`

The current implementation is described in code and also in the March 2026 merge summary.

#### 4a. `variability_policy = "high"`

Current behaviour:

- no sticky reuse
- normal selector path
- standard anti-repeat signals still apply

In practice this means:

- week-level exact-ID dedupe still applies unless the day uses `benchmark_exactness`
- same-day exact-exercise avoidance still applies
- same-day canonical-name avoidance still applies
- same-day region penalties still apply

#### 4b. `variability_policy = "none"`

Current behaviour:

- `slot_family` is used as the key
- the first successful pick is stored in `programSticky`
- later slots with the same family reuse that exact exercise directly if the sticky choice exists

Important current detail:

- this is not implemented as "allow repeats generally"
- it is implemented as "reuse the program-sticky exercise if one has already been chosen for that slot family"

So the current runtime behaviour is:

- if the program-sticky exercise already exists for that family, the engine reuses it directly and bypasses the normal selector-time dedupe path for that slot
- if there is no existing sticky value yet, selection still goes through the normal selector path, which means same-day exact-exercise avoidance is still active

This is the key gap with the desired product interpretation.

#### 4c. `variability_policy = "med"`

Current behaviour:

- `slot_family` is still required for the feature to matter
- stickiness is scoped to the current day/block occurrence
- later matching slots in the same block can reuse that block-sticky exercise
- canonical names previously used by that family in earlier blocks are added to a soft avoid set

This is softer than `none`.

It does not mean "must always vary". It means:

- prefer reuse within the current block-scoped family
- softly avoid repeating the same canonical winner across later block occurrences

#### 4d. Fallback when `slot_family` is not set

If a slot has no meaningful `slot_family`, then `none` and `med` lose most of their special behaviour because the sticky maps are keyed by slot family.

In that case the slot mostly falls back to standard selection and anti-repeat behaviour.

### 5. Current scoring priority

At a high level, the selector tries to find the best match by progressively relaxing authored constraints.

The most important practical point for this requirement is:

- `sw2` is a strong positive match input
- same-day duplicate pressure now targets exact exercise reuse rather than the entire `sw2` family

So a slot can specify a valid `sw2` and still receive a different candidate from the same `sw2` family if the top exact exercise was already used earlier in the day.

### 6. What is already coded vs not coded

#### Already coded

- `variability_policy` exists and is saved from the admin UI
- `slot_family` exists and is saved from the admin UI
- `none`, `med`, and `high` all have runtime behaviour
- ordered simulation selection is a real engine path driven by `is_ordered_simulation`
- same-day exact-exercise anti-repeat is active
- same-day and same-week duplicate pressure are both active
- `benchmark_exactness` is a separate day-level exactness concept

#### Not coded in the way the product requirement now describes

- `day_type = "simulation"` is not currently the switch that disables repeat pressure
- simulation days do not currently say "always take the best slot match even if repeated"
- `variability_policy = "none"` does not currently mean "same best exercise across the whole day regardless of repeat heuristics"

## Current Behaviour Summary Table

| Topic | Current coded behaviour |
| --- | --- |
| `day_type = simulation` | Metadata only for this concern; does not switch off repeat avoidance |
| `is_ordered_simulation = true` | Uses ordered simulation resolution path |
| `variability = high` | Normal selector behaviour with existing repeat pressure |
| `variability = med` | Block-level sticky reuse plus soft canonical-name avoidance across later occurrences |
| `variability = none` | Program-level sticky reuse if previously established for the slot family |
| Same-day repeated `sw2` | Still eligible; duplicate pressure now targets exact exercise repeats instead |
| Slot with matching `sw2` already used today | Can still select a different candidate with the same `sw2` if the exact earlier exercise is avoided |

## Amendment for Review

### Amendment 1 — Soften same-day repeat handling

The current same-day repeat rule is stronger than desired because it operates at the `sw2` family level rather than at the level of the exact exercise that was previously selected.

The desired behaviour is:

- if an exact exercise has previously been selected, then if possible it should not be selected again
- instead, the next best match should be selected
- unless `variability_policy` and `slot_family` explicitly override that behaviour

The specific change in requirement is:

- do not avoid all exercises sharing the same `sw2` merely because one of them has already been selected earlier in the day
- keep good `sw2` matches eligible if they have not themselves already been selected

This means the duplicate-pressure rule should be softened from:

- avoid repeated `sw2`

to:

- prefer not to repeat the same exact exercise, while still allowing other strong candidates within the same requested `sw2`

### Amendment 2 — Preserve slot `sw2` as a meaningful match signal

Where a slot specifies `sw2`, that `sw2` should continue to act as a strong matching signal even after one exercise in that `sw2` family has already been used.

In practical terms:

- selecting one `sled_compound` exercise should not make the entire `sled_compound` family unattractive for the rest of the day
- instead, only the exact previously selected exercise should be deprioritised where possible

### Amendment 3 — Variability-policy exception remains valid

The softened repeat rule should still allow existing `variability_policy` and `slot_family` mechanisms to override normal duplicate pressure where appropriate.

That means:

- `none` can still intentionally drive stable reuse
- `med` can still intentionally drive block-scoped consistency
- `high` can still prefer variation

The amendment only changes the current over-broad treatment of repeated `sw2`.

## Current Scoring Notes: Loadable and SE

### `preferLoadable`

Yes. Exercises are currently preferred when the slot has `preferLoadable` enabled in the admin UI.

On [index.html](/c:/Users/alecp/bubble-workout-engine/api/admin/index.html), the checkbox in the slot table writes `preferLoadable: true` onto the slot definition.

Current scoring effect:

- if `preferLoadable` is enabled and the exercise is loadable, score `+1.0`
- if `preferLoadable` is enabled and the exercise is not loadable, score `-0.1`
- if `preferLoadable` is not enabled, no loadable weighting is applied

Current coded definition of "loadable":

- explicit `load` boolean on the indexed exercise row, if present
- otherwise inferred from equipment including one of:
  - `barbell`
  - `dumbbells`
  - `kettlebells`
  - `sandbag`
  - `d-ball`

So the checkbox is a real scoring preference, not just metadata.

### `SE` checkbox

The `SE` checkbox refers to `strength_equivalent_bonus`.

It appears in the variant editor in [index.html](/c:/Users/alecp/bubble-workout-engine/api/admin/index.html), not as a base slot-level checkbox in the main slot row.

Current behaviour:

- when a slot variant has `strength_equivalent_bonus: true`, the selector adds `strengthEquivalentBonus: true` to the selection context
- during scoring, any exercise with `strength_equivalent = true` receives `+3`
- exercises without `strength_equivalent = true` receive no SE bonus

So the current weighting rule is:

- `SE` enabled on the selected variant plus exercise tagged `strength_equivalent = true` -> `+3`
- `SE` enabled but exercise not tagged `strength_equivalent` -> `+0`
- `SE` not enabled -> `+0` for all exercises

This is a scoring bonus only. It is not a hard filter.

### Relative strength of these bonuses

Current scoring magnitudes make these signals secondary to core taxonomy matching:

- `sw2` match -> `+12`
- `sw` match -> `+10`
- `mp` match -> `+4`
- soft pref match -> `+pref_bonus` (default often `4`)
- `strength_equivalent_bonus` -> `+3`
- `preferLoadable` satisfied -> `+1.0`

So:

- `preferLoadable` nudges selection between otherwise similar candidates
- `SE` can materially help a strength-equivalent exercise beat a non-SE alternative
- neither should normally outweigh a major mismatch in `sw2` or `sw`
