# Preferred Days Schedule Config — Analysis

**Type:** Architecture analysis + UI design
**Status:** Analysis only — no implementation

---

## Problem statement

When a user selects e.g. 3 days/week, the engine currently uses a hardcoded map in `adminPreview.js` (`PREFERRED_DAYS_BY_DPW`) to pick which days to schedule:

```js
const PREFERRED_DAYS_BY_DPW = {
  1: ["wed"],
  2: ["mon", "thu"],
  3: ["mon", "wed", "fri"],
  4: ["mon", "tue", "thu", "fri"],
  5: ["mon", "tue", "wed", "thu", "fri"],
  6: ["mon", "tue", "wed", "thu", "fri", "sat"],
  7: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
};
```

This is a single global default shared across all program types. A HYROX program, a strength program, and a conditioning program all get the same day spread — which is wrong. A HYROX program might want to cluster sessions mid-week to allow weekend racing. A strength program benefits from at least one full rest day between sessions. A conditioning program may want a different spread to avoid stacking high-intensity days.

The goal is to make this configurable per program type in the admin config UI, so it flows through the pipeline and is used at preview and generation time.

---

## Where preferred days are used in the pipeline

**`adminPreview.js` — preview generation:**
`resolvePreferredDays(daysPerWeek)` is called at lines 70 and 102 to construct the synth profile. The result is passed into `buildInputsFromProfile` and into the pipeline `request.preferred_days_json`.

**`runPipeline.js` — production generation:**
`request.preferred_days_json ?? clientProfile.preferred_days` is passed to the emitter (step 6) to determine actual scheduled day anchors.

**`api/engine/steps/06_emitPlan.js` — emitter:**
Uses `preferredDaysJson` to assign real calendar dates to each program day. This is where the day selection actually materialises into scheduled slots.

**Mobile app / generateProgramV2.js — client-initiated generation:**
The mobile app sends `preferredDays` from the user's profile (days they've told the app they prefer). This is user-specific, not program-type-specific, and should remain as-is. The config-level default is a fallback used in preview and for any user who hasn't set preferences.

**Key insight:** The preferred days schedule is a **program-level default** that governs when sessions fall in the week. It lives naturally in `program_generation_config_json` alongside the builder, segmentation, and progression config. The pipeline already passes `program_generation_config_json` all the way through, so no new data pathway is needed — just a new field to read.

---

## Where the value should live

### Current state: hardcoded in `adminPreview.js`

The `PREFERRED_DAYS_BY_DPW` constant is statically defined in the preview route. It cannot vary by program type. Any change requires a code deployment.

### Proposed: `preferred_days_by_dpw` inside `program_generation_config_json`

Add a top-level key to the config JSON object:

```json
"preferred_days_by_dpw": {
  "1": ["wed"],
  "2": ["mon", "thu"],
  "3": ["mon", "wed", "fri"],
  "4": ["mon", "tue", "thu", "fri"],
  "5": ["mon", "tue", "wed", "thu", "fri"],
  "6": ["mon", "tue", "wed", "thu", "fri", "sat"],
  "7": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
}
```

This sits alongside `builder`, `segmentation`, and `progression` in the JSON config. Each program type (hypertrophy, strength, conditioning, hyrox) can define its own preferred schedule per DPW count.

**Why `program_generation_config_json` and not a separate DB column:**

- The config JSON is already read at pipeline time; no new DB query or JOIN needed.
- The admin UI already has a structured editor for this JSON object — adding a new section is low friction.
- It keeps all program-level scheduling decisions together in one place.
- The existing `progression_by_rank_json` and `week_phase_config_json` columns are already separate because they are queried and diffed independently by the progression step. `preferred_days_by_dpw` is not independently queried — it is only read as part of the full config blob at build time, so it belongs inside `program_generation_config_json`.

---

## Fallback chain

The resolution order at preview and pipeline time:

1. User's `clientProfile.preferred_days` (set by the user on the mobile app) — highest priority, user intent
2. `program_generation_config_json.preferred_days_by_dpw[daysPerWeek]` — program-type-specific coach default
3. The existing hardcoded `PREFERRED_DAYS_BY_DPW` in `adminPreview.js` — global fallback if config doesn't have this field yet (backward compatible)

This means existing configs that don't yet have `preferred_days_by_dpw` continue to work exactly as before.

---

## UI design recommendation

### New section in `admin/index.html`: "Schedule defaults"

Add a new `<details>` accordion section after the existing Progression section, before Raw JSON. This section renders a 7-row table — one row per possible DPW count — where each row shows a day-picker for that count.

**Table layout:**

| Days/week | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|-----------|-----|-----|-----|-----|-----|-----|-----|
| 1 | ☐ | ☐ | ☑ | ☐ | ☐ | ☐ | ☐ |
| 2 | ☑ | ☐ | ☐ | ☑ | ☐ | ☐ | ☐ |
| 3 | ☑ | ☐ | ☑ | ☐ | ☑ | ☐ | ☐ |
| 4 | ☑ | ☑ | ☐ | ☑ | ☑ | ☐ | ☐ |
| 5 | ☑ | ☑ | ☑ | ☑ | ☑ | ☐ | ☐ |
| 6 | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☐ |
| 7 | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ |

Each cell is a checkbox. The number of checked boxes in a row must equal the DPW count for that row — validation should warn if the count doesn't match (e.g. "Row 3: 3 days required, 4 selected"). Validation runs on save, not on every click, to avoid being annoying during editing.

**Why checkboxes rather than a text input:**

- Day names are a fixed enum (`mon`-`sun`). Free text would allow typos.
- The visual matrix immediately shows the weekly pattern — a coach can see at a glance that Monday and Thursday are the 2-day choice.
- Adding/removing a day is one click, not editing JSON.

**Checkbox interaction rule:** When a user checks a box that would bring the total above the DPW count, highlight the row in amber but do not auto-deselect — the user may be mid-edit. Only flag on save.

---

## Pipeline integration

### `adminPreview.js` — change `resolvePreferredDays`

The `createPreviewHandler` and `createExportHandler` already receive the program config JSON via the pipeline. After the pipeline runs and the config is known, extract `preferred_days_by_dpw` from `programGenerationConfigJson` and use it to resolve preferred days.

The cleanest approach: pass `preferred_days_by_dpw` from the config into `resolvePreferredDays` as an optional override:

```js
export function resolvePreferredDays(daysPerWeek, configOverride = null) {
  const map = configOverride ?? PREFERRED_DAYS_BY_DPW;
  return map[String(daysPerWeek)] ?? map[daysPerWeek] ?? PREFERRED_DAYS_BY_DPW[daysPerWeek] ?? PREFERRED_DAYS_BY_DPW[3];
}
```

For preview, the config JSON is fetched before the pipeline runs (it comes from the DB via `buildPreviewInputs`). The `preferred_days_by_dpw` can be extracted from the config row's `program_generation_config_json` field before constructing the synth profile.

However, there is a complication: the preview currently runs all four program types simultaneously, but each program type has its own config with its own `preferred_days_by_dpw`. The synth profile is built once and shared across all program types. This means the preferred days for the preview are currently program-type-agnostic by design (they use the DPW from the UI toggles).

**Resolution:** In preview, use the program-type-specific `preferred_days_by_dpw` per pipeline invocation, not a shared synth profile. Pass it into the pipeline request as `preferred_days_json` per program type. This is a small refactor but important for correctness.

### `runPipeline.js` — production path

In production, the `program_generation_config_json` is already loaded and passed to `runPipeline`. Add a read of `programGenerationConfigJson?.preferred_days_by_dpw?.[daysPerWeek]` in the step that builds preferred days. If present and the user's profile doesn't already have explicit preferred days, use the config value.

The exact injection point is in `01_buildProgramFromDefinition.js` or wherever `preferred_days` is consumed. If the pipeline already has `preferred_days_json` in the request object (set by the caller), it takes precedence. If not, the config value fills in.

### `adminPreview.js` — export path

The export handler (`createExportHandler`) also calls `buildPreviewInputs` and then `runPipeline`. It should apply the same config-driven resolution: extract `preferred_days_by_dpw` from the config row for each `(programType, fitnessRank, equipmentPreset)` combination and pass it into the pipeline request as `preferred_days_json`.

---

## Seed config changes

Each of the five configs (`hypertrophy_default_v1`, `strength_default_v1`, `conditioning_default_v1`, `hyrox_default_v1`, `hyrox_simulation_v1`) should have `preferred_days_by_dpw` added to their `program_generation_config_json`. Initial values:

**Hypertrophy and strength (identical — standard gym schedule):**
```json
"preferred_days_by_dpw": {
  "1": ["wed"],
  "2": ["mon", "thu"],
  "3": ["mon", "wed", "fri"],
  "4": ["mon", "tue", "thu", "fri"],
  "5": ["mon", "tue", "wed", "thu", "fri"],
  "6": ["mon", "tue", "wed", "thu", "fri", "sat"],
  "7": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
}
```

**Conditioning (same as above for now — no strong reason to differ):**
Same as hypertrophy/strength.

**HYROX (race-prep calendar awareness):**
HYROX athletes typically race on Saturdays. Training should be built to peak mid-week and taper into the weekend. The 2-day and 3-day options should avoid Friday (pre-race recovery) and Saturday (race day). For a 4-day week, include a light session earlier in the week.

```json
"preferred_days_by_dpw": {
  "1": ["wed"],
  "2": ["tue", "thu"],
  "3": ["mon", "wed", "fri"],
  "4": ["mon", "tue", "thu", "fri"],
  "5": ["mon", "tue", "wed", "thu", "fri"],
  "6": ["mon", "tue", "wed", "thu", "fri", "sat"],
  "7": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
}
```

Note: for HYROX 2-day, `tue + thu` is slightly better than `mon + thu` — it gives maximum recovery from any weekend training before the next session. This is a small but meaningful coaching distinction.

---

## Implementation plan summary

**Changes required:**

1. **`R__seed_program_generation_config.sql`** — add `preferred_days_by_dpw` to each config's `program_generation_config_json`. Flyway repeatable migration re-runs automatically.

2. **`admin/index.html`** — add "Schedule defaults" section with a 7-row checkbox matrix. On save, writes the checked days for each row as an array of strings to `jsonObj.preferred_days_by_dpw`. Validation on save: warn if checked count ≠ DPW count for any row.

3. **`api/src/routes/adminPreview.js`** — update `resolvePreferredDays` to accept an optional `configOverride` map. In `createPreviewHandler` and `createExportHandler`, extract `preferred_days_by_dpw` from the config row for each program type and pass it per-pipeline-invocation.

4. **`api/engine/runPipeline.js`** (optional for v1) — read `programGenerationConfigJson?.preferred_days_by_dpw?.[request.days_per_week]` as a fallback when `preferred_days_json` is not set in the request. This makes the production path config-aware too.

**No schema migration needed** — this is a JSON config field change only.

**No new API endpoints needed** — the config admin already saves the full `program_generation_config_json` blob via the existing PATCH endpoint.

---

## What does not change

- User-set preferred days on the mobile profile remain the highest-priority override — this config only affects the programmatic default.
- The DPW selector on the preview page is unchanged.
- The emitter (step 6) is unchanged — it already consumes whatever `preferred_days_json` it receives.
- The mobile app onboarding flow is unchanged.
