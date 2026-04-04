# Codex Prompts — Rep Rule Unit Compatibility

## Background

When equipment substitution occurs (e.g. `row_erg` → `bb_row_upright_row_kb_swings`
under a home-equipment preset), the substitute exercise shares the same movement
pattern as the original. The rep rule matcher correctly selects the rule for that
movement pattern, but the rule prescribes a distance unit (`m`) that is physically
meaningless for the substitute exercise.

The fix has two layers:

**Layer 1 — `accepts_distance_unit` on `exercise_catalogue`:**
A whitelist of ~29 exercises that genuinely accept a distance prescription. All
other exercises must not receive a distance-based prescription.

**Layer 2 — `time_equivalent_low_sec` / `time_equivalent_high_sec` on `program_rep_rule`:**
Each distance-prescribing rule carries a coach-configured time equivalent. When the
whitelist gate fires, the engine writes a `seconds` prescription using these values
instead of the `m` prescription. This is universally applicable to any substitute
exercise and also provides athletes with a reference time when choosing distances
for outdoor alternatives (e.g. "this should take 60-90 seconds, so aim for
300-350m outdoors").

The override logic sits in `04_applyRepRules.js` **after** `applyRuleToItem` —
the matcher is unchanged; the rule is still the right rule for the slot context,
we just render it differently for exercises that cannot accept distance.

Full spec: `docs/rep-rule-unit-compatibility-spec.md`

---

## Prompt 1 — Migration

Create `migrations/V40__rep_rule_unit_compatibility.sql`:

```sql
-- Layer 1: whitelist flag on exercise_catalogue.
-- Exercises NOT in the whitelist will have any distance prescription
-- converted to the rule's time equivalent.
ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS accepts_distance_unit boolean not null default false;

-- Layer 2: coach-configured time equivalent on each rep rule.
-- Only needs to be set on rules that prescribe reps_unit = 'm'.
-- Null on non-distance rules.
ALTER TABLE program_rep_rule
  ADD COLUMN IF NOT EXISTS time_equivalent_low_sec integer null,
  ADD COLUMN IF NOT EXISTS time_equivalent_high_sec integer null;
```

---

## Prompt 2 — Seed: distance whitelist for `exercise_catalogue`

Create `migrations/R__seed_exercise_catalogue_distance_whitelist.sql`.

This is a new repeatable migration. Seed `accepts_distance_unit = true` for all
exercises that legitimately accept a distance-based prescription. Use a single
unconditional UPDATE (idempotent on reruns).

```sql
-- Exercises that genuinely accept a distance (metres) prescription.
-- All other exercises will have any distance rule converted to seconds.
UPDATE exercise_catalogue
SET accepts_distance_unit = true
WHERE exercise_id IN (
  -- carry
  'db_farmer_carry',
  'farmer_carry_dumbbells',
  'farmer_carry_handles',
  'farmer_carry_kettlebells',
  'farmer_carry_weighted',
  'farmers_carry',
  'front_rack_carry',
  'kb_farmer_carry',
  'sandbag_carry',
  -- cyclical engines
  'air_bike_sprint',
  'assault_bike',
  'bike_erg',
  'row_erg',
  'ski_erg',
  -- locomotion
  'bear_crawl',
  'burpee_broad_jump',
  'run_interval_outdoor_or_treadmill',
  -- lunge (distance-based variants)
  'db_walking_lunges',
  'kb_walking_lunges',
  'sandbag_front_rack_lunge',
  'sandbag_lunge',
  'walking_lunges',
  'weighted_walking_lunge',
  -- sled pull
  'sled_pull',
  'sled_pull_rope',
  'wheelbarrow_pull',
  -- sled push
  'sled_push',
  'sled_push_low_handle',
  'towel_push'
);
```

---

## Prompt 3 — Seed: time equivalents in `R__seed_program_rep_rules.sql`

File: `migrations/R__seed_program_rep_rules.sql`

For **every** INSERT in this file that targets `public.program_rep_rule`:

1. Add `time_equivalent_low_sec, time_equivalent_high_sec` to the end of the
   INSERT column list (before the closing `)`)
2. Add the corresponding values at the end of the VALUES tuple
3. Add to the ON CONFLICT DO UPDATE SET block:
   ```
   time_equivalent_low_sec  = EXCLUDED.time_equivalent_low_sec,
   time_equivalent_high_sec = EXCLUDED.time_equivalent_high_sec,
   ```
   (insert these two lines before `updated_at = now()`)

Assign the following values (all others get `NULL, NULL`):

| rule_id | time_equivalent_low_sec | time_equivalent_high_sec | Basis |
|---------|------------------------|-------------------------|-------|
| `hyrx_amrap_row_erg_v2` | 60 | 90 | 250-300m erg at ~2:30/500m |
| `hyrx_amrap_ski_erg_v2` | 60 | 90 | 250-300m ski erg |
| `hyrx_amrap_farmer_carry` | 30 | 45 | 50m carry at walking pace |
| `hyrx_amrap_row_erg` | 60 | 90 | 250-300m (inactive rule, same basis) |
| `hyrx_amrap_run_any_v2` | 90 | 120 | 400m run at ~5:00/km |
| `hyrx_amrap_ski_erg` | 60 | 90 | 250-300m (inactive rule) |
| `hyrx_amrap_sled_pull` | 45 | 60 | 20m sled pull at moderate load |
| `hyrx_amrap_sled_push` | 45 | 60 | 20m sled push at moderate load |
| `hyrx_amrap_cyclical_generic` | 60 | 90 | 200-300m generic erg |
| `hyrx_amrap_locomotion_generic` | 90 | 120 | 300-400m generic run |
| `hyrx_amrap_carry_generic` | 30 | 45 | 40-50m carry |
| `hyrx_amrap_run_buy_in` | 90 | 120 | 400m run (inactive rule) |

Rules that already prescribe `reps_unit = 'reps'` get `NULL, NULL`:
`hyrx_amrap_sandbag_lunge`, `hyrx_amrap_wallball`, `hyrx_amrap_burpee`,
`hyrx_power_single_fallback`, `hyrx_global_fallback`, and all non-hyrox rules.

---

## Prompt 4 — `repRules.js`: add new columns to SELECT

File: `api/src/services/repRules.js`

In the SQL SELECT, add `time_equivalent_low_sec` and `time_equivalent_high_sec`
after `notes_style`:

```js
      notes_style,
      time_equivalent_low_sec,
      time_equivalent_high_sec
    FROM program_rep_rule
```

No other changes to this file.

---

## Prompt 5 — `repRuleMatcher.js`: preserve new fields through normalizeRule

File: `api/engine/repRuleMatcher.js`

In `normalizeRule`, add the two new fields to the returned object. They are
integers, no normalization needed — just copy them through:

```js
time_equivalent_low_sec: rawRule.time_equivalent_low_sec ?? null,
time_equivalent_high_sec: rawRule.time_equivalent_high_sec ?? null,
```

No other changes to this file. Do NOT add these fields to `ruleMatches` or
`makeItemContext` — the override is not a matching concern.

---

## Prompt 6 — `buildInputsFromProfile.js`: expose new field in catalogue

File: `api/src/services/buildInputsFromProfile.js`

In `mapExerciseRowsToCatalogEx`, add `accepts_distance_unit` to the returned
exercise object:

```js
accepts_distance_unit: Boolean(row.accepts_distance_unit),
```

No other changes to this file.

---

## Prompt 7 — `generateProgramV2.js`: add column to exercise catalogue SELECT

File: `api/src/routes/generateProgramV2.js`

In the exercise catalogue SELECT (the query on `exercise_catalogue WHERE is_archived
= false`), add `accepts_distance_unit` after `warmup_hooks`:

```js
        warmup_hooks,
        accepts_distance_unit
      FROM exercise_catalogue
```

No other changes to this file.

---

## Prompt 8 — `04_applyRepRules.js`: unit override after applyRuleToItem

File: `api/engine/steps/04_applyRepRules.js`

In `enrichProgramDays`, immediately after the block that calls `applyRuleToItem`
and increments `dbg.items_with_rule`, add a unit-override check:

```js
if (rule) {
  applyRuleToItem(it, rule);
  dbg.items_with_rule += 1;

  // Unit override: if the matched rule prescribes metres but the exercise
  // does not accept a distance prescription, substitute the rule's
  // coach-configured time equivalent instead.
  if (
    normalizeCmp(rule.reps_unit) === "m" &&
    ex &&
    !ex.accepts_distance_unit &&
    rule.time_equivalent_low_sec != null
  ) {
    const timePrescription = formatRepRange(
      rule.time_equivalent_low_sec,
      rule.time_equivalent_high_sec,
      "seconds"
    );
    it.reps_prescribed = timePrescription;
    it.reps_unit = "seconds";
    dbg.notes.push(
      `Unit override: ex_id=${s(it.ex_id)} rule=${rule.rule_id} ` +
      `${rule.rep_low}-${rule.rep_high}m → ${timePrescription} seconds`
    );
  }
}
```

`normalizeCmp` and `formatRepRange` are already defined and used in this file.
No new imports are needed.

---

## Prompt 9 — Tests

File: `api/engine/steps/__tests__/04_applyRepRules.test.js`

Add a new `describe` block: `"unit override — distance rule on non-distance exercise"`.

Use the existing test helpers and pattern in this file.

Write three tests:

**Test 1 — override fires for non-whitelist exercise**
- Build a minimal program with one item: `ex_id = 'bb_row_upright_row_kb_swings'`
- Catalogue entry for that ex: `{ id: 'bb_row_upright_row_kb_swings', mp: 'cyclical_engine', accepts_distance_unit: false, ... }`
- Rep rule: `reps_unit = 'm'`, `rep_low = 200`, `rep_high = 300`,
  `time_equivalent_low_sec = 60`, `time_equivalent_high_sec = 90`,
  matching context for that exercise
- Assert: `item.reps_unit === 'seconds'`
- Assert: `item.reps_prescribed === '60-90 seconds'`

**Test 2 — override does NOT fire for whitelist exercise**
- Same rule, but catalogue entry has `accepts_distance_unit: true` (e.g. `row_erg`)
- Assert: `item.reps_unit === 'm'`
- Assert: `item.reps_prescribed` contains `m` (not seconds)

**Test 3 — override does NOT fire when rule has no time equivalent**
- Same non-whitelist exercise, distance rule, but
  `time_equivalent_low_sec = null`
- Assert: `item.reps_unit === 'm'` (original distance prescription retained —
  edge-case safety, ensures no silent null prescription)

---

## Prompt 10 — Verification

After applying all prompts:

1. Run `docker compose run --rm flyway migrate` — confirm V40 and both R__ seeds
   apply cleanly.

2. Open `/admin/preview`, generate a HYROX programme with `Equipment preset = home`.
   - Find the row station slot.
   - Confirm `bb_row_upright_row_kb_swings` now shows a seconds prescription
     (e.g. `1x · 60-90 seconds`), not `200-300 m`.
   - Confirm the debug panel shows a `Unit override` note for that item.

3. Generate a HYROX programme with full equipment (no preset).
   - Confirm `row_erg` still shows `250-300 m`.

4. Run the new tests:
   `npm test -- --testPathPattern=04_applyRepRules`

---

## Note on future progression from logged actuals

The time equivalent also provides a foundation for progression logic: once athletes
log actual seconds (or actual distance) for these substitute exercises, the engine
can compare against the prescribed range and adjust the time equivalent upward in
future weeks — the same RIR/progression framework used for reps-based exercises.
This is not in scope for this change but the data will be in place to support it.
