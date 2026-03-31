# Feature Merge Summary 2026-03

This document is a reviewer-oriented summary of the March 2026 feature batch in `bubble-workout-engine`. It covers the implemented scope, the main architectural changes, the runtime flow, the admin authoring surface, the seed/deploy implications, and the known v1 limitations.

## Scope

Implemented in this batch:

- Feature 1: config-driven variability policy with `none | med | high` and explicit `slot_family`
- Feature 2: catalogue-rule consistency health report with a shared rep-rule matcher and guarded admin surface
- Feature 3: ordered HYROX simulation day support with fallback chains, sticky stability, and visible degradation metadata
- Follow-up correction: day-level `day_selection_mode: "default" | "benchmark_exactness"` for benchmark/simulation exactness without weakening ordinary week-level variety
- Follow-up admin work: config-editor support for variability/simulation fields plus targeted UX hardening for HYROX authoring

Out of scope:

- DB redesign
- new simulation tables
- rep-rule redesign
- large admin UX redesign
- end-to-end catalogue schema expansion for HYROX station metadata

## High-Level Architecture

The feature set was implemented by extending the existing pipeline in narrow, additive ways:

- Step 01 remains the main builder/orchestration point for slot resolution.
- Step 02 remains the segmentation point, with one narrow ordered-simulation branch.
- Step 04 now shares rep-rule matching logic with diagnostics through an extracted matcher.
- Configuration remains the main control surface through `program_generation_config`.
- No persistent runtime state was added; sticky/variability state is per-build and ephemeral.

The main design principle was to preserve current behavior for existing configs unless the new fields are explicitly set.

## Feature 1: Variability Policy

### Intent

Add slot-level variability behavior without changing default selection behavior:

- `high`: current behavior unchanged
- `none`: stable sticky choice across the program for a `slot_family`
- `med`: sticky within a scoped block occurrence, with soft canonical-name avoidance across later occurrences

### Main Files

- `api/engine/variabilityState.js`
- `api/engine/selectorStrategies.js`
- `api/engine/exerciseSelector.js`
- `api/engine/resolveCompiledConfig.js`
- `api/engine/configValidation.js`
- `api/engine/steps/01_buildProgramFromDefinition.js`

### Runtime Design

`variabilityState` is created once per Step 01 build and stored in builder state. It carries:

- `programSticky`
- `programStickyMeta`
- `blockSticky`
- `blockStickyMeta`
- `blockHistory`

Current behavior by policy:

- `high`
  - no sticky reuse
  - uses normal selector path
  - current behavior for non-annotated slots/configs

- `none`
  - keyed by `slot_family`
  - first successful pick is recorded in `programSticky`
  - later picks for the same family bypass normal selector-time dedup/soft-avoid and reuse the stored exercise directly
  - same-day tracking sets are still updated after reuse

- `med`
  - block stickiness is keyed by day-scoped block occurrence plus family
  - later occurrences in the same scoped block reuse the same choice
  - cross-block history is recorded by canonical name
  - canonical names from history are merged into the existing same-day canonical-name avoid set as a soft avoid signal

### Important Reviewer Notes

- `none` is intentionally stronger than week dedup because reuse bypasses the normal selector path.
- `med` is intentionally soft and reuses the same canonical-name avoidance channel rather than introducing a second scoring system.
- Feature 3 reuses the same `none` sticky mechanism for ordered simulation stability.

### Post-Feature-1 Correction

The later HYROX review exposed a separate concern from `variability_policy`: benchmark/simulation days may need to repeat an exact station exercise even if it was already used earlier in the week.

That logic is now expressed separately at the day level:

- `day_selection_mode: "default" | "benchmark_exactness"`

Runtime effect:

- `default`
  - normal `usedIdsWeek` behavior
- `benchmark_exactness`
  - Step 01 passes `usedIdsWeek = null` for that day's selection attempts
  - selector additionally tries the most specific authored slot definition first before relaxing to broader `sw2`/`mp` matching

This keeps weekly variety and benchmark fidelity as separate concepts:

- `variability_policy` controls stability / variation behavior
- `day_selection_mode` controls whether day-level exactness may override week dedupe

## Feature 2: Catalogue-Rule Consistency Health Report

### Intent

Add an internal admin health report to detect drift between:

- `exercise_catalogue`
- `program_rep_rule`
- config slot `requirePref` usage
- slot coverage by preset/config

### Main Files

- `api/engine/repRuleMatcher.js`
- `api/engine/steps/04_applyRepRules.js`
- `api/src/services/catalogueRuleHealth.js`
- `api/src/routes/adminHealth.js`
- `api/admin/health.html`
- `api/server.js`

### Main Architectural Change

The important change here was extraction of shared rep-rule matching logic into:

- `api/engine/repRuleMatcher.js`

This module now owns:

- rule normalization
- specificity scoring
- direct rule matching
- fallback context generation
- best-rule selection with fallback
- item context creation

That logic is reused by:

- Step 04 runtime rule application
- the health report service

This avoids a second hand-maintained copy of rule matching semantics.

### Health Report Sections

The report payload includes:

- `summary`
- `rule_coverage`
- `orphaned_rules`
- `orphaned_prefs`
- `uncovered_exercises`
- `slot_coverage`
- `presets`
- `ranks`

### Report Logic Split

Shared/runtime-aligned logic:

- rep-rule matching through `repRuleMatcher.js`

Report-specific logic:

- orphaned rule dimension detection
- pref-tag collection from config JSON
- fallback-only exercise coverage classification
- structural slot coverage by preset/rank
- near-render-ready summary shaping

### Important Reviewer Notes

- Feature 3 did not extend `catalogueRuleHealth.js`; that was intentional to avoid turning the health report into a simulation-specific subsystem.
- The report is still heuristic in places, especially `uncovered_exercises`, but the actual rule-match semantics remain shared with runtime.

## Feature 3: Ordered HYROX Simulation Day

### Intent

Support a prescribed ordered simulation day that:

- preserves declared run/station order
- resolves slots through an explicit fallback chain
- keeps chosen substitutions stable for the athlete
- surfaces degradation clearly

### Main Files

- `api/engine/orderedSimulation.js`
- `api/engine/steps/01_buildProgramFromDefinition.js`
- `api/engine/steps/02_segmentProgram.js`
- `api/engine/configValidation.js`
- `api/engine/exerciseSelector.js`
- `api/data/export_Hyrox-ProgramGenerationConfigs-supplement_2026-03-29.csv`
- `api/scripts/import_bubble_exports.mjs`
- `api/scripts/check_seeds.mjs`
- `api/scripts/sql/smoke_seed_checks.sql`

### Runtime Design

#### Step 01

If a day template has `is_ordered_simulation: true`:

- Step 01 uses all declared slots instead of applying normal block-budget truncation
- each slot is resolved through `resolveOrderedSimulationSlot(...)`
- fallback attempts are generated from `station_fallback_chain`
- first successful attempt wins
- blocks receive explicit simulation metadata
- no-match cases emit `fill: "simulation_unresolvable"` blocks rather than silently converting to generic fill logic

The degradation model is explicit:

- fallback chain entry `0` => `exact`
- entry `1` => `family`
- entry `2+` => `fallback`
- no match => `unresolvable`

For simulation slots using `variability_policy: "none"`:

- the first resolved exercise is recorded in `programSticky`
- sticky metadata is also recorded
- later days reuse both the same exercise and the same degradation metadata

For simulation or benchmark-authored days using `day_selection_mode: "benchmark_exactness"`:

- Step 01 bypasses week-level dedupe for that day's selection attempts
- selector gives priority to the most specific authored slot definition before broad family matching
- this was added specifically to support exact station fidelity such as repeating `sandbag_lunge` on a HYROX simulation day even when it already appeared earlier in the week

#### `orderedSimulation.js`

This helper owns:

- simulation slot field normalization
- fallback-chain normalization
- degradation classification
- attempt-level filter matching for:
  - `requireHyroxRole`
  - `station_index`
  - `required_equipment_slugs`

It does not own:

- selector calls
- sticky-state integration
- block assembly
- stats/debug writing

Those remain in Step 01.

#### Step 02

Normal segmentation groups real blocks by block letter.

For ordered simulation days only, `segmentDayFromBlocks(...)` now takes a narrow alternate path:

- iterates `day.blocks` in array order
- emits one `single` segment per real block
- preserves the original slot order even when block letters repeat, such as `A`, `B`, `A`
- copies simulation metadata onto segment items

Non-simulation days still use the original grouping logic.

### Important Reviewer Notes

- The Feature 3 path is intentionally narrow and isolated.
- It does not redesign Step 04.
- It does not alter non-simulation segmentation semantics.
- It relies on config-authored fallback chains because the current real catalogue import path does not yet provide full HYROX metadata.

## Config and Validation Changes

### New/Extended Config Fields

Feature 1:

- `slot_family`
- `variability_policy`
- `builder.block_variability_defaults`
- `day_template.day_selection_mode`

Feature 3:

- `day_template.is_ordered_simulation`
- `slot.requireHyroxRole`
- `slot.station_index`
- `slot.required_equipment_slugs`
- `slot.station_fallback_chain`

### Validation

`api/engine/configValidation.js` now validates:

- known variability policies
- known day selection modes
- known simulation field shapes
- station fallback chain entry structure
- positive `station_index` values
- array shape for `required_equipment_slugs`

Reviewer note:

- Validation is intentionally additive and only activates when these fields are present.

## Seed and Deploy Implications

### Config Seeding

The repo's practical config import path is the Bubble export importer:

- `api/scripts/import_bubble_exports.mjs`

Before Feature 3, the repo's program-generation-config export only contained a hypertrophy config row. To support a real seeded HYROX config without redesigning the seed path, the implementation added:

- `api/data/export_Hyrox-ProgramGenerationConfigs-supplement_2026-03-29.csv`

and extended the importer to load that supplement.

This is intentionally pragmatic rather than ideal.

### Seed Smoke Checks

The deploy pipeline now depends on:

- `api/scripts/check_seeds.mjs`
- `api/scripts/sql/smoke_seed_checks.sql`

These were aligned with the currently guaranteed seeded dataset so Flyway seed verification and local SQL smoke checks are consistent.

## Admin UI / Authoring Surface

The original feature work was runtime-first. A later follow-up added the corresponding authoring controls to the admin config editor:

- `api/admin/index.html`

Added editor support:

- Feature 1 authoring
  - `slot_family`
  - `variability_policy`
  - `builder.block_variability_defaults`
- Feature 3 authoring
  - `is_ordered_simulation`
  - `day_selection_mode`
  - simulation slot filters
  - `station_fallback_chain`

Follow-up UI hardening / corrections:

- `Family` is guided by a `datalist` of existing `slot_family` values but still allows a conscious new value
- simulation controls only render when `ordered simulation day` is checked
- block rows in sets / budget / block-variability derive from actual configured block letters rather than assuming `A-D`
- slot ids are validated to `^[A-Z]:.+`
- `pref_mode` dropdown labeling was corrected to:
  - `(default soft)`
  - `strict`
  - `soft`
- left-hand config sidebar can be collapsed for readability
- preview page gained a narration visibility toggle (`api/admin/preview.html`)

Reviewer note:

- admin persistence remains generic JSON save/load through the existing config endpoints; no backend admin route redesign was required

## Tests Added / Relied On

Feature 1:

- selector strategy tests
- variability state tests
- Step 01 builder tests
- config validation tests

Feature 2:

- shared matcher tests
- Step 04 regression tests
- health report service tests
- admin route tests

Feature 3:

- ordered simulation Step 01 tests:
  - exact hit
  - fallback hit
  - sticky reuse under `none`
  - explicit unresolvable behavior
- benchmark-exactness Step 01 test:
  - earlier day consumes exact exercise
  - later benchmark/simulation day can still repeat it
  - ordinary day mode still preserves current week-dedupe behavior
- Step 02 ordered-segmentation test
- config validation tests for simulation fields

The final cleanup/verification sweep also confirmed these feature sets pass together.

## Known v1 Limitations

- The real exercise catalogue import/export path does not currently include `hyrox_role` and `hyrox_station_index`.
- `api/engine/exerciseSelector.js` and the in-memory index can carry those fields when present, but current source data does not provide them end-to-end.
- HYROX simulation matching is therefore more config-driven than ideal in v1.
- HYROX exactness still depends on authored config specificity (`sw`, `requirePref`, `day_selection_mode`) because catalogue metadata is incomplete.
- `api/data/export_Hyrox-ProgramGenerationConfigs-supplement_2026-03-29.csv` is a practical seed source, but not the ideal long-term source of truth.
- Ordered simulation degradation is surfaced in Step 01 debug notes and block/item metadata, not a dedicated simulation-specific admin UI.
- `catalogueRuleHealth.js` intentionally does not reason about simulation degradation quality or ordered simulation coverage.
- Step 01 has become the densest orchestration point in the engine; still manageable, but it is the most likely cleanup target if this area grows further.
- The admin editor now supports the new fields, but it is still a large inline-script page; the logic is functional rather than strongly componentized.

## Recommended v2 Follow-Ups

- Add `hyrox_role` and `hyrox_station_index` to the real exercise catalogue export/import pipeline and DB-backed source rows.
- Simplify simulation config once catalogue metadata is truly present end-to-end.
- Consider whether `day_selection_mode` should later expand into a small documented policy family if benchmark/test/retest use cases grow beyond HYROX.
- Fold the HYROX supplement config into a cleaner canonical seed source.
- Consider extracting the admin config editor script into smaller modules if further config authoring features are added.
- Consider a small Step 01 extraction for block assembly / slot-result metadata writing if more slot modes are added.
- Optionally extend the health/admin tooling with simulation-specific diagnostics if ordered simulation becomes a major surface area.

## Reviewer Checklist

Useful files to review together:

- `api/engine/steps/01_buildProgramFromDefinition.js`
- `api/engine/orderedSimulation.js`
- `api/engine/steps/02_segmentProgram.js`
- `api/engine/variabilityState.js`
- `api/engine/repRuleMatcher.js`
- `api/engine/steps/04_applyRepRules.js`
- `api/src/services/catalogueRuleHealth.js`
- `api/admin/index.html`
- `api/admin/preview.html`
- `api/scripts/import_bubble_exports.mjs`
- `api/scripts/check_seeds.mjs`

Key questions for review:

- Does Step 01 still preserve default behavior for non-annotated configs?
- Is `day_selection_mode` cleanly separated from `variability_policy`, and is `benchmark_exactness` scoped narrowly enough?
- Is `repRuleMatcher.js` now the single source of truth for rule matching semantics?
- Is the ordered simulation branch narrow enough and clearly isolated?
- Does the admin editor serialize the new day/slot fields faithfully into config JSON?
- Is the HYROX config supplement acceptable as a v1 seed mechanism?
- Are the current seed smoke checks aligned with the actual guaranteed seeded dataset?
