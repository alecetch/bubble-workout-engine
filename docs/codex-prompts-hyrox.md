# Codex Implementation Prompts — Hyrox Program Type

**Usage:** Execute prompts sequentially. After each completes, report the output before proceeding.
**Repository root:** `bubble-workout-engine/`
**Do not skip steps.** Later prompts depend on earlier state.
**Do not write code in a prompt marked read-only.**

---

## PROMPT 1 — Pre-flight Audit (Read-Only)

**Do not modify any files.**

Read the following files in full:

1. `api/engine/steps/02_segmentProgram.js` — full file
2. `api/engine/steps/01_buildProgramFromDefinition.js` — lines 200–320 (the block-building loop after `fillSlot`)
3. `api/engine/configValidation.js` — full file
4. `api/engine/steps/06_emitPlan.js` — lines 1–50, then the `estimateSegmentRawSeconds` function and the SEG row construction

Then produce a report with exactly these sections:

**A. `blockSemantics` key path**
Show the exact key path by which `segmentProgram.js` reads block semantics from `compiledConfig`. Confirm whether it is `compiledConfig.segmentation.blockSemantics` or something else. Show the exact line.

**B. Block item construction in step 1**
Find the exact object literal that `buildProgramFromDefinition.js` pushes into the `blocks` array after calling `fillSlot`. Show every field in that object literal. Confirm whether `is_buy_in` is present or absent.

**C. `configValidation.js` segmentation mapping**
Show the exact lines where `blockSemantics` is read from the PGC JSON and assigned to `compiledConfig.segmentation`. Show whether any snake_case-to-camelCase conversion happens for keys inside the segmentation block.

**D. `estimateSegmentRawSeconds` signature and early-exit paths**
Show the first 10 lines of `estimateSegmentRawSeconds`. Confirm whether there is any early-exit path that would accept a pre-computed duration. Show how `segSec` (or equivalent) is assigned before the SEG row is emitted.

**E. SEG row column count**
Count the exact number of pipe-separated values in the SEG row construction. List each column index (0-based) and its value.

**F. `day_focus` survival through step 2**
Show whether step 2's output days object includes a `day_focus` field. Find the `out.days.push({...})` call and list every field included.

**G. `exclude_movement_classes` handling**
Show the exact block in step 1 that reads `excludeMovementClasses` from `compiledConfig.builder` and the fallback default value.

---

## PROMPT 2 — New Flyway Migration: Hyrox Catalogue Columns

**File to create:** `migrations/V21__add_hyrox_exercise_catalogue_columns.sql`

Read `migrations/V20__drop_exercise_catalogue_bubble_columns.sql` first to confirm the highest existing versioned migration number, then create the file below.

**Exact file content:**

```sql
-- V21: Add Hyrox-specific metadata columns to exercise_catalogue.
-- hyrox_role: 'race_station' | 'carry' | 'run_buy_in' | 'accessory' | NULL
-- hyrox_station_index: 1–8 matching official Hyrox race station order
--   1=SkiErg, 2=SledPush, 3=SledPull, 4=BurpeeBroadJump,
--   5=RowErg, 6=FarmerCarry, 7=SandbagLunge, 8=Wallball

ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS hyrox_role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hyrox_station_index INTEGER;
```

After creating the file, run:
```
docker compose run --rm flyway migrate
```

Report the flyway output. Then run:
```
docker compose exec db psql -U app -d app -c "\d exercise_catalogue" | grep hyrox
```

**Acceptance:** Both `hyrox_role` and `hyrox_station_index` appear in the table description.

---

## PROMPT 3 — Exercise Catalogue: New Hyrox Exercises

**File to modify:** `migrations/R__seed_exercise_catalogue.sql`

Read the file first. Find the last exercise INSERT block to understand the exact column list used. Then append the following new exercises at the end of the file, before the final blank line (if any). Each INSERT must be guarded by `WHERE NOT EXISTS (SELECT 1 FROM exercise_catalogue WHERE ex_id = '...')`.

The column list for each INSERT must match the column list used by the existing inserts in this file exactly — do not guess or add extra columns. Add `hyrox_role` and `hyrox_station_index` to the column list only if the existing inserts already include those columns (they will, since V21 added them). If the existing inserts use a different mechanism (e.g. `ON CONFLICT DO UPDATE`), match that mechanism.

**Exercises to add:**

| ex_id | n (name) | mp | sw | sw2 | mc | load | pref additions | hyrox_role | hyrox_station_index |
|---|---|---|---|---|---|---|---|---|---|
| `ski_erg` | Ski Erg | `cyclical_engine` | `ski_erg` | `cyclical_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_endurance` | `race_station` | 1 |
| `sled_push` | Sled Push | `sled_push` | `sled_push` | `sled_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_power` | `race_station` | 2 |
| `sled_pull` | Sled Pull | `sled_pull` | `sled_pull` | `sled_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_power` | `race_station` | 3 |
| `burpee_broad_jump` | Burpee Broad Jump | `locomotion` | `burpee_jump` | `locomotion_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_endurance` | `race_station` | 4 |
| `row_erg` | Row Erg | `cyclical_engine` | `row_erg` | `cyclical_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_endurance` | `race_station` | 5 |
| `farmer_carry_handles` | Farmer Carry (handles) | `carry` | `farmer_carry` | `carry_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_power`, `hyrox_endurance` | `race_station` | 6 |
| `farmer_carry_dumbbells` | Farmer Carry (dumbbells) | `carry` | `farmer_carry` | `carry_compound` | `engine` | true | `hyrox_station`, `hyrox_engine`, `hyrox_power`, `hyrox_endurance` | `carry` | NULL |
| `farmer_carry_kettlebells` | Farmer Carry (kettlebells) | `carry` | `farmer_carry` | `carry_compound` | `engine` | true | `hyrox_station`, `hyrox_engine`, `hyrox_power`, `hyrox_endurance` | `carry` | NULL |
| `sandbag_lunge` | Sandbag Lunge | `lunge` | `sandbag_lunge` | `lunge_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_endurance` | `race_station` | 7 |
| `wallball_9kg` | Wallball (9 kg) | `push_ballistic` | `wallball` | `push_ballistic_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_endurance` | `race_station` | 8 |
| `wallball_6kg` | Wallball (6 kg) | `push_ballistic` | `wallball` | `push_ballistic_compound` | `engine` | false | `hyrox_station`, `hyrox_engine`, `hyrox_endurance` | `race_station` | NULL |
| `run_interval` | Run (interval) | `locomotion` | `run_interval` | `locomotion_compound` | `engine` | false | `hyrox_buy_in`, `hyrox_engine`, `hyrox_endurance` | `run_buy_in` | NULL |

For any column in the existing INSERT list that is not in the table above (e.g. `den`, `cx`, `impact_level`, `engine_role`, `tr`, `wh`, `eq`), use the following defaults:
- `den` (density_rating): `2`
- `cx` (complexity_rank): `1`
- `impact_level`: `2`
- `engine_role`: `NULL`
- `tr` (target_regions_json): `'[]'`
- `wh` (warmup_hooks): `'[]'`
- `eq` (equipment_json): `'[]'`

Also update `preferred_in_json` for these existing exercises by appending `"hyrox_power"` to their pref array. Do this with UPDATE statements guarded by `WHERE hyrox_role IS NULL` (i.e. only update if the hyrox columns haven't been set yet — or use `WHERE NOT (preferred_in_json ? 'hyrox_power')`):

- `barbell_squat`, `front_squat`, `goblet_squat`
- `trap_bar_deadlift`, `romanian_deadlift`, `conventional_deadlift`
- `dumbbell_walking_lunge`, `step_up_dumbbell`
- `push_press`, `thruster`
- `pullup`, `bb_bentover_row`, `singlearm_db_row`

Run `docker compose run --rm flyway migrate` after saving.

**Acceptance:**
```
docker compose exec db psql -U app -d app -c \
  "SELECT ex_id, hyrox_role, hyrox_station_index FROM exercise_catalogue WHERE hyrox_role IS NOT NULL ORDER BY hyrox_station_index NULLS LAST, ex_id"
```
Must return at least 12 rows. Rows for `ski_erg` through `wallball_9kg` must have `hyrox_station_index` values 1–8.

---

## PROMPT 4 — Engine Code: Step 1, Step 2, configValidation, Step 6

This prompt makes surgical changes to four pipeline files. Make each change exactly as specified. Do not refactor surrounding code.

---

### 4A — `api/engine/steps/01_buildProgramFromDefinition.js`

Read the file. Find the exact `blocks.push({...})` call that runs after `fillSlot` resolves an exercise. The audit confirmed it is at line 345 and looks like:
```javascript
blocks.push({
  block: blockLetter,
  slot: slotName,
  ex_id: ex.id,
  ex_name: ex.n,
  sets,
  ex_sw: ex.sw || "",
  ex_sw2: ex.sw2 || "",
});
```

Add `is_buy_in` as the last field in that object:
```javascript
blocks.push({
  block: blockLetter,
  slot: slotName,
  ex_id: ex.id,
  ex_name: ex.n,
  sets,
  ex_sw: ex.sw || "",
  ex_sw2: ex.sw2 || "",
  is_buy_in: slotDef.is_buy_in === true,
});
```

Do not change any other line. Do not move or reorder the existing fields.

---

### 4B — `api/engine/steps/02_segmentProgram.js`

Read the full file. Make exactly these four changes:

**Change 1 — Carry `day_focus` in output days.**

Find the `out.days.push({...})` call. Add `day_focus: toStr(day.day_focus) || "",` as a field in that object, directly after `day_type`.

**Change 2 — Read `blockSemanticsByFocus` from compiledConfig.**

In the `segmentProgram` export function, directly after the line that reads `blockSemantics` from `compiledConfig`, add:
```javascript
const blockSemanticsByFocus =
  compiledConfig?.segmentation?.blockSemanticsByFocus ?? null;
```

**Change 3 — Per-focus semantics dispatch.**

Find the call `segmentDayFromBlocks(day, blockSemantics, dbg)` inside the day loop. Replace it with:
```javascript
const focusOverride =
  blockSemanticsByFocus && day.day_focus
    ? blockSemanticsByFocus[day.day_focus]
    : null;
const effectiveSemantics = focusOverride
  ? { ...blockSemantics, ...focusOverride }
  : blockSemantics;
const segments = segmentDayFromBlocks(day, effectiveSemantics, dbg);
```

**Change 4 — `time_cap_sec`, `post_segment_rest_sec`, and `is_buy_in` propagation.**

Inside `segmentDayFromBlocks`, find the `mkItems` helper. Change it from:
```javascript
const mkItems = (arr) =>
  arr.map((b) => ({
    ex_id: b.ex_id,
    ex_name: b.ex_name,
    slot: b.slot,
    sets: toInt(b.sets, 0),
  }));
```
To:
```javascript
const mkItems = (arr) =>
  arr.map((b) => ({
    ex_id: b.ex_id,
    ex_name: b.ex_name,
    slot: b.slot,
    sets: toInt(b.sets, 0),
    is_buy_in: b.is_buy_in === true,
  }));
```

Then find every place a segment object is pushed to `segments` (all five branches: single, superset, giant_set, amrap, emom). In every push, add these two fields sourced from `sem`:
```javascript
time_cap_sec: (sem.time_cap_sec != null && Number.isFinite(Number(sem.time_cap_sec)))
  ? Number(sem.time_cap_sec) : null,
post_segment_rest_sec: Number.isFinite(Number(sem.post_segment_rest_sec))
  ? Number(sem.post_segment_rest_sec) : 0,
```

For the **single** branch: each exercise becomes its own segment. Add these two fields to every `segments.push({...})` call in that branch. The `sem` reference is already in scope for each block letter's loop.

---

### 4C — Find and patch the PGC compilation step

**The audit confirmed that `configValidation.js` only validates — it does not compile the PGC DB JSON into `compiledConfig`.** Do not modify `configValidation.js`.

Instead, you must find the file that actually builds `compiledConfig.segmentation.blockSemantics` from the raw PGC JSON stored in the database.

**Step 1 — Find the compilation file.**

Search the codebase for any file (not `configValidation.js`) that contains the string `blockSemantics` in an assignment context — i.e., setting it on an object, not just reading it. Candidate locations:
- `api/engine/compilePgcConfig.js` (if it exists)
- `api/engine/buildCompiledConfig.js` (if it exists)
- `api/engine/steps/00_*.js` (if any step-zero file exists)
- `generateProgramV2.js`
- `api/server.js`

Run this search:
```
grep -rn "blockSemantics" api/ --include="*.js"
```

Report every file and line where `blockSemantics` appears. Identify which file *assigns* it (not just reads it).

**Step 2 — Inspect the compilation context.**

Read that file. Find the block that converts the raw PGC JSON (loaded from the DB, with snake_case keys like `block_semantics`) into the `compiledConfig` object (camelCase keys like `blockSemantics`). Show the exact lines.

**Step 3 — Add `blockSemanticsByFocus`.**

In that same block, directly after the line that assigns `blockSemantics`, add:
```javascript
blockSemanticsByFocus: pgcJson?.segmentation?.block_semantics_by_focus ?? null,
```

The exact variable names (`pgcJson`, `segmentation`, etc.) must match what that file actually uses — do not guess. Show the before/after diff.

Do not modify `configValidation.js`.

---

### 4D — `api/engine/steps/06_emitPlan.js`

Read the file.

**Change 1 — `time_cap_sec` override in `estimateSegmentRawSeconds`.**

The audit confirmed the function signature and early-exit structure. The function currently has two early-exit paths:
1. `if (!seg) return 0;` at line 368
2. `if (segType === "warmup" || ...)` returns 0 for warmup/cooldown

Add the `time_cap_sec` early exit as the **third** early exit, directly after the warmup/cooldown block:
```javascript
// After the warmup/cooldown early return, add:
if (seg.time_cap_sec != null && Number.isFinite(Number(seg.time_cap_sec))) {
  return Number(seg.time_cap_sec) + (Number(seg.post_segment_rest_sec) || 0);
}
```

This feeds into the proportional allocator (`allocateSegmentSecondsFullDay`). Since all Hyrox AMRAP blocks have the same `time_cap_sec`, they will receive equal proportional allocation — which is the correct behaviour. The `duration_sec` emitted in the SEG row will be proportionally correct (within a few seconds of the cap) rather than exactly equal to it.

**Change 2 — Append `post_segment_rest_sec` to SEG row.**

Find the `rows.push([...].join("|"))` call that emits the SEG row. Append one additional value at the end of the array, before `.join("|")`:
```javascript
n(seg.post_segment_rest_sec ?? 0),
```

Do not reorder existing columns.

---

**After all four files are saved**, restart the API container:
```
docker compose up -d --force-recreate api
```

Then run a smoke test against an existing hypertrophy program generation to confirm no regressions. The SEG rows in the output must now have one additional trailing field (the `post_segment_rest_sec` value, which will be `0` for hypertrophy).

---

## PROMPT 5 — PGC Seed: `hyrox_default_v1`

**File to modify:** `migrations/R__seed_program_generation_config.sql`

Read the file first. Find the end of the `conditioning_default_v1` block (the final `ON CONFLICT ... DO UPDATE` statement and its semicolon). Append the following block immediately after it.

This is the complete Hyrox PGC. Insert it verbatim:

```sql
-- ── Hyrox ─────────────────────────────────────────────────────────────────────
WITH hyrox_seed AS (
  SELECT
    'hyrox_default_v1'::text AS config_key,
    true AS is_active,
    'Hyrox race prep — 3 day types: engine (8-min AMRAPs, run buy-ins), power (strength + AMRAPs), endurance (10-min AMRAPs, all run buy-ins).'::text AS notes,
    'hyrox'::text AS program_type,
    1::int AS schema_version,
    8::int AS total_weeks_default,
    jsonb_build_object(
      'beginner',     jsonb_build_object('weekly_set_step', 0, 'max_extra_sets', 0),
      'intermediate', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 2),
      'advanced',     jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 3),
      'elite',        jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 4)
    ) AS progression_by_rank_json,
    jsonb_build_object(
      'default_phase_sequence', jsonb_build_array('BASELINE', 'BUILD', 'BUILD', 'BUILD', 'PEAK', 'PEAK', 'CONSOLIDATE', 'CONSOLIDATE'),
      'last_week_mode', 'consolidate',
      'phase_labels', jsonb_build_object(
        'BASELINE',    'Baseline',
        'BUILD',       'Build',
        'PEAK',        'Peak',
        'CONSOLIDATE', 'Consolidate'
      ),
      'copy', jsonb_build_object(
        'BASELINE',    jsonb_build_object('focus', 'Learn the blocks. Build pacing discipline before you chase rounds.', 'notes', 'Sub-maximal effort. Movements first, intensity second.'),
        'BUILD',       jsonb_build_object('focus', 'Push the blocks. Add a round where you can sustain form and pace.', 'notes', 'Start conservative each block — negative split is the goal.'),
        'PEAK',        jsonb_build_object('focus', 'Race-intensity effort. Treat each block like a race station.', 'notes', 'Minimal rest transitions. Simulate race conditions.'),
        'CONSOLIDATE', jsonb_build_object('focus', 'Hold quality. Reduce volume. Arrive fresh.', 'notes', 'Do not add rounds. Sharpen movement efficiency.')
      )
    ) AS week_phase_config_json
)
INSERT INTO public.program_generation_config (
  config_key,
  is_active,
  notes,
  program_generation_config_json,
  program_type,
  progression_by_rank_json,
  schema_version,
  total_weeks_default,
  week_phase_config_json,
  updated_at
)
SELECT
  s.config_key,
  s.is_active,
  s.notes,
  jsonb_build_object(
    'config_key', s.config_key,
    'builder', jsonb_build_object(
      'day_templates', jsonb_build_array(

        -- ── Engine day (focus = 'engine') ─────────────────────────────────────
        -- Template index 0: cycles as Day 1, Day 4 (3-day: Day 1 and 3)
        -- 4 × 8-min AMRAPs. 3 of 4 blocks have run buy-ins.
        -- Block A: run → wallball (most important race pattern).
        -- Block B: run → erg (ski or row — varies by selector).
        -- Block C: carry → lunge (no run; carry fatigue is the buy-in equivalent).
        -- Block D: run → wildcard station (burpee, sled, wallball variety).
        jsonb_build_object(
          'day_key', 'engine_day',
          'focus',   'engine',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:run_buy_in',    'block', 'A', 'mp', 'locomotion',     'sw', 'run_interval',  'requirePref', 'hyrox_buy_in',  'is_buy_in', true),
            jsonb_build_object('slot', 'A:station_wall',  'block', 'A',                         'sw', 'wallball',       'requirePref', 'hyrox_station', 'fill_fallback_slot', 'A:run_buy_in'),
            jsonb_build_object('slot', 'B:run_buy_in',    'block', 'B', 'mp', 'locomotion',     'sw', 'run_interval',  'requirePref', 'hyrox_buy_in',  'is_buy_in', true),
            jsonb_build_object('slot', 'B:station_erg',   'block', 'B', 'mp', 'cyclical_engine',                       'requirePref', 'hyrox_station', 'fill_fallback_slot', 'B:run_buy_in'),
            jsonb_build_object('slot', 'C:station_carry', 'block', 'C', 'mp', 'carry',          'sw', 'farmer_carry',  'requirePref', 'hyrox_station'),
            jsonb_build_object('slot', 'C:station_lunge', 'block', 'C',                         'sw', 'sandbag_lunge', 'requirePref', 'hyrox_station', 'fill_fallback_slot', 'C:station_carry'),
            jsonb_build_object('slot', 'D:run_buy_in',    'block', 'D', 'mp', 'locomotion',     'sw', 'run_interval',  'requirePref', 'hyrox_buy_in',  'is_buy_in', true),
            jsonb_build_object('slot', 'D:station_burst', 'block', 'D',                                               'requirePref', 'hyrox_station', 'fill_fallback_slot', 'A:station_wall')
          )
        ),

        -- ── Power day (focus = 'power') ───────────────────────────────────────
        -- Template index 1: cycles as Day 2, Day 5
        -- Block A = genuine strength singles. Blocks B/C/D = 8-min AMRAPs.
        -- Block A pairing: squat + push_vertical (front squat + push press / thruster).
        --   NOT squat + horizontal pull — vertical pressing transfers better to sled and carry.
        -- Block B: sled push + sled pull + carry (fallback to carry-only if no sled).
        -- Block C: run → wallball (race-transfer: fatigued run arrives at wallball station).
        -- Block D: erg + push_vertical accessory (station finisher).
        jsonb_build_object(
          'day_key', 'power_day',
          'focus',   'power',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:strength_main',  'block', 'A', 'mp', 'squat',          'sw2', 'squat_compound',  'requirePref', 'hyrox_power', 'preferLoadable', true, 'preferCompound', true),
            jsonb_build_object('slot', 'A:strength_press', 'block', 'A', 'mp', 'push_vertical',                            'requirePref', 'hyrox_power', 'preferCompound', true),
            jsonb_build_object('slot', 'B:sled_push',      'block', 'B', 'mp', 'sled_push',      'sw', 'sled_push',        'requirePref', 'hyrox_station', 'fill_fallback_slot', 'B:carry_heavy'),
            jsonb_build_object('slot', 'B:sled_pull',      'block', 'B', 'mp', 'sled_pull',      'sw', 'sled_pull',        'requirePref', 'hyrox_station', 'fill_fallback_slot', 'B:carry_heavy'),
            jsonb_build_object('slot', 'B:carry_heavy',    'block', 'B', 'mp', 'carry',          'sw', 'farmer_carry',     'requirePref', 'hyrox_station'),
            jsonb_build_object('slot', 'C:run_buy_in',     'block', 'C', 'mp', 'locomotion',     'sw', 'run_interval',     'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'C:station_wall',   'block', 'C',                         'sw', 'wallball',         'requirePref', 'hyrox_station', 'fill_fallback_slot', 'C:run_buy_in'),
            jsonb_build_object('slot', 'D:erg_finisher',   'block', 'D', 'mp', 'cyclical_engine',                         'requirePref', 'hyrox_station', 'fill_fallback_slot', 'C:run_buy_in'),
            jsonb_build_object('slot', 'D:push_vertical',  'block', 'D', 'mp', 'push_vertical',                           'requirePref', 'hyrox_power',  'fill_fallback_slot', 'D:erg_finisher')
          )
        ),

        -- ── Endurance day (focus = 'endurance') ──────────────────────────────
        -- Template index 2: cycles as Day 3
        -- 4 × 10-min AMRAPs (longer time cap than engine day), 90s recovery between blocks.
        -- ALL 4 blocks begin with a run buy-in — maximum race-rhythm exposure.
        -- This is the threshold / aerobic base session. Pacing intent: sustainable steady-state.
        -- Block A: run → erg (pace discipline: hold the same erg split every round).
        -- Block B: run → wallball (most important race pattern — run before final station).
        -- Block C: run → carry (threshold carry: sustained pace, no pause).
        -- Block D: run → lunge (late-session lower-body fatigue, race-finish simulation).
        jsonb_build_object(
          'day_key', 'endurance_day',
          'focus',   'endurance',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:run_buy_in',    'block', 'A', 'mp', 'locomotion',     'sw', 'run_interval',  'requirePref', 'hyrox_buy_in',     'is_buy_in', true),
            jsonb_build_object('slot', 'A:station_erg',   'block', 'A', 'mp', 'cyclical_engine',                       'requirePref', 'hyrox_endurance',  'fill_fallback_slot', 'A:run_buy_in'),
            jsonb_build_object('slot', 'B:run_buy_in',    'block', 'B', 'mp', 'locomotion',     'sw', 'run_interval',  'requirePref', 'hyrox_buy_in',     'is_buy_in', true),
            jsonb_build_object('slot', 'B:station_wall',  'block', 'B',                         'sw', 'wallball',       'requirePref', 'hyrox_endurance',  'fill_fallback_slot', 'B:run_buy_in'),
            jsonb_build_object('slot', 'C:run_buy_in',    'block', 'C', 'mp', 'locomotion',     'sw', 'run_interval',  'requirePref', 'hyrox_buy_in',     'is_buy_in', true),
            jsonb_build_object('slot', 'C:station_carry', 'block', 'C', 'mp', 'carry',          'sw', 'farmer_carry',  'requirePref', 'hyrox_endurance',  'fill_fallback_slot', 'C:run_buy_in'),
            jsonb_build_object('slot', 'D:run_buy_in',    'block', 'D', 'mp', 'locomotion',     'sw', 'run_interval',  'requirePref', 'hyrox_buy_in',     'is_buy_in', true),
            jsonb_build_object('slot', 'D:station_lunge', 'block', 'D',                         'sw', 'sandbag_lunge', 'requirePref', 'hyrox_endurance',  'fill_fallback_slot', 'D:run_buy_in')
          )
        )

      ), -- end day_templates

      -- In AMRAP context, sets_by_duration controls the target rounds shown to the athlete.
      -- Block A on power day uses this as sets (strength singles).
      'sets_by_duration', jsonb_build_object(
        '40', jsonb_build_object('A', 3, 'B', 3, 'C', 3, 'D', 3),
        '50', jsonb_build_object('A', 4, 'B', 3, 'C', 3, 'D', 3),
        '60', jsonb_build_object('A', 4, 'B', 4, 'C', 3, 'D', 3)
      ),

      -- Always 4 blocks regardless of session duration. The 8-min cap controls intensity, not block count.
      'block_budget', jsonb_build_object('40', 4, '50', 4, '60', 4),

      'slot_defaults', jsonb_build_object(
        'C', jsonb_build_object(),
        'D', jsonb_build_object()
      ),

      -- CRITICAL: do NOT exclude locomotion or engine movement classes for Hyrox.
      -- Running and erg work are core race movements.
      'exclude_movement_classes', jsonb_build_array()

    ), -- end builder

    'segmentation', jsonb_build_object(

      -- Fallback semantics (used for engine day and any unknown day_focus).
      -- All 4 blocks are 8-min AMRAPs. Last block has no post-segment rest.
      'block_semantics', jsonb_build_object(
        'A', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'main',      'time_cap_sec', 480, 'post_segment_rest_sec', 60),
        'B', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'secondary', 'time_cap_sec', 480, 'post_segment_rest_sec', 60),
        'C', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 480, 'post_segment_rest_sec', 60),
        'D', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 480, 'post_segment_rest_sec', 0)
      ),

      -- Focus-specific overrides merged over the fallback block_semantics.
      -- power: block A is strength singles; B/C/D stay 8-min AMRAPs.
      -- endurance: all 4 blocks are 10-min AMRAPs with 90s recovery between them.
      'block_semantics_by_focus', jsonb_build_object(
        'power', jsonb_build_object(
          'A', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'main',      'time_cap_sec', NULL, 'post_segment_rest_sec', 120),
          'B', jsonb_build_object('preferred_segment_type', 'amrap',  'purpose', 'secondary', 'time_cap_sec', 480,  'post_segment_rest_sec', 60),
          'C', jsonb_build_object('preferred_segment_type', 'amrap',  'purpose', 'accessory', 'time_cap_sec', 480,  'post_segment_rest_sec', 60),
          'D', jsonb_build_object('preferred_segment_type', 'amrap',  'purpose', 'accessory', 'time_cap_sec', 480,  'post_segment_rest_sec', 0)
        ),
        'endurance', jsonb_build_object(
          'A', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'main',      'time_cap_sec', 600, 'post_segment_rest_sec', 90),
          'B', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'secondary', 'time_cap_sec', 600, 'post_segment_rest_sec', 90),
          'C', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 600, 'post_segment_rest_sec', 90),
          'D', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 600, 'post_segment_rest_sec', 0)
        )
      )

    ), -- end segmentation

    'progression', jsonb_build_object(
      'apply_to_purposes', jsonb_build_array('main', 'secondary', 'accessory')
    )

  ) AS program_generation_config_json,
  s.program_type,
  s.progression_by_rank_json,
  s.schema_version,
  s.total_weeks_default,
  s.week_phase_config_json,
  now()
FROM hyrox_seed s
ON CONFLICT (config_key)
DO UPDATE SET
  is_active                    = EXCLUDED.is_active,
  notes                        = EXCLUDED.notes,
  program_generation_config_json = EXCLUDED.program_generation_config_json,
  program_type                 = EXCLUDED.program_type,
  progression_by_rank_json     = EXCLUDED.progression_by_rank_json,
  schema_version               = EXCLUDED.schema_version,
  total_weeks_default          = EXCLUDED.total_weeks_default,
  week_phase_config_json       = EXCLUDED.week_phase_config_json,
  updated_at                   = now();
```

Run `docker compose run --rm flyway migrate` after saving.

**Acceptance:**
```
docker compose exec db psql -U app -d app -c \
  "SELECT config_key, program_type, total_weeks_default FROM program_generation_config WHERE program_type = 'hyrox'"
```
Must return one row: `hyrox_default_v1 | hyrox | 8`.

Also verify the endurance block semantics are present:
```
docker compose exec db psql -U app -d app -c \
  "SELECT program_generation_config_json->'segmentation'->'block_semantics_by_focus'->'endurance'->'A'->>'time_cap_sec' AS endurance_a_cap FROM program_generation_config WHERE config_key = 'hyrox_default_v1'"
```
Must return `600`.

---

## PROMPT 6 — Rep Rules Seed: Hyrox

**File to modify:** `migrations/R__seed_program_rep_rules.sql`

Read the file. Find the end of the last program type's rules block. Append the following Hyrox rules block after it.

**IMPORTANT before writing:** Read how the existing rep rule INSERTs specify their column list. The `rests_after_set_sec` and `rest_after_round_sec` columns may have slightly different names — match the exact column names used elsewhere in the file.

Also confirm whether `reps_unit` is a column in the existing inserts. If it is not present in the existing column lists, do not add it to the Hyrox inserts either; instead note this as a gap to fix separately.

```sql
-- ── Hyrox rep rules ──────────────────────────────────────────────────────────
-- AMRAP item rules: no rest, no tempo, no RIR — pure distance or rep prescriptions.
-- Single (power) rules: tempo + rest + RIR for strength quality.

-- Global fallback (matches any hyrox exercise not matched by a specific rule)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_global_fallback', true, 'hyrox', 1, 1,
  NULL, NULL, NULL, NULL,
  10, 15, 'reps', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_global_fallback');

-- Run buy-in (locomotion, run_interval sw)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_run_buy_in', true, 'hyrox', 1, 50,
  NULL, 'amrap', 'locomotion', 'locomotion_compound',
  400, 400, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_run_buy_in');

-- Wallball station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_wallball', true, 'hyrox', 1, 50,
  NULL, 'amrap', 'push_ballistic', 'push_ballistic_compound',
  15, 20, 'reps', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_wallball');

-- Ski erg station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_ski_erg', true, 'hyrox', 1, 55,
  NULL, 'amrap', 'cyclical_engine', NULL,
  250, 300, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_ski_erg');

-- Row erg station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_row_erg', true, 'hyrox', 1, 55,
  NULL, 'amrap', 'cyclical_engine', NULL,
  250, 300, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_row_erg');

-- Sled push station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_sled_push', true, 'hyrox', 1, 55,
  NULL, 'amrap', 'sled_push', 'sled_compound',
  20, 20, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_sled_push');

-- Sled pull station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_sled_pull', true, 'hyrox', 1, 55,
  NULL, 'amrap', 'sled_pull', 'sled_compound',
  20, 20, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_sled_pull');

-- Farmer carry station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_farmer_carry', true, 'hyrox', 1, 55,
  NULL, 'amrap', 'carry', 'carry_compound',
  50, 50, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_farmer_carry');

-- Sandbag lunge station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_sandbag_lunge', true, 'hyrox', 1, 55,
  NULL, 'amrap', 'lunge', 'lunge_compound',
  20, 24, 'reps', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_sandbag_lunge');

-- Burpee broad jump station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_burpee', true, 'hyrox', 1, 50,
  NULL, 'amrap', 'locomotion', 'locomotion_compound',
  8, 10, 'reps', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_burpee');

-- Generic carry fallback (any carry not matched above)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_carry_generic', true, 'hyrox', 1, 30,
  NULL, 'amrap', 'carry', NULL,
  40, 50, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_carry_generic');

-- Generic cyclical engine fallback
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_cyclical_generic', true, 'hyrox', 1, 30,
  NULL, 'amrap', 'cyclical_engine', NULL,
  200, 300, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_cyclical_generic');

-- Generic locomotion fallback (run distances not matched above)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_amrap_locomotion_generic', true, 'hyrox', 1, 30,
  NULL, 'amrap', 'locomotion', NULL,
  300, 400, 'm', 0, 0, 0,
  0, 0, 0, 0,
  0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_locomotion_generic');

-- Power day — strength main (squat, purpose=main, segment=single)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_power_main_squat', true, 'hyrox', 1, 80,
  'main', 'single', 'squat', 'squat_compound',
  3, 5, 'reps', 2, 1, 3,
  3, 0, 1, 0,
  180, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_main_squat');

-- Power day — strength main (hinge, purpose=main, segment=single)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_power_main_hinge', true, 'hyrox', 1, 80,
  'main', 'single', 'hinge', 'hinge_compound',
  3, 5, 'reps', 2, 1, 3,
  3, 1, 1, 0,
  180, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_main_hinge');

-- Power day — pull strength (purpose=main, segment=single)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_power_pull', true, 'hyrox', 1, 70,
  'main', 'single', 'pull_horizontal', NULL,
  5, 8, 'reps', 2, 1, 3,
  2, 0, 1, 0,
  120, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_pull');

-- Power day — push vertical (push_press, purpose fallback)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_power_push_vertical', true, 'hyrox', 1, 60,
  NULL, 'single', 'push_vertical', NULL,
  5, 8, 'reps', 2, 1, 3,
  2, 0, 1, 0,
  90, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_push_vertical');

-- Single segment fallback (power day any single not matched above)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, reps_unit, rir_target, rir_min, rir_max,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec
)
SELECT 'hyrx_power_single_fallback', true, 'hyrox', 1, 10,
  NULL, 'single', NULL, NULL,
  6, 10, 'reps', 2, 1, 3,
  2, 0, 1, 0,
  90, 0
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_single_fallback');
```

Run `docker compose run --rm flyway migrate` after saving.

**Acceptance:**
```
docker compose exec db psql -U app -d app -c \
  "SELECT rule_id, reps_unit, rep_low, rep_high, rest_after_set_sec FROM program_rep_rule WHERE program_type = 'hyrox' ORDER BY priority DESC, rule_id"
```
Must return 19 rows. Rules for carries and runs must have `reps_unit = 'm'`.

Note: The endurance day uses the same rep rules as the engine day. The 10-min time cap is set in the PGC `block_semantics_by_focus["endurance"]`, not in rep rules. No additional rep rules are needed for endurance day in v1.

---

## PROMPT 7 — Narration Templates Seed: Hyrox

**File to modify:** `migrations/R__seed_narration_template.sql`

Read the file first. Find how `applies_json` is populated in existing inserts (some use a `jsonb_build_object`, some use `'{}'::jsonb` or similar). Match the exact pattern.

Append the following templates at the end of the file. All use `WHERE NOT EXISTS` on `template_id`.

The INSERT column list must match the column list used by existing narration template inserts exactly.

**Templates to add:**

```sql
-- ── Hyrox narration templates ─────────────────────────────────────────────────

-- PROGRAM_TITLE
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_program_title', 'program', 'PROGRAM_TITLE', NULL, NULL, 10,
  jsonb_build_array(
    'Hyrox Prep — {DAYS_PER_WEEK}-Day ({DURATION_MINS} min)'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_program_title');

-- PROGRAM_SUMMARY
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_program_summary', 'program', 'PROGRAM_SUMMARY', NULL, NULL, 10,
  jsonb_build_array(
    'Three day types, one goal: the run-station rhythm of a Hyrox race. Engine days build aerobic capacity through 8-minute blocks that open with a run every time. Power days put strength first — squat, press, sled — then drive it through AMRAP circuits. Endurance days deliver 10-minute blocks, all four starting with a run, at a threshold pace you can hold. Every session is race prep.',
    'Hyrox is a pacing problem, not a fitness problem. This program uses three session types to teach you to run, arrive at a station under control, work efficiently, and leave. Engine day: run-station rhythm. Power day: force production and station durability. Endurance day: sustained aerobic output.',
    'Eight weeks of run-station training. Engine sessions pair runs with wallballs, sleds, carries, and ergs — just like a race. Power sessions anchor on squat and press, then build to sled and carry AMRAPs. Endurance sessions use longer 10-minute blocks for threshold engine work. Train to pace. Race to perform.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_program_summary');

-- PROGRESSION_BLURB
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_progression_blurb', 'program', 'PROGRESSION_BLURB', NULL, NULL, 10,
  jsonb_build_array(
    'Each week raises the target round count by one. Chase the numbers — but hold your pace. A slower round completed is better than a fast round abandoned.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_progression_blurb');

-- WEEK_FOCUS: BASELINE
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_week_baseline', 'week', 'WEEK_FOCUS', NULL, NULL, 10,
  jsonb_build_array(
    'Learn the movements. Build pacing discipline before you chase rounds.',
    'Baseline week: sub-maximal effort. Get comfortable with the block format and each station.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_week_baseline');

-- WEEK_FOCUS: BUILD
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_week_build', 'week', 'WEEK_FOCUS', NULL, NULL, 10,
  jsonb_build_array(
    'Push the blocks. Add a round where you can sustain form and pace.',
    'Build phase: increase effort gradually. A negative split — getting stronger through the block — is the target.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_week_build');

-- WEEK_FOCUS: CONSOLIDATE
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_week_consolidate', 'week', 'WEEK_FOCUS', NULL, NULL, 10,
  jsonb_build_array(
    'Hold quality. Reduce volume. Arrive fresh.',
    'Consolidate phase: do not add rounds. Sharpen movement efficiency and transitions.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_week_consolidate');

-- WEEK_FOCUS: PEAK
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_week_peak', 'week', 'WEEK_FOCUS', NULL, NULL, 10,
  jsonb_build_array(
    'Race-intensity effort. Treat every block like a race station. Arrive at each run ready to push.',
    'Peak week: near-maximal output. Minimal rest transitions. Simulate the conditions of race day.',
    'This is what you have been building toward. Race-effort blocks, race-pace runs, race-level discipline.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_week_peak');

-- DAY_TITLE: engine
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_day_engine_title', 'day', 'DAY_TITLE', NULL, NULL, 10,
  jsonb_build_array('Engine Day'),
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'engine'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_engine_title');

-- DAY_TITLE: power
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_day_power_title', 'day', 'DAY_TITLE', NULL, NULL, 10,
  jsonb_build_array('Power Day'),
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'power'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_power_title');

-- DAY_GOAL: engine
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_day_engine_goal', 'day', 'DAY_GOAL', NULL, NULL, 10,
  jsonb_build_array(
    'Four 8-minute blocks. Start each run at a pace you can hold through the station. Do not sprint the buy-in.',
    'Focus on the run-station rhythm today. Consistent pacing across all four blocks beats a fast first block followed by collapse.',
    'Engine work. Your aerobic system is the engine that keeps your stations clean in a race. Train it today.'
  ),
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'engine'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_engine_goal');

-- DAY_GOAL: power
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_day_power_goal', 'day', 'DAY_GOAL', NULL, NULL, 10,
  jsonb_build_array(
    'Strength foundation first, then three AMRAP blocks. The squat and press sets build the capacity to hold sled and carry form when you are deeply fatigued.',
    'Power day: heavy work, then hard blocks. Block A is real strength — use it. Block B is sled and carry — the stations that decide race splits. Block C is the run-wallball transfer. Treat it like race day.',
    'Build the engine chassis today. Squat, press, sled, carry, wallball. Every exercise earns its place by making you more durable in a Hyrox race.'
  ),
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'power'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_power_goal');

-- DAY_TITLE: endurance
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_day_endurance_title', 'day', 'DAY_TITLE', NULL, NULL, 10,
  jsonb_build_array('Endurance Day'),
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'endurance'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_endurance_title');

-- DAY_GOAL: endurance
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_day_endurance_goal', 'day', 'DAY_GOAL', NULL, NULL, 10,
  jsonb_build_array(
    'Four 10-minute blocks. Every block starts with a run. Your only job today is to arrive at each station under control and hold your pace through all four blocks.',
    'Threshold work. Every block opens with a run buy-in — just like the race. If your pace in block 4 is significantly faster than block 1, you went out too easy. If it is slower, you went out too hard. Find the line.',
    'Aerobic engine day. Longer blocks, all four starting with a run, station pairs that match the race. The goal is sustained output — not max effort, not easy effort. Find race pace and hold it.'
  ),
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'endurance'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_endurance_goal');

-- SEGMENT_TITLE: amrap blocks
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_seg_amrap_title', 'segment', 'SEGMENT_TITLE', NULL, 'amrap', 10,
  jsonb_build_array('Block {SEGMENT_INDEX} — AMRAP'),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_title');

-- SEGMENT_EXECUTION: amrap blocks
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_seg_amrap_execution', 'segment', 'SEGMENT_EXECUTION', NULL, 'amrap', 10,
  jsonb_build_array(
    '8-minute AMRAP. Complete as many rounds as possible. Rest 60 seconds before the next block.',
    'As Many Rounds As Possible in 8 minutes. Keep a consistent pace — do not go out too hot. Rest 60 seconds after the clock stops.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_execution');

-- SEGMENT_INTENT: amrap blocks
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_seg_amrap_intent', 'segment', 'SEGMENT_INTENT', NULL, 'amrap', 10,
  jsonb_build_array(
    'Target: {ROUNDS} rounds. Start conservative — your pace in round 1 should be the same in round {ROUNDS}.',
    'Settle into a rhythm you can hold for all 8 minutes. Negative split is the goal.',
    'Race discipline: pick a pace from the first rep and hold it. Do not accelerate until the last 90 seconds.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_intent');

-- SEGMENT_EXECUTION: endurance day AMRAP blocks (10-min, overrides generic 8-min template)
-- Higher priority (5) so it takes precedence over hyrx_seg_amrap_execution (priority 10) for endurance days.
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_seg_amrap_endurance_execution', 'segment', 'SEGMENT_EXECUTION', NULL, 'amrap', 5,
  jsonb_build_array(
    '10-minute AMRAP. This is a threshold block — find a pace you can sustain for the full 10 minutes. Rest 90 seconds before the next block.',
    'As Many Rounds As Possible in 10 minutes. Negative split is the goal: aim to be moving as well in minute 9 as in minute 1. Rest 90 seconds after the clock stops.'
  ),
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'endurance'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_endurance_execution');

-- SEGMENT_INTENT: endurance AMRAP blocks
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_seg_amrap_endurance_intent', 'segment', 'SEGMENT_INTENT', NULL, 'amrap', 5,
  jsonb_build_array(
    'Threshold pace. Not a sprint, not a jog. The pace you could hold for 20 minutes if you had to.',
    'Target: {ROUNDS} rounds at a pace that feels controlled. If you need to stop within a round, you are going too hard.',
    'Race discipline: pick an effort level from the first rep and commit to it. Consistency across 10 minutes is the training adaptation you are after.'
  ),
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'endurance'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_endurance_intent');

-- SEGMENT_TITLE: power strength block (single, main)
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_seg_strength_title', 'segment', 'SEGMENT_TITLE', 'main', 'single', 10,
  jsonb_build_array('Strength Foundation'),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_strength_title');

-- SEGMENT_EXECUTION: power strength block
INSERT INTO public.narration_template (
  template_id, scope, field, purpose, segment_type, priority,
  text_pool_json, applies_json, is_active
)
SELECT
  'hyrx_seg_strength_execution', 'segment', 'SEGMENT_EXECUTION', 'main', 'single', 10,
  jsonb_build_array(
    '{SETS} sets × {REP_RANGE}. Rest {REST_SEC}s between sets. This is your only strength block — execute it with precision.'
  ),
  jsonb_build_object('program_type', 'hyrox'),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_strength_execution');
```

Run `docker compose run --rm flyway migrate` after saving.

**Acceptance:**
```
docker compose exec db psql -U app -d app -c \
  "SELECT template_id, scope, field FROM narration_template WHERE applies_json->>'program_type' = 'hyrox' ORDER BY scope, field"
```
Must return at least 20 rows spanning program, week, day, and segment scopes. Confirm rows exist for `day_focus = 'endurance'` (endurance title, goal, AMRAP execution, AMRAP intent). Confirm `hyrx_week_peak` is present.

---

## PROMPT 8 — Goal Routing

**File to modify:** `api/server.js`

Read the file. Find `GOAL_TO_PROGRAM_TYPE` (or the equivalent map that converts goal strings to program type slugs). Add entries for Hyrox:

```javascript
"Hyrox": "hyrox",
"hyrox": "hyrox",
"HYROX": "hyrox",
```

Also search for any array or set that whitelists valid program type strings (e.g. a `VALID_PROGRAM_TYPES` constant or a validation check). If found, add `"hyrox"` to it.

Restart the API container after saving:
```
docker compose up -d --force-recreate api
```

**Acceptance:**
POST to the generate-program endpoint with a profile that includes `goals: ["Hyrox"]` (or equivalent). Confirm the returned program has `program_type: "hyrox"` in its output.

---

## PROMPT 9 — End-to-End Smoke Test (Read / Run Only)

**Do not modify any files in this prompt.**

Generate a Hyrox program via the API. Use these parameters:
- `days_per_week: 3`
- `duration_mins: 50`
- `goals: ["Hyrox"]` (or `programType: "hyrox"` directly if the API supports it)
- `fitness_rank: 2` (intermediate)

Then verify each of the following. Report PASS or FAIL with evidence for each check.

**A. Program type**
`program.program_type === "hyrox"`. Report the actual value.

**B. Day count and focus rotation**
Three days. Day 1 has `day_focus: "engine"`. Day 2 has `day_focus: "power"`. Day 3 has `day_focus: "endurance"`. Report the actual `day_focus` values for each day.

**C. Engine day segment types**
Day 1 has 4 (or more, counting warmup/cooldown) segments. All work segments (purpose not warmup/cooldown) are `segment_type: "amrap"`. Report segment types for Day 1.

**D. Power day segment types**
Day 2 segment 1 (or first work segment) is `segment_type: "single"` and `purpose: "main"`. Subsequent work segments are `segment_type: "amrap"`. Report segment types for Day 2.

**E. `time_cap_sec` on AMRAP segments**
All AMRAP segments on Day 1 (engine) have `time_cap_sec: 480`. All AMRAP segments on Day 3 (endurance) have `time_cap_sec: 600`. Report the `time_cap_sec` values for all work segments on Day 1 and Day 3.

**E2. Endurance day `post_segment_rest_sec`**
Blocks A/B/C on Day 3 (endurance) have `post_segment_rest_sec: 90`. Block D has `post_segment_rest_sec: 0`. Report the values.

**F. `post_segment_rest_sec` values**
Blocks A/B/C on engine days have `post_segment_rest_sec: 60`. Block D has `post_segment_rest_sec: 0`. Report the values for Day 1.

**G. Buy-in items**
Engine Day 1: at least 3 of 4 blocks have an item with `is_buy_in: true`. Endurance Day 3: all 4 blocks have an item with `is_buy_in: true`. Report which items have `is_buy_in: true` and their `ex_id` for both days.

**H. Rep rules applied to run items**
Items with `mp: "locomotion"` on engine days have `reps_unit: "m"` and `rep_high >= 300`. Report the `reps_prescribed` and `reps_unit` for all locomotion items on Day 1.

**I. SEG row column count**
In the emitted pipe rows, count the number of `|`-separated values in a SEG row. Must be 20. Report the count and the last two columns.

**J. Power day strength sets**
The single segments on Day 2 (power) have `sets >= 3` and `reps_unit: "reps"`. Report sets and reps for each strength segment item.

---

## PROMPT 10 — Mobile Parser Update

**Files to modify:**
- `mobile/src/api/programViewer.ts`
- `mobile/src/components/program/SegmentCard.tsx`

Read both files in full before making any changes.

**Change 1 — `programViewer.ts`**

Find the function or block that parses SEG rows from the pipe-delimited program output. It will split on `"|"` and read columns by index. The existing SEG row has columns 0–18.

Add parsing of the new column 19:
```typescript
post_segment_rest_sec: parseInt(cols[19] || "0", 10),
```

Add `post_segment_rest_sec: number` to the segment type definition (interface or type alias) if one exists in this file.

**Change 2 — `SegmentCard.tsx`**

Find the component. After the segment's work content renders, add a rest indicator that appears when `segment.post_segment_rest_sec > 0`:

```tsx
{segment.post_segment_rest_sec > 0 && (
  <View style={styles.restRow}>
    <Text style={styles.restLabel}>
      Rest {segment.post_segment_rest_sec}s before next block
    </Text>
  </View>
)}
```

Add appropriate styles to the component's `StyleSheet` for `restRow` and `restLabel`. Match the visual style of existing rest indicators in the file if any exist; otherwise use neutral secondary text styling consistent with the file's existing style patterns.

Do not add a countdown timer in this prompt — the label is sufficient for v1. A timer can be added in a future prompt.

---

## Notes for Codex

- **`reps_unit` column:** If Prompt 6 discovers that `reps_unit` does not exist as a column in `program_rep_rule`, stop and report. Do not add the column silently — raise it as a gap and wait for instruction before proceeding.
- **`block_semantics_by_focus` key path:** The exact key path depends on what `configValidation.js` exposes. Prompt 1's audit determines this. If the audit reveals a different structure, adjust Prompts 4B and 5 accordingly before executing them.
- **Sled exercise selection:** If no sled exercises are in the catalogue when the power day template runs, the `fill_fallback_slot` mechanism will substitute `B:carry_heavy`. This is expected behaviour — do not treat it as an error.
- **Flyway repeatable migrations:** `R__` files re-run whenever their checksum changes. All new INSERTs are guarded with `WHERE NOT EXISTS` to remain idempotent.
