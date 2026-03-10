# Admin Screen 2 — Exercise Coverage Report

## Purpose

Identify gaps in the exercise catalogue: slots in any program config that have zero or very few eligible exercises for a given equipment preset and fitness rank. Used to prioritise exercise additions before production launch.

---

## Placement

New tab/page in the existing Config Admin dashboard (`/admin`), alongside the existing config editor. Navigation label: **"Coverage Report"**.

---

## Data Model Overview

### Equipment presets (5)
Derived from the `equipment_items` table. Each item has boolean columns for each preset. The equipment slug set for a preset = all `exercise_slug` values where that preset column is `TRUE`.

| Code | Label |
|---|---|
| `no_equipment` | No Equipment |
| `minimal_equipment` | Minimal Equipment |
| `decent_home_gym` | Decent Home Gym |
| `commercial_gym` | Commercial Gym |
| `crossfit_hyrox_gym` | CrossFit / HYROX Gym |

### Fitness ranks (4)
Sourced from `min_fitness_rank` on `exercise_catalogue`. Ranks are **cumulative** — rank N includes all exercises accessible to ranks 0…N-1 as well.

| DB value | Label |
|---|---|
| 0 | Beginner |
| 1 | Intermediate |
| 2 | Advanced |
| 3 | Elite |

### Slot eligibility rules
For a given slot definition, an exercise is **eligible** if ALL of the following hold:

1. `is_archived = false`
2. `min_fitness_rank <= :rank` (rank gate — cumulative)
3. `movement_class NOT IN ('cardio', 'conditioning', 'locomotion')` (matches the pipeline's `excludeMovementClasses` default)
4. `equipment_items_slugs <@ :preset_equipment_slugs` (exercise's required equipment is a subset of the preset's equipment)
5. **Slot match** — at least one of:
   - `swap_group_id_1 = slot.sw` (if `sw` is set)
   - `swap_group_id_2 = slot.sw2` (if `sw2` is set)
   - `swap_group_id_1 = ANY(slot.swAny)` (if `swAny` is set and non-empty)
   - `movement_pattern_primary = slot.mp` (if `mp` is set)
6. `slot.requirePref = ANY(preferred_in_json)` (only applied if `requirePref` is set on the slot)

> Note: conditions 5 and 6 replicate the logic in `pickWithFallback` / `pickBest` in `exerciseSelector.js`. A slot with no sw/sw2/swAny/mp constraints matches all exercises passing conditions 1–4 (treated as unconstrained).

---

## API Endpoint

### `GET /api/admin/coverage-report`

No path params. No auth beyond the existing `requireInternalToken` middleware.

#### Response shape

```jsonc
{
  "presets": [
    {
      "code": "no_equipment",
      "label": "No Equipment",
      "equipment_slugs": ["bodyweight"]
    }
    // … other presets
  ],
  "ranks": [
    { "value": 0, "label": "Beginner" },
    { "value": 1, "label": "Intermediate" },
    { "value": 2, "label": "Advanced" },
    { "value": 3, "label": "Elite" }
  ],
  "rows": [
    {
      "config_key": "hypertrophy_default_v1",
      "program_type": "hypertrophy",
      "day_key": "day1",
      "day_index": 1,
      "day_focus": "lower_hypertrophy",       // from day template `focus` field, or null
      "slot": "C:calves",
      "sw": "calf_iso",
      "sw2": null,
      "swAny": null,
      "mp": null,
      "requirePref": "hypertrophy_secondary",
      "counts": {
        // keyed as "<preset_code>_<rank>"
        "no_equipment_0": 1,
        "no_equipment_1": 1,
        "no_equipment_2": 2,
        "no_equipment_3": 2,
        "minimal_equipment_0": 2,
        // … all 20 combinations
      }
    }
    // … one row per slot across all active configs and all day templates
  ]
}
```

#### Server-side computation steps

1. **Load configs** — query all active `program_generation_config` rows; parse `program_generation_config_json.builder.day_templates` for each.
2. **Load preset equipment** — for each preset code, query `SELECT exercise_slug FROM equipment_items WHERE <preset_code> = 'True'` (note: the column values are stored as the string `'True'`/`'False'`).
3. **For each slot in each day template in each config**, run a count query per (preset × rank) combination, applying the eligibility rules above.
4. Return the flat `rows` array plus the `presets` and `ranks` metadata.

##### Example count query (parameterised)

```sql
SELECT COUNT(*) AS cnt
FROM exercise_catalogue
WHERE is_archived = false
  AND min_fitness_rank <= $1                          -- :rank
  AND movement_class NOT IN ('cardio','conditioning','locomotion')
  AND equipment_items_slugs <@ $2::text[]             -- :preset_equipment_slugs
  AND (
    ($3::text IS NOT NULL AND swap_group_id_1 = $3)   -- sw
    OR ($4::text IS NOT NULL AND swap_group_id_2 = $4) -- sw2
    OR ($5::text[] IS NOT NULL AND cardinality($5::text[]) > 0
        AND swap_group_id_1 = ANY($5))                 -- swAny
    OR ($6::text IS NOT NULL AND movement_pattern_primary = $6) -- mp
  )
  AND ($7::text IS NULL OR $7 = ANY(preferred_in_json)) -- requirePref
```

> For performance, batch all 20 queries for a single slot into one multi-CTE statement, or use a single query with `CROSS JOIN` on preset/rank combinations and `GROUP BY`.

---

## UI Layout

### Page header
```
Coverage Report        [Config ▼]  [Show: All slots / Gaps only ▼]  [Presets ☑☑☑☑☑]
```

- **Config dropdown** — lists all active configs (`hypertrophy_default_v1`, `strength_default_v1`, …). Default: all configs (grouped by program_type in the table).
- **Show filter** — toggle between:
  - `All slots` — show every slot
  - `Gaps only` — show only rows where **any** cell has a count ≤ 1
- **Presets checkboxes** — hide/show individual preset column groups to reduce width.

### Table structure

| Config | Day | Focus | Slot | Constraints | NE B | NE I | NE A | NE E | ME B | … | CF E |
|---|---|---|---|---|---|---|---|---|---|---|---|

Column groups (each group = 4 sub-columns B / I / A / E):

1. **NE** — No Equipment
2. **ME** — Minimal Equipment
3. **HG** — Decent Home Gym
4. **CG** — Commercial Gym
5. **CF** — CrossFit / HYROX Gym

Total data columns: 20. Suggested order: No Equipment → Minimal → Home Gym → Commercial → CrossFit (widening availability left to right).

**Row columns:**
- `Config` — `config_key` (e.g. `hypertrophy_default_v1`). Merge/span repeated values visually.
- `Day` — day ordinal + `day_key` (e.g. `1 · day1`)
- `Focus` — `day_focus` from the template (e.g. `lower_hypertrophy`), greyed out if null
- `Slot` — slot name (e.g. `C:calves`)
- `Constraints` — compact summary of sw/sw2/swAny/mp/requirePref. Suggested format: `sw:calf_iso · pref:hypertrophy_secondary`

### Cell rendering

| Count | Background | Text |
|---|---|---|
| 0 | Red `#fde8e8` | **0** bold red |
| 1 | Amber `#fef3c7` | **1** bold amber |
| 2 | Light green `#d1fae5` | 2 |
| ≥ 3 | White / default | count |

### "Gaps only" filter behaviour

A row is shown when it has **at least one cell with count ≤ 1** across the currently-visible preset columns. Hidden rows still contribute to an optional summary line: `Showing N of M slots (X with gaps)`.

---

## Slot constraint summary format (Constraints column)

Build a compact string from the slot definition:

```
sw:<value>              if sw is set
sw2:<value>             if sw2 is set
swAny:[a,b]             if swAny is set
mp:<value>              if mp is set
pref:<value>            if requirePref is set
```

If none are set, display `(unconstrained)` in grey italics.

---

## Implementation notes for Codex

### Files to create
- `api/src/routes/adminCoverage.js` — new Express router with the `GET /coverage-report` endpoint
- `api/admin/coverage.html` — standalone admin page (same CSS variables/style as `index.html`)

### Files to modify
- `api/server.js` — mount `adminCoverageRouter` at `/api/admin`
- `api/admin/index.html` — add a "Coverage Report" nav link pointing to `/admin/coverage`

### Key data access patterns
- Equipment preset slugs: `SELECT exercise_slug FROM equipment_items WHERE <preset_col> = 'True'`
  - Preset columns: `no_equipment`, `minimal_equipment`, `decent_home_gym`, `commercial_gym`, `crossfit_hyrox_gym`
- Config slot definitions: parse `program_generation_config_json -> builder -> day_templates -> ordered_slots` (JSONB path)
- Exercise counts: parameterised SQL per the example above

### Avoiding N×20 round trips
Prefer a single query per slot using `unnest` or a VALUES CTE for (preset_slugs, rank) combinations, returning one count per combination. Alternatively, compute all counts in a single large query joining configs × slots × presets × ranks if the config count stays small.

### No external dependencies
The page should be a single `.html` file with vanilla JS (no React/Vue/bundler), consistent with the existing `index.html` admin page.
