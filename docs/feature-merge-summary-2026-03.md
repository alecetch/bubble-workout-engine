# Merge Summary

## Implemented Features

- Feature 1: config-driven variability policy with `none | med | high` and explicit `slot_family`
- Feature 2: catalogue-rule consistency health report with a shared rep-rule matcher and guarded admin surface
- Feature 3: ordered HYROX simulation day support with fallback chains, sticky stability, and visible degradation metadata

## Main Architectural Changes

- Extracted shared rep-rule matching into `api/engine/repRuleMatcher.js` so runtime and diagnostics use the same rule semantics
- Added program-ephemeral variability state to keep sticky choices and block-scoped history without changing the DB schema
- Added a narrow ordered-simulation path in Step 01 and Step 02 so simulation days preserve declared sequence without affecting normal days

## Key Files / Modules

- `api/engine/variabilityState.js`
- `api/engine/repRuleMatcher.js`
- `api/src/services/catalogueRuleHealth.js`
- `api/src/routes/adminHealth.js`
- `api/engine/orderedSimulation.js`
- `api/engine/steps/01_buildProgramFromDefinition.js`
- `api/engine/steps/02_segmentProgram.js`

## Known v1 Limitations

- End-to-end catalogue support for `hyrox_role` and `hyrox_station_index` is not yet present in the real import/export path
- HYROX simulation matching is therefore more config-driven than ideal today
- `api/data/export_Hyrox-ProgramGenerationConfigs-supplement_2026-03-29.csv` is a practical seed source, but not the ideal long-term source of truth
- Ordered simulation degradation is surfaced in block/debug metadata, not a dedicated simulation-specific admin UI

## Recommended v2 Follow-ups

- Add `hyrox_role` and `hyrox_station_index` to the real exercise catalogue import/export pipeline
- Fold the HYROX supplement config into a cleaner canonical seed source
- Add richer simulation-specific preview/admin inspection if needed
- Do a small normalization pass on Step 01 if ordered simulation logic grows further
