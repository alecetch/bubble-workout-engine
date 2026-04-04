# Exercise Catalogue Duplicate-ID Cleanup Plan

## Goal

Stop `exercise_catalogue` drift caused by multiple authoritative repeatable migrations and prevent duplicate movement rows such as:

- `bb_back_squat` vs `barbell_back_squat`
- `bb_front_squat` vs `barbell_front_squat`
- `wall_ball` vs `wallball_6kg` / `wallball_9kg` variants where content was only authored on one side

This plan covers:

- source-of-truth ownership
- one-time duplicate cleanup
- admin guardrails to stop recurrence

## Problem Summary

The repo currently has two repeatable migrations that both act as sources of truth for `exercise_catalogue`:

- [R__seed_exercise_catalogue.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_exercise_catalogue.sql)
- [R__exercise_catalogue_edits.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__exercise_catalogue_edits.sql)

These files disagree on `exercise_id` values for the same underlying movement. Example:

- [R__seed_exercise_catalogue.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_exercise_catalogue.sql#L128) uses `barbell_back_squat`
- [R__exercise_catalogue_edits.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__exercise_catalogue_edits.sql#L332) uses `bb_back_squat`

This creates three downstream issues:

1. Duplicate rows exist for the same movement.
2. Seeds such as [R__seed_coaching_cues.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_coaching_cues.sql) may target the wrong duplicate.
3. Preview/mobile selection uses exact `exercise_id`, so cues and other exercise-owned content appear inconsistent.

## Recommendation

Make [R__exercise_catalogue_edits.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__exercise_catalogue_edits.sql) the only authoritative repeatable migration for `exercise_catalogue`.

Treat [R__seed_exercise_catalogue.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_exercise_catalogue.sql) as deprecated for live catalogue ownership.

Reasoning:

- `R__exercise_catalogue_edits.sql` reflects the current admin-managed catalogue state.
- It already contains the IDs actively being selected by preview and the engine.
- Continuing to run both repeatables guarantees future reintroduction of duplicate IDs.

## Target End State

1. Only one repeatable migration writes `exercise_catalogue`.
2. Every movement has one canonical `exercise_id`.
3. Variant rows only exist when they are intentional exercise variants, not rename aliases.
4. Exercise-owned content such as `coaching_cues_json` is authored only on canonical rows or on intentional variants.
5. Admin UI blocks or warns on duplicate-name / likely-rename inserts.

## Phase 1: Stop The Bleeding

### 1. Retire `R__seed_exercise_catalogue.sql` as a live writer

Preferred action:

- Remove it from Flyway ownership by renaming it out of the repeatable migration pattern, for example:
  - `archive__seed_exercise_catalogue.sql`
  - or move it under `/docs` or another non-Flyway folder

Alternative if you want to retain the file in place temporarily:

- replace its body with a short comment explaining it is deprecated and no longer authoritative

Requirement:

- after this change, only [R__exercise_catalogue_edits.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__exercise_catalogue_edits.sql) should mutate `exercise_catalogue`

### 2. Freeze exercise-owned seeds until canonical IDs are reconciled

Before adding more content to:

- `coaching_cues_json`
- `load_guidance`
- `logging_guidance`

first reconcile duplicate IDs, otherwise content will continue landing on the wrong row.

## Phase 2: One-Time Duplicate Reconciliation

### 1. Build a duplicate audit table

For each duplicate movement pair/group, record:

- canonical `exercise_id`
- duplicate `exercise_id`
- same `name` or normalized-name match
- whether both rows are selected by engine logic
- whether either row has authored content
- keep/delete recommendation

Initial known duplicate set includes at least:

- `bb_back_squat` / `barbell_back_squat`
- `bb_bench_press` / `bench_press`
- `bb_bentover_row` / `barbell_row`
- `bb_deadlift` / `barbell_deadlift`
- `bb_front_squat` / `barbell_front_squat`
- `bb_good_morning` / `barbell_good_morning`
- `bb_overhead_press` / `ohp`
- `bb_push_press` / `push_press`
- `bb_romanian_deadlift` / `barbell_rdl`
- `bb_standing_calf_raise` / `barbell_standing_calf_raise`
- `chestsupported_row_machine` / `chest_supported_row`
- `cyclist_squat_heels_elevated` / `cyclist_squat`
- `db_incline_curl` / `incline_db_curl`
- `db_lateral_raise` / `lateral_raise`
- `feetelevated_inverted_row` / `feet_elevated_inverted_row`
- `feetelevated_pushup` / `feet_elevated_pushup`
- `hack_squat_machine` / `hack_squat`
- `incline_bb_bench_press` / `incline_bench_press`
- `kb_rdl` / `kettlebell_romanian_deadlift` style alias if both exist
- `oh_triceps` / long-form overhead extension alias if both exist
- `pec_deck` / long-form pec deck alias if both exist
- `pullup` / `pull_up`
- `rear_delt_fly` / long-form alias if both exist
- `seated_cable_row` / `cable_row`
- `shuttle_runs` / `shuttle_run`
- `singlearm_db_row` / `db_row`
- `bw_rdl` / `single_leg_rdl` or bodyweight alias if both exist
- `stepup_weighted` / `weighted_step_up`
- `straightarm_pulldown` / `straight_arm_pd`
- `toestobar` / `toes_to_bar`

Note:

- not every similarly named pair should be merged automatically
- weight variants like `wallball_6kg` and `wallball_9kg` may be intentional variants, not duplicates

### 2. Choose canonical IDs

Rule:

- keep the IDs currently used by the admin-managed catalogue and active selector behavior
- based on current evidence, that usually means the shorter IDs in `R__exercise_catalogue_edits.sql`

Examples:

- keep `bb_back_squat`, remove `barbell_back_squat`
- keep `bb_front_squat`, remove `barbell_front_squat`
- keep `pullup`, remove `pull_up`

### 3. Migrate exercise-owned content onto canonical rows

Before deleting duplicate rows:

- copy `coaching_cues_json`
- copy `load_guidance`
- copy `logging_guidance`
- copy any future exercise-owned fields

from duplicate rows onto the canonical row if canonical values are blank.

### 4. Delete duplicate alias rows

Use an explicit migration, not manual admin edits.

That migration should:

1. update dependent data first if needed
2. delete duplicate non-canonical rows from `exercise_catalogue`

Dependency check required before delete:

- `program_exercise.exercise_id`
- any rule tables or coverage logic that store `exercise_id`
- any media/commentary linkage keyed by `exercise_id`

If historical data references old duplicate IDs, either:

- leave history untouched and only clean catalogue going forward
- or add a mapping migration for persisted program rows if that matters

## Phase 3: Admin Guardrails

The admin UI should change so likely rename aliases are caught before they become rows.

### 1. Duplicate-name detection on create/clone/import

When creating or importing a row, warn or block if normalized `name` matches an existing active row.

Recommended normalization:

- lowercase
- trim whitespace
- collapse repeated spaces
- strip punctuation
- normalize hyphen/space differences

Example collisions to catch:

- `Barbell Back Squat`
- `Barbell Back Squat `
- `Barbell Back-Squat`

### 2. Likely-rename alias detection on `exercise_id`

Warn when a new `exercise_id` appears to be a lexical alias of an existing row with the same normalized name.

Examples:

- `bb_back_squat` vs `barbell_back_squat`
- `pullup` vs `pull_up`
- `toestobar` vs `toes_to_bar`

Suggested admin message:

`A likely duplicate already exists for this movement. If this is a rename, update the existing row instead of creating a new exercise.`

### 3. Immutable-ID policy in admin UX

Once an exercise exists:

- `exercise_id` should be treated as stable
- changing the display name should not require a new row

Admin implication:

- keep `name` editable
- keep `exercise_id` read-only in normal edit flow
- provide a separate explicit “rename exercise id” workflow only if truly needed

### 4. Import dry-run warnings

The CSV dry-run in the admin exercise catalogue tool should warn on:

- duplicate normalized names
- likely alias IDs
- rows that would create a second active exercise with the same movement identity

## Phase 4: Seed Discipline

Any future content seed that targets exercises by ID must source IDs from the authoritative catalogue only.

For example:

- [R__seed_coaching_cues.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_coaching_cues.sql)

should be generated from the canonical live catalogue or admin-managed snapshot, not from an older export/spec list.

Recommended rule:

- before authoring any exercise-owned seed, export the current canonical `exercise_id` list from the active catalogue source

## Proposed Execution Order

1. Retire [R__seed_exercise_catalogue.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_exercise_catalogue.sql) as a repeatable migration.
2. Produce a duplicate audit for all suspect pairs.
3. Approve keep/delete decisions.
4. Create a one-time reconciliation migration:
   - copy exercise-owned content onto canonical rows
   - delete duplicate alias rows
5. Regenerate [R__exercise_catalogue_edits.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__exercise_catalogue_edits.sql) from the cleaned catalogue.
6. Regenerate [R__seed_coaching_cues.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_coaching_cues.sql) against canonical IDs only.
7. Add admin duplicate/alias validation.

## Recommended Immediate Decision

Approve these two rules now:

1. `R__exercise_catalogue_edits.sql` is the sole authoritative repeatable migration for `exercise_catalogue`.
2. No new exercise-owned content seeds should be authored until duplicate-ID reconciliation is complete.

## Open Questions

1. Do you want historical `program_exercise` rows with old duplicate IDs left untouched, or remapped?
2. Are weighted variants such as `wallball_6kg` and `wallball_9kg` intentional permanent variants, or should they inherit from a base row?
3. Should admin duplicate detection block saves, or warn and allow override?

## Success Criteria

This cleanup is successful when:

- only one repeatable migration owns `exercise_catalogue`
- duplicate alias rows for the same movement are removed
- preview selects only canonical IDs for base movements
- exercise-owned content appears reliably because it is authored on the selected row
- admin create/clone/import flows warn before duplicate movements can be created again
