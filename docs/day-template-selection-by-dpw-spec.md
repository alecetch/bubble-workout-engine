# Day Template Selection by Days-Per-Week — Spec

**Type:** Architecture analysis + UI design
**Status:** Analysis only — no implementation

---

## Problem statement

The config for `hypertrophy_default_v1` defines four day templates:

| day_key | focus |
|---------|-------|
| `day1` | lower |
| `day2` | upper |
| `day3` | posterior |
| `day4` | full body |

Currently the pipeline selects day templates by **position**: `template = dayTemplates[day - 1]`. A 3-day user gets day1 + day2 + day3 (lower + upper + posterior). A 1-day user gets only day1 (lower). There is no way to configure which day types a 1-day or 3-day user should receive — the pipeline always takes the first N.

The desired behaviour is:

| DPW | Templates to use |
|-----|-----------------|
| 1 | day4 (full body only) |
| 2 | day1 + day4 (lower + full body) |
| 3 | day1 + day2 + day4 (lower + upper + full body) |
| 4 | day1 + day2 + day3 + day4 (all) |
| 5 | day1 + day2 + day3 + day4 + day1 (cycle restarts) |

This is a coaching decision: which day types serve users at each frequency level. The engine needs to be told this explicitly rather than assuming "take the first N".

---

## Current pipeline behaviour

**`resolveCompiledConfig.js`** reads `builder.day_templates` from `program_generation_config_json` and maps them into `compiledConfig.builder.dayTemplates` (camelCase).

**`01_buildProgramFromDefinition.js`** (lines 579–582):
```js
const maxDays = Math.min(dperweek, dayTemplates.length);
for (let day = 1; day <= maxDays; day++) {
  const template = dayTemplates[day - 1];
  // build this day using template...
}
```

It iterates the first `min(dperweek, templates.length)` templates in definition order. There is no mapping from DPW to a subset of templates. There is no concept of cycling — a 5-day user with 4 templates only gets 4 days.

---

## Where the mapping should live

The mapping belongs in `program_generation_config_json` under a new key `day_templates_by_dpw`. This sits alongside the existing `builder.day_templates` definition (which continues to describe what each template contains) and is the authoritative lookup for which templates to use at each frequency.

```json
"builder": {
  "day_templates_by_dpw": {
    "1": ["day4"],
    "2": ["day1", "day4"],
    "3": ["day1", "day2", "day4"],
    "4": ["day1", "day2", "day3", "day4"],
    "5": ["day1", "day2", "day3", "day4", "day1"],
    "6": ["day1", "day2", "day3", "day4", "day1", "day2"]
  },
  "day_templates": [ ... existing array unchanged ... ]
}
```

**Why `day_key` strings rather than indices:**
- Indices are fragile — reordering templates in the array breaks the mapping silently.
- `day_key` is stable and already the human-readable identity of each template (`day1`, `upper`, `engine_day`, etc).
- The admin UI already displays `day_key` as the tab label.
- Repetition (e.g. `"5": ["day1","day2","day3","day4","day1"]`) is explicitly expressed, which is clearer than an implicit modulo cycle.

**Fallback when `day_templates_by_dpw` is absent:**
The existing behaviour (take first N templates in order) is preserved. This is fully backward-compatible — all existing configs that don't have this key continue to work exactly as before.

---

## Pipeline change

### `resolveCompiledConfig.js`

Add `dayTemplatesByDpw` to the compiled config output, reading from `builder.day_templates_by_dpw`:

```js
builder: {
  dayTemplates: builderDayTemplates,          // existing
  dayTemplatesByDpw: pgcJson?.builder?.day_templates_by_dpw ?? null,  // new
  setsByDuration: ...,
  ...
}
```

### `01_buildProgramFromDefinition.js`

Replace the current simple slice with a DPW-aware resolver:

```js
// Current:
const maxDays = Math.min(dperweek, dayTemplates.length);
for (let day = 1; day <= maxDays; day++) {
  const template = dayTemplates[day - 1];
  ...
}

// New:
const templateIndex = buildTemplateIndex(dayTemplates); // { day_key -> template }
const sequence = resolveTemplateSequence(
  compiledConfig.builder.dayTemplatesByDpw,
  dayTemplates,
  dperweek
);
for (let day = 1; day <= sequence.length; day++) {
  const template = sequence[day - 1];
  ...
}
```

**`resolveTemplateSequence(dayTemplatesByDpw, dayTemplates, dperweek)`:**

```js
function resolveTemplateSequence(byDpw, dayTemplates, dperweek) {
  // If no mapping configured, fall back to current behaviour
  if (!byDpw || typeof byDpw !== 'object') {
    return dayTemplates.slice(0, dperweek);
  }
  const keys = byDpw[String(dperweek)] ?? byDpw[dperweek];
  if (!Array.isArray(keys) || keys.length === 0) {
    return dayTemplates.slice(0, dperweek);
  }
  // Build index from day_key to template object
  const index = Object.fromEntries(dayTemplates.map(t => [t.day_key, t]));
  return keys.map(k => index[k]).filter(Boolean);
}
```

This is approximately 15 lines of new code in the pipeline. No other steps need changing.

---

## Admin UI

### New subsection in "Builder: day templates" section

The day templates section already has tabs (one per day template) and shows slot configuration per template. Add a new subsection **below** the tab content titled **"Day selection by days/week"**.

This renders a table: one row per DPW value (1–6), one column per defined day template. Each cell is a checkbox. Checking a cell means "include this day template when DPW = N". The order of checked boxes within a row determines the order days are built.

**Layout:**

| DPW | lower (day1) | upper (day2) | posterior (day3) | full body (day4) |
|-----|:---:|:---:|:---:|:---:|
| 1 | ☐ | ☐ | ☐ | ☑ |
| 2 | ☑ | ☐ | ☐ | ☑ |
| 3 | ☑ | ☑ | ☐ | ☑ |
| 4 | ☑ | ☑ | ☑ | ☑ |
| 5 | ☑ | ☑ | ☑ | ☑ |
| 6 | ☑ | ☑ | ☑ | ☑ |

**Columns:** derived from the current `day_templates` array — the column header uses `focus` (the human label) and `day_key` underneath in muted text. If a new day template is added, a new column appears automatically.

**Order within a row:** The checkboxes are read left-to-right in the order the columns appear (which matches the `day_templates` array order). If the same template is needed twice in a row (e.g. DPW=5 cycling back to day1), allow a "+" button at the end of the row to add a repeat of any template. This is an edge case and can be rendered as a small ordered list below the checkboxes for that row, initially hidden unless a row needs repeats.

**Simpler approach for v1 — no repeats:** For the initial implementation, only support the common case: each template appears at most once per DPW row. Repeats can be added later via the Raw JSON editor. This covers all real hypertrophy/strength use cases and is visually clean.

**Validation on save:** For each DPW row where at least one box is checked, the number of checked boxes must be ≤ the DPW count. More checked boxes than DPW is a data error (the user would receive more days than configured). Warn on save, do not block.

**Empty rows:** If no boxes are checked for a DPW count, the engine falls back to the current first-N behaviour. The UI should show this state clearly — e.g. a faint "using default (first N)" label next to an all-unchecked row.

### How it reads/writes to JSON

On load: read `jsonObj.builder.day_templates_by_dpw`. For each DPW key, find which `day_key` values are in the array and check the corresponding boxes.

On save (as part of `updateFromStructuredInputs`): iterate rows 1–6, collect checked day_keys in column order, write to `jsonObj.builder.day_templates_by_dpw[dpw]`. If all boxes in a row are unchecked, omit that key from the object (lets fallback behaviour apply).

---

## Seed config changes

Add `day_templates_by_dpw` to `hypertrophy_default_v1`, `strength_default_v1`, `conditioning_default_v1`, and `hyrox_default_v1` within their `builder` object in `program_generation_config_json`.

**Hypertrophy (lower / upper / posterior / full-body):**
```json
"day_templates_by_dpw": {
  "1": ["day4"],
  "2": ["day1", "day4"],
  "3": ["day1", "day2", "day4"],
  "4": ["day1", "day2", "day3", "day4"],
  "5": ["day1", "day2", "day3", "day4", "day1"],
  "6": ["day1", "day2", "day3", "day4", "day1", "day2"]
}
```

**Strength (lower_strength / upper_strength / posterior_strength — 3 templates):**
```json
"day_templates_by_dpw": {
  "1": ["day1"],
  "2": ["day1", "day2"],
  "3": ["day1", "day2", "day3"],
  "4": ["day1", "day2", "day3", "day1"],
  "5": ["day1", "day2", "day3", "day1", "day2"],
  "6": ["day1", "day2", "day3", "day1", "day2", "day3"]
}
```

Strength has no "full body" template so a 1-day user gets lower_strength (compound lower = highest transfer). Cycling resumes from day1 for 4+ DPW.

**Conditioning (engine_power / mixed_modal / aerobic_base — 3 templates):**
```json
"day_templates_by_dpw": {
  "1": ["day1"],
  "2": ["day1", "day3"],
  "3": ["day1", "day2", "day3"],
  "4": ["day1", "day2", "day3", "day1"],
  "5": ["day1", "day2", "day3", "day1", "day2"],
  "6": ["day1", "day2", "day3", "day1", "day2", "day3"]
}
```

2-day conditioning skips mixed_modal (`day2`) to favour the highest-contrast pairing: engine_power + aerobic_base.

**HYROX (engine / power / endurance — 3 rotating templates + simulation day):**
```json
"day_templates_by_dpw": {
  "1": ["engine_day"],
  "2": ["engine_day", "power_day"],
  "3": ["engine_day", "power_day", "endurance_day"],
  "4": ["engine_day", "power_day", "endurance_day", "engine_day"],
  "5": ["engine_day", "power_day", "endurance_day", "power_day", "engine_day"]
}
```

HYROX uses `day_key` values that are already descriptive (`engine_day`, `power_day`, `endurance_day`) rather than `day1/day2/day3`. A 1-day HYROX user gets an engine day — the most race-specific type. A 4-day user gets two engine days (race rhythm is the primary training stimulus).

---

## What does not change

- The `day_templates` array itself — it continues to define what each template contains (slots, focus, sets_by_duration, etc).
- Steps 02–06 of the pipeline — they operate on the resolved day list output by step 01.
- The rest of the admin UI — only the "Builder: day templates" section gains this new subsection.
- Any config without `day_templates_by_dpw` works exactly as before.
