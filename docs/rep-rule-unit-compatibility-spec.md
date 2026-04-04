# Rep Rule Unit Compatibility Spec

## Goal

Prevent equipment-substitution scenarios from applying a distance-based rep rule
(`200-300 m`) to an exercise that cannot accept a distance prescription. When the
mismatch is detected, substitute the rule's coach-configured time equivalent instead.

## Problem

When `Equipment preset = home`, `row_erg` is unavailable. The exercise selector
correctly substitutes `bb_row_upright_row_kb_swings`. The substitute shares
`mp=cyclical_engine` with `row_erg` (correct HYROX classification), so the rep rule
matcher selects `hyrx_amrap_cyclical_generic` — which prescribes `200-300 m`.
The result is physically meaningless:

```
Barbell row - upright row - kettlebell swings
1x 200-300 m
```

Simply blocking the distance rule and falling through to a generic reps rule is also
wrong: `15-20 reps` does not represent the same training stimulus as `200-300m` on
an erg. The metabolic dose needs to be preserved.

## Solution: Two-Layer Fix

### Layer 1 — `accepts_distance_unit` on `exercise_catalogue`

A boolean whitelist. `false` by default (backward-compatible). Set to `true` for the
~29 exercises that genuinely accept a metres prescription (ergs, carries, sleds, runs,
weighted lunges). When the matched rule prescribes `reps_unit = 'm'` and this flag is
`false`, the override fires.

### Layer 2 — `time_equivalent_low_sec` / `time_equivalent_high_sec` on `program_rep_rule`

Each distance-prescribing rule carries a coach-set time equivalent. When the Layer 1
gate fires, the engine writes a `seconds` prescription using these values in place of
the metres prescription.

**Why time, not reps:**
Time is the universal conditioning currency. A rule prescribing `200-300m` represents
approximately 60-90 seconds of near-maximal aerobic effort. That same 60-90 seconds
is valid for any substitute exercise — KB swings, med ball slams, battle ropes — without
needing per-exercise conversion factors. Reps require knowing the cadence of every
possible substitute.

**Bonus:** The time equivalent also gives athletes a reference when choosing outdoor
distances. "This should take 60-90 seconds, so aim for 300-350m outside."

## Architecture

The override is applied in `04_applyRepRules.js` **after** `applyRuleToItem`. The
matcher (`repRuleMatcher.js`) is not changed: the rule is still the correct rule for
the slot context; we only change how it is rendered for a non-distance exercise.

```
Match rule for slot  →  applyRuleToItem  →  unit override check
                                               ↓
                            if (rule.reps_unit = 'm'
                                && !ex.accepts_distance_unit
                                && rule.time_equivalent_low_sec != null)
                              → overwrite reps_prescribed + reps_unit
```

## Scope

### Change 1: `migrations/V40__rep_rule_unit_compatibility.sql`

```sql
ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS accepts_distance_unit boolean not null default false;

ALTER TABLE program_rep_rule
  ADD COLUMN IF NOT EXISTS time_equivalent_low_sec integer null,
  ADD COLUMN IF NOT EXISTS time_equivalent_high_sec integer null;
```

### Change 2: `migrations/R__seed_exercise_catalogue_distance_whitelist.sql` (new)

Seed `accepts_distance_unit = true` for all 29 distance-capable exercises:

**carry** (9): `db_farmer_carry`, `farmer_carry_dumbbells`, `farmer_carry_handles`,
`farmer_carry_kettlebells`, `farmer_carry_weighted`, `farmers_carry`,
`front_rack_carry`, `kb_farmer_carry`, `sandbag_carry`

**cyclical_engine** (5): `air_bike_sprint`, `assault_bike`, `bike_erg`, `row_erg`,
`ski_erg`

**locomotion** (3): `bear_crawl`, `burpee_broad_jump`,
`run_interval_outdoor_or_treadmill`

**lunge** (6): `db_walking_lunges`, `kb_walking_lunges`, `sandbag_front_rack_lunge`,
`sandbag_lunge`, `walking_lunges`, `weighted_walking_lunge`

**sled_pull** (3): `sled_pull`, `sled_pull_rope`, `wheelbarrow_pull`

**sled_push** (3): `sled_push`, `sled_push_low_handle`, `towel_push`

### Change 3: `migrations/R__seed_program_rep_rules.sql`

Add `time_equivalent_low_sec` and `time_equivalent_high_sec` to every HYROX
INSERT column list, ON CONFLICT DO UPDATE SET, and VALUES.

Time equivalents for the distance-prescribing rules:

| rule_id | rep_low | rep_high | unit | time_low | time_high |
|---------|---------|----------|------|----------|-----------|
| `hyrx_amrap_row_erg_v2` | 250 | 300 | m | 60 | 90 |
| `hyrx_amrap_ski_erg_v2` | 250 | 300 | m | 60 | 90 |
| `hyrx_amrap_farmer_carry` | 50 | 50 | m | 30 | 45 |
| `hyrx_amrap_row_erg` | 250 | 300 | m | 60 | 90 |
| `hyrx_amrap_run_any_v2` | 400 | 400 | m | 90 | 120 |
| `hyrx_amrap_ski_erg` | 250 | 300 | m | 60 | 90 |
| `hyrx_amrap_sled_pull` | 20 | 20 | m | 45 | 60 |
| `hyrx_amrap_sled_push` | 20 | 20 | m | 45 | 60 |
| `hyrx_amrap_cyclical_generic` | 200 | 300 | m | 60 | 90 |
| `hyrx_amrap_locomotion_generic` | 300 | 400 | m | 90 | 120 |
| `hyrx_amrap_carry_generic` | 40 | 50 | m | 30 | 45 |
| `hyrx_amrap_run_buy_in` | 400 | 400 | m | 90 | 120 |

All other rules: `NULL, NULL`.

### Change 4: `api/src/services/repRules.js`

Add `time_equivalent_low_sec`, `time_equivalent_high_sec` to SELECT.

### Change 5: `api/engine/repRuleMatcher.js`

In `normalizeRule`, copy through:
```js
time_equivalent_low_sec: rawRule.time_equivalent_low_sec ?? null,
time_equivalent_high_sec: rawRule.time_equivalent_high_sec ?? null,
```

No changes to `ruleMatches` or `makeItemContext`.

### Change 6: `api/src/services/buildInputsFromProfile.js`

In `mapExerciseRowsToCatalogEx`, add:
```js
accepts_distance_unit: Boolean(row.accepts_distance_unit),
```

### Change 7: `api/src/routes/generateProgramV2.js`

Add `accepts_distance_unit` to the exercise catalogue SELECT.

### Change 8: `api/engine/steps/04_applyRepRules.js`

After `applyRuleToItem(it, rule)`, add unit override:

```js
if (
  normalizeCmp(rule.reps_unit) === "m" &&
  ex && !ex.accepts_distance_unit &&
  rule.time_equivalent_low_sec != null
) {
  it.reps_prescribed = formatRepRange(
    rule.time_equivalent_low_sec,
    rule.time_equivalent_high_sec,
    "seconds"
  );
  it.reps_unit = "seconds";
  dbg.notes.push(`Unit override: ex_id=${s(it.ex_id)} ...`);
}
```

## What Does Not Change

- Rep rule matching logic
- Exercise selection / substitution
- Narration templates
- Emitter columns / mobile payloads

## Acceptance Criteria

1. Home-equipment HYROX: `bb_row_upright_row_kb_swings` shows `60-90 seconds`,
   not `200-300 m`
2. Full-equipment HYROX: `row_erg` still shows `250-300 m`
3. All exercises without `accepts_distance_unit = true` behave identically to
   before (no reps rules matched a distance — this is purely a guard on actual
   distance rule application)
4. Debug panel shows `Unit override` note when override fires

## Future: Progression from Logged Actuals

Once athletes log actual seconds (or actual distance) for substitute exercises,
the engine has the data to compare against the prescribed time range and push
progressions in future weeks — the same framework used for reps. Not in scope
for this change but no additional schema work will be required.
