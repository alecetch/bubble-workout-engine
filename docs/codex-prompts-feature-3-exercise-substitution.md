# Codex Prompt: Feature 3 — Exercise Substitution (Day-of Swap)

## Goal

Allow a user to swap an exercise on a given day with a semantically equivalent alternative. The swap group system (`swap_group_id_1` / `swap_group_id_2` on `exercise_catalogue`) already encodes substitutable exercises. This feature exposes two new endpoints:

1. `GET /api/program-exercise/:id/swap-options` — returns up to 3 candidate substitutes with a brief rationale for each, scoped to the user's allowed exercises and excluding exercises already assigned to that day.
2. `POST /api/program-exercise/:id/swap` — applies a chosen substitute, updating the `program_exercise` row in place.

No changes to the generation pipeline. No new DB tables except two nullable columns on `program_exercise` (via migration).

---

## Context files to read before writing any code

Read these files in full:

- `api/src/routes/readProgram.js` — ownership pattern for `program_exercise` (join through `program_day → program → user_id`); `dayFull` shows how exercises are fetched; `createReadProgramHandlers` factory pattern to follow
- `api/engine/getAllowedExercises.js` — `getAllowedExerciseIds(client, { fitness_rank, injury_flags_slugs, equipment_items_slugs })` — the user-scoped exercise filter to reuse
- `api/engine/exerciseSelector.js` — `pickWithFallback` signature; understand `sw`, `sw2`, `mp` fields in the in-memory index (these are `swap_group_id_1`, `swap_group_id_2`, `movement_pattern_primary` in the catalogue)
- `api/src/middleware/requireAuth.js` — auth middleware to apply to the new router
- `api/server.js` — where route modules are registered; follow the existing pattern
- `migrations/V58__add_program_exercise_progression_fields.sql` — how nullable columns are added to `program_exercise`
- `api/src/utils/validate.js` — `requireUuid`, `safeString`, `RequestValidationError` helpers to use for input validation

---

## Part 1 — Migration

**New file: `migrations/V62__add_program_exercise_substitution_fields.sql`**

```sql
ALTER TABLE program_exercise
  ADD COLUMN IF NOT EXISTS original_exercise_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS substitution_reason   TEXT NULL;
```

No index needed. Both columns are nullable and only written on explicit swap.

---

## Part 2 — New route module

**New file: `api/src/routes/programExercise.js`**

Follow the exact same factory pattern as `readProgram.js`: export a `createProgramExerciseHandlers(db)` factory, then instantiate with the default pool and attach to a named router. Use `requireAuth` middleware.

### Handler 1: `swapOptions`

**Route:** `GET /api/program-exercise/:program_exercise_id/swap-options`

**Purpose:** Return up to 3 candidate exercises that could replace the current one. The candidates must be:
- In the user's allowed exercise set (rank + injury + equipment gates — use `getAllowedExerciseIds`)
- Not the current exercise
- Not already used elsewhere in the same `program_day` (any `program_exercise` row in the same `program_day_id`)
- Semantically equivalent: matching `swap_group_id_2`, `swap_group_id_1`, or `movement_pattern_primary` of the current exercise (in that priority order)

**Algorithm:**

```
1. Fetch program_exercise row by :program_exercise_id
   JOIN program_day pd ON pd.id = pe.program_day_id
   JOIN program p ON p.id = pd.program_id
   WHERE p.user_id = req.auth.user_id            ← ownership check
   → get current: exercise_id, program_day_id, program_id

2. Fetch current exercise catalogue row (exercise_id from step 1):
   SELECT exercise_id, name, swap_group_id_1, swap_group_id_2,
          movement_pattern_primary, movement_class
   FROM exercise_catalogue WHERE exercise_id = $1

3. Get already-used exercise_ids for this program_day:
   SELECT exercise_id FROM program_exercise
   WHERE program_day_id = $1

4. Get client_profile for this user:
   SELECT fitness_rank, injury_flags_slugs, equipment_items_slugs
   FROM client_profile WHERE user_id = $1
   ORDER BY updated_at DESC LIMIT 1

5. Call getAllowedExerciseIds(client, { fitness_rank, injury_flags_slugs, equipment_items_slugs })
   → allowedIds (string[])

6. Run candidate query (see SQL below)

7. Shape and return response
```

**Candidate SQL:**

```sql
SELECT
  ec.exercise_id,
  ec.name,
  ec.is_loadable,
  ec.swap_group_id_1,
  ec.swap_group_id_2,
  ec.movement_pattern_primary,
  ec.movement_class,
  ec.load_guidance,
  CASE
    WHEN ec.swap_group_id_2 = $current_sw2 AND $current_sw2 IS NOT NULL AND $current_sw2 != ''
      THEN 'same_compound_group'
    WHEN ec.swap_group_id_1 = $current_sw AND $current_sw IS NOT NULL AND $current_sw != ''
      THEN 'same_movement_pattern'
    ELSE 'same_primary_pattern'
  END AS match_type
FROM exercise_catalogue ec
WHERE ec.is_archived = false
  AND ec.min_fitness_rank <= $rank
  AND NOT (ec.contraindications_slugs && $injury_flags::text[])
  AND ec.equipment_items_slugs <@ $user_equipment::text[]
  AND ec.exercise_id != $current_exercise_id
  AND ec.exercise_id != ALL($excluded_ids::text[])
  AND ec.exercise_id = ANY($allowed_ids::text[])
  AND (
    (ec.swap_group_id_2 = $current_sw2 AND $current_sw2 IS NOT NULL AND $current_sw2 != '')
    OR (ec.swap_group_id_1 = $current_sw AND $current_sw IS NOT NULL AND $current_sw != '')
    OR ec.movement_pattern_primary = $current_mp
  )
ORDER BY
  CASE
    WHEN ec.swap_group_id_2 = $current_sw2 AND $current_sw2 IS NOT NULL AND $current_sw2 != '' THEN 1
    WHEN ec.swap_group_id_1 = $current_sw AND $current_sw IS NOT NULL AND $current_sw != '' THEN 2
    ELSE 3
  END,
  ec.min_fitness_rank DESC,
  ec.complexity_rank ASC
LIMIT 5
```

Pass `$excluded_ids` as the array of exercise_ids already in the day (including the current exercise). Pass `$allowed_ids` from `getAllowedExerciseIds` output. Use `= ANY($allowed_ids::text[])` to intersect.

**Rationale label function:**

```js
function swapRationale(matchType, movementPatternPrimary) {
  if (matchType === 'same_compound_group') return `Same compound movement group`;
  if (matchType === 'same_movement_pattern') return `Same movement pattern`;
  return `Same primary movement (${movementPatternPrimary ?? 'general'})`;
}
```

**Response shape:**

```json
{
  "ok": true,
  "current_exercise_id": "bb_back_squat",
  "options": [
    {
      "exercise_id": "safety_bar_squat",
      "name": "Safety Bar Squat",
      "is_loadable": true,
      "match_type": "same_compound_group",
      "rationale": "Same compound movement group",
      "load_guidance": "..."
    }
  ]
}
```

Return up to 3 entries (take first 3 from the SQL result of LIMIT 5 after dedup by name if needed).

If `options` is empty (no candidates found), return `ok: true, options: []` — do not return a 404.

---

### Handler 2: `applySwap`

**Route:** `POST /api/program-exercise/:program_exercise_id/swap`

**Body:**
```json
{
  "exercise_id": "safety_bar_squat",
  "reason": "equipment not available"
}
```

`exercise_id` is required. `reason` is optional (free text, max 500 chars).

**Purpose:** Replace the exercise on the `program_exercise` row. The new exercise must be in the user's allowed set. The original `exercise_id` is saved to `original_exercise_id` (set only on first swap — never overwrite if already set, so we always preserve the original programme assignment). Progression recommendation fields are cleared (the new exercise has no history).

**Algorithm:**

```
1. Validate program_exercise_id (requireUuid)
2. Validate body.exercise_id (non-empty string, no pipe characters)
3. Fetch program_exercise → program_day → program → user_id (ownership check)
   → get current: exercise_id, program_day_id, program_id, original_exercise_id

4. Get client_profile for user (fitness_rank, injury_flags_slugs, equipment_items_slugs)

5. Verify new exercise_id is in user's allowed set:
   SELECT COUNT(*) FROM exercise_catalogue
   WHERE exercise_id = $1
     AND is_archived = false
     AND min_fitness_rank <= $rank
     AND NOT (contraindications_slugs && $injury_flags::text[])
     AND equipment_items_slugs <@ $user_equipment::text[]
   If count = 0 → 400 "Exercise not available for this user profile"

6. Fetch new exercise catalogue row:
   SELECT exercise_id, name, is_loadable,
          equipment_items_slugs, coaching_cues_json,
          load_guidance, logging_guidance
   FROM exercise_catalogue WHERE exercise_id = $1

7. UPDATE program_exercise SET
     exercise_id                 = $new_exercise_id,
     exercise_name               = $new_name,
     is_loadable                 = $new_is_loadable,
     equipment_items_slugs_csv   = array_to_string($new_equipment_slugs, ','),
     coaching_cues_json          = $new_coaching_cues,
     load_hint                   = COALESCE($new_load_guidance, ''),
     log_prompt                  = COALESCE($new_logging_guidance, ''),
     original_exercise_id        = CASE
                                     WHEN original_exercise_id IS NULL
                                     THEN $current_exercise_id
                                     ELSE original_exercise_id
                                   END,
     substitution_reason         = $reason_or_null,
     -- Clear all progression fields for the new exercise
     progression_outcome         = NULL,
     progression_primary_lever   = NULL,
     progression_confidence      = NULL,
     progression_source          = NULL,
     progression_reasoning_json  = '[]'::jsonb,
     recommended_load_kg         = NULL,
     recommended_reps_target     = NULL,
     recommended_sets            = NULL,
     recommended_rest_seconds    = NULL,
     prescribed_load_kg          = NULL
   WHERE id = $program_exercise_id
   RETURNING id

8. Return:
```json
{
  "ok": true,
  "program_exercise_id": "...",
  "exercise_id": "safety_bar_squat",
  "exercise_name": "Safety Bar Squat",
  "original_exercise_id": "bb_back_squat"
}
```

**Constraints:**
- Do NOT delete `segment_exercise_log` rows for the old exercise — those are the user's workout history and must not be lost.
- Do NOT change `sets_prescribed`, `reps_prescribed`, `rest_seconds`, `tempo`, `order_in_day`, `block_order`, `purpose` — the prescription structure stays identical.
- Do NOT change `progression_key` if it is already set — the new exercise will inherit the same slot, but progression decisions are keyed by `exercise_id` in `exercise_progression_state`, so they are naturally independent.

---

## Part 3 — Register the route

**File: `api/server.js`**

Find where other route modules are imported and registered. Add:

```js
import { programExerciseRouter } from "./src/routes/programExercise.js";
```

And in the route registration block:

```js
app.use("/api", programExerciseRouter);
```

Follow the exact pattern used for `readProgramRouter` (both share the `/api` prefix).

---

## Part 4 — Tests

**New file: `api/test/programExercise.route.test.js`**

Use the same `node:test` + `supertest` + real Postgres pattern as other route tests in `api/test/`. Seed a program with at least one day and at least two exercises in the day, plus a third exercise in the catalogue that shares a `swap_group_id_1` with one of the day exercises.

### Test cases (minimum)

| Case | Route | Assert |
|---|---|---|
| swap-options returns candidates | `GET /api/program-exercise/:id/swap-options` | `ok: true`, `options.length >= 1`, each option has `exercise_id`, `name`, `rationale` |
| swap-options excludes current exercise | same | current exercise_id not in `options` |
| swap-options excludes already-used day exercises | same | exercise_ids already in the day not in `options` |
| swap-options returns empty array when no candidates | different user with restricted equipment | `ok: true, options: []` (not 404) |
| swap-options requires auth | no auth header | 401 |
| swap-options 404 for unknown id | unknown UUID | 404 |
| applySwap updates exercise_id | `POST /api/program-exercise/:id/swap` with valid `exercise_id` | `ok: true`; subsequent `GET /api/day/:day_id/full` returns new exercise_id in the segment |
| applySwap preserves original_exercise_id on second swap | swap twice | `original_exercise_id` equals the first exercise, not the second |
| applySwap clears progression fields | set a `recommended_load_kg` first, then swap | field is null after swap |
| applySwap rejects exercise not in allowed set | submit an archived exercise_id | 400 |
| applySwap requires auth | no auth header | 401 |
| applySwap 404 for unknown id | unknown UUID | 404 |

---

## Part 5 — Error handling

Follow the `mapError` pattern from `readProgram.js` exactly. The same error class hierarchy applies:

- `RequestValidationError` → 400
- `NotFoundError` (exercise not found, day not found, ownership denied) → 404
- Postgres `22P02` (invalid UUID format) → 400
- Unexpected → 500

Do not expose raw Postgres error messages. Use `publicInternalError(err)` from `api/src/utils/publicError.js` for 500 cases.

---

## Summary of files changed

| File | Change |
|---|---|
| `migrations/V62__add_program_exercise_substitution_fields.sql` | New migration — adds `original_exercise_id` and `substitution_reason` nullable columns |
| `api/src/routes/programExercise.js` | New route module — `swapOptions` + `applySwap` handlers |
| `api/server.js` | Register `programExerciseRouter` |
| `api/test/programExercise.route.test.js` | New test file — 12 test cases |

No changes to the generation pipeline. No changes to `readProgram.js`. No changes to `importEmitterService.js`.
