# Codex Prompt: Feature 4 — Program Lifecycle: End-of-Program Re-enrollment

## Goal

Prevent the hard cliff at program completion. When a user finishes their last day, the system should:

1. Detect completion and return a rich summary via a new `GET /api/program/:id/completion-summary` endpoint.
2. Let the mobile app route the user to a re-enrollment choice without requiring them to restart onboarding from scratch.
3. Carry forward `exercise_progression_state` automatically — returning exercises pick up where they left off on the next generation.

No new DB tables. `exercise_progression_state` is already keyed by `(user_id, program_type, progression_group_key, purpose)` so state persists across programs naturally. One nullable column is needed on `program` to store the resolved `program_type` at generation time.

---

## Context files to read before writing any code

Read these files in full:

- `api/src/routes/readProgram.js` — ownership pattern, `dayComplete` handler, factory convention, `mapError`, `NotFoundError`
- `api/src/routes/historyPrograms.js` — `mapHistoryProgramRow`, SQL pattern, `userAuth` middleware chain
- `api/src/routes/historyOverview.js` — multi-CTE SQL pattern; `toFiniteNumber`, `asString` helpers
- `api/src/routes/historyPersonalRecords.js` — single-query PR lookup pattern to reuse for PRs-achieved
- `api/src/routes/generateProgramV2.js` — full generation flow; `createGenerateProgramV2Handler` factory; how `programType` is resolved and how the final program UPDATE is structured
- `api/src/services/clientProfileService.js` — `profileFieldToColumn`, `getProfileByUserId`, `getProfileById`, the mapped profile shape (camelCase fields like `fitnessLevel`, `goals`, `preferredDays`, `minutesPerSession`)
- `api/src/middleware/requireAuth.js` and `api/src/middleware/chains.js` — `requireAuth` vs `userAuth`; understand which to use for each new route
- `api/server.js` — where route modules are registered; follow the existing import + `app.use("/api", ...)` pattern
- `migrations/V59__create_exercise_progression_state.sql` — confirms the unique key `(user_id, program_type, progression_group_key, purpose)` — no migration needed for progression continuity

---

## Part 1 — Migration: store resolved program_type on program

**New file: `migrations/V63__add_program_type_to_program.sql`**

```sql
ALTER TABLE program
  ADD COLUMN IF NOT EXISTS program_type TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_program_program_type
  ON program (user_id, program_type);
```

This column lets the completion summary and re-enrollment endpoint know which program type the program was, without re-deriving it from goals. It is nullable (existing programs will have NULL; the UI must handle that gracefully).

---

## Part 2 — Write program_type at generation time

**File: `api/src/routes/generateProgramV2.js`**

In Phase 5 (the final `UPDATE program SET ...` block around line 479), add `program_type = $N` to the SET clause and pass `programType` as the corresponding parameter.

The `program_type` column is already resolved earlier in the handler as `const programType = explicitType || goalDerivedType || ...`. Just persist it at the same time as `status = 'active'`.

No other changes to this file.

---

## Part 3 — New endpoint: completion summary

**New file: `api/src/routes/programCompletion.js`**

Follow the `createReadProgramHandlers` factory pattern exactly: export a `createProgramCompletionHandlers(db)` factory, export a named router, apply `requireAuth` middleware, register routes on the router.

### Route: `GET /api/program/:program_id/completion-summary`

**Auth:** `requireAuth` (same as `readProgramRouter`)

**Purpose:** Return everything the mobile client needs to show the "Program Complete" screen and offer re-enrollment. Only callable by the program's owner.

**Algorithm:**

```
1. Validate program_id (requireUuid)
2. Resolve user_id from req.auth
3. Run the main summary query (see SQL below)
4. If rowCount === 0 → 404 "Program not found"
5. Run the PRs-achieved query (see below)
6. Derive suggested_next_rank (see logic below)
7. Return shaped response
```

**Main summary SQL:**

```sql
SELECT
  p.id                                        AS program_id,
  p.program_title,
  p.program_type,
  p.weeks_count,
  p.days_per_week,
  p.start_date,
  cp.fitness_rank,
  cp.fitness_level_slug,
  cp.main_goals_slugs                         AS goals,
  cp.minutes_per_session,
  cp.preferred_days,
  cp.equipment_items_slugs,
  cp.equipment_preset_slug,
  COUNT(pd.id)                                AS total_days,
  COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE)  AS completed_days,
  CASE WHEN COUNT(pd.id) = 0 THEN 0
       ELSE (COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE))::float / COUNT(pd.id)
  END                                         AS completion_ratio,
  COUNT(DISTINCT eps.exercise_id) FILTER (
    WHERE eps.last_outcome IN ('increase_load', 'increase_reps')
  )                                           AS exercises_progressed,
  COUNT(DISTINCT eps.exercise_id)             AS exercises_tracked,
  AVG(
    CASE WHEN eps.last_outcome IN ('increase_load', 'increase_reps') THEN 1.0
         WHEN eps.last_outcome = 'hold'                              THEN 0.5
         WHEN eps.last_outcome = 'deload_local'                      THEN 0.0
    END
  )                                           AS avg_progression_score,
  AVG(
    CASE eps.confidence
      WHEN 'high'   THEN 1.0
      WHEN 'medium' THEN 0.5
      WHEN 'low'    THEN 0.25
      ELSE NULL
    END
  )                                           AS avg_confidence_score
FROM program p
JOIN program_day pd
  ON pd.program_id = p.id
LEFT JOIN client_profile cp
  ON cp.user_id = p.user_id
LEFT JOIN exercise_progression_state eps
  ON eps.user_id = p.user_id
  AND eps.program_type = p.program_type
WHERE p.id = $1
  AND p.user_id = $2
GROUP BY p.id, cp.fitness_rank, cp.fitness_level_slug, cp.main_goals_slugs,
         cp.minutes_per_session, cp.preferred_days, cp.equipment_items_slugs,
         cp.equipment_preset_slug
```

Note: if `p.program_type` is NULL (old programs before V63), the LEFT JOIN on `exercise_progression_state` produces zero rows — that is fine; `exercises_progressed` and `avg_progression_score` will both be null/0.

**PRs achieved during this program:**

```sql
SELECT DISTINCT ON (pe.exercise_id)
  pe.exercise_id,
  COALESCE(ec.name, pe.exercise_name) AS exercise_name,
  MAX(sel.weight_kg) AS best_weight_kg
FROM segment_exercise_log sel
JOIN program_exercise pe ON pe.id = sel.program_exercise_id
JOIN program_day pd ON pd.id = sel.program_day_id
LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
WHERE sel.program_id = $1
  AND pd.is_completed = TRUE
  AND sel.is_draft = FALSE
  AND sel.weight_kg IS NOT NULL
GROUP BY pe.exercise_id, ec.name, pe.exercise_name
ORDER BY pe.exercise_id, best_weight_kg DESC
LIMIT 10
```

**Suggested next rank logic:**

```js
function suggestNextRank(fitnessRank, avgProgressionScore, exercisesProgressed, exercisesTracked) {
  const currentRank = Number.isFinite(Number(fitnessRank)) ? Number(fitnessRank) : 1;
  if (currentRank >= 3) return currentRank; // already elite
  if (exercisesTracked == null || exercisesTracked === 0) return currentRank;
  const score = Number.isFinite(Number(avgProgressionScore)) ? Number(avgProgressionScore) : 0;
  const ratio = Number(exercisesProgressed ?? 0) / Number(exercisesTracked);
  // Suggest a rank increase if the athlete progressed on >60% of tracked exercises
  // and maintained a high average progression score
  if (ratio >= 0.6 && score >= 0.6) return currentRank + 1;
  return currentRank;
}
```

**Response shape:**

```json
{
  "ok": true,
  "program_id": "...",
  "program_title": "Strength Block 1",
  "program_type": "strength",
  "weeks_completed": 12,
  "days_completed": 33,
  "days_total": 36,
  "completion_ratio": 0.917,
  "exercises_progressed": 8,
  "exercises_tracked": 12,
  "avg_progression_score": 0.71,
  "avg_confidence": "medium",
  "personal_records": [
    { "exercise_id": "bb_back_squat", "exercise_name": "Back Squat", "best_weight_kg": 120 }
  ],
  "current_profile": {
    "fitness_rank": 1,
    "fitness_level_slug": "intermediate",
    "goals": ["strength"],
    "minutes_per_session": 50,
    "preferred_days": ["mon", "wed", "fri"],
    "equipment_items_slugs": ["barbell", "rack", "dumbbells"],
    "equipment_preset_slug": "commercial_gym"
  },
  "suggested_next_rank": 2,
  "re_enrollment_options": [
    {
      "option": "same_settings",
      "label": "Start a new program (same settings)",
      "fitness_rank": 1
    },
    {
      "option": "progress_level",
      "label": "Progress to next level",
      "fitness_rank": 2
    },
    {
      "option": "change_goals",
      "label": "Change goals",
      "fitness_rank": 1
    }
  ]
}
```

**`re_enrollment_options` rules:**
- Always include `same_settings` and `change_goals`.
- Only include `progress_level` when `suggested_next_rank > current_rank` (i.e. rank increase is warranted).
- `fitness_rank` on each option is the rank the mobile client should pre-fill onboarding with for that choice.
- When `program_type` is null (old program), still return the response but with `program_type: null` and `exercises_progressed: 0`.

**`avg_confidence` label derivation:**
```js
function confidenceLabel(score) {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}
```

---

## Part 4 — Register the route

**File: `api/server.js`**

Import and register `programCompletionRouter` alongside the other route modules, using the same `/api` prefix pattern:

```js
import { programCompletionRouter } from "./src/routes/programCompletion.js";
// ...
app.use("/api", programCompletionRouter);
```

---

## Part 5 — Progression state continuity (no code change needed — verify only)

`exercise_progression_state` rows are already keyed by `(user_id, program_type, progression_group_key, purpose)` with no `program_id` column. When a user generates a new program of the same type, `runPipeline` fetches state by `user_id + program_type` (added in Feature 1). The new program inherits the previous program's decisions automatically — exercises with a `current_load_kg_override` will have Layer C apply that override to the freshly generated prescription.

There is nothing to implement here. **Verify only**: confirm that `exercise_progression_state` has no `program_id` FK by reading `migrations/V59__create_exercise_progression_state.sql`. If it does, that would be a scoping problem — but the migration shows the unique key is `(user_id, program_type, progression_group_key, purpose)` with no program FK.

---

## Part 6 — Tests

**New file: `api/test/programCompletion.route.test.js`**

Use the same `node:test` + `supertest` + real Postgres pattern as other route tests in `api/test/`. Seed:
- One user + client profile
- One program with `program_type = 'strength'` (set directly in INSERT to test the V63 column)
- At least 3 program days: 2 completed, 1 not completed
- At least 2 segment_exercise_log rows on the completed days with `weight_kg > 0`
- At least 1 exercise_progression_state row for the user + `program_type = 'strength'` with `last_outcome = 'increase_load'`

### Test cases (minimum)

| Case | Assert |
|---|---|
| Returns 200 with `ok: true` for valid owned program | Response shape matches spec |
| `days_completed` = 2, `days_total` = 3, `completion_ratio` ≈ 0.667 | Arithmetic correct |
| `exercises_progressed` = 1 when one state row has `last_outcome = 'increase_load'` | Aggregation correct |
| `personal_records` array contains exercise with `best_weight_kg > 0` | PR query returns |
| `re_enrollment_options` always contains `same_settings` and `change_goals` | At minimum 2 options |
| `suggested_next_rank` = `current_rank` when `exercises_progressed / exercises_tracked < 0.6` | Rank suggestion logic |
| Returns 404 for unknown program_id | 404, `code: "not_found"` |
| Returns 404 when program belongs to a different user | 404 (no leakage) |
| Returns 401 with no auth | 401 |
| Returns 400 for non-UUID program_id param | 400 |
| `program_type: null` programs return `exercises_progressed: 0` gracefully | No 500, no null errors |

---

## Part 7 — generateProgramV2 test: confirm program_type is persisted

**File: `api/test/generateProgramV2.integration.test.js`** (or the closest integration test)

After the full generation flow succeeds, assert:
```js
const r = await db.query(`SELECT program_type FROM program WHERE id = $1`, [programId]);
assert.equal(r.rows[0].program_type, 'hypertrophy'); // or whatever type was generated
```

If the existing integration test already asserts program fields post-generation, add this assertion there rather than creating a new test.

---

## Summary of files changed

| File | Change |
|---|---|
| `migrations/V63__add_program_type_to_program.sql` | New migration — `program_type TEXT NULL` on `program` |
| `api/src/routes/generateProgramV2.js` | Persist `programType` in Phase 5 UPDATE |
| `api/src/routes/programCompletion.js` | New route module — `completionSummary` handler |
| `api/server.js` | Register `programCompletionRouter` |
| `api/test/programCompletion.route.test.js` | New test file — 11 test cases |
| `api/test/generateProgramV2.integration.test.js` | Add `program_type` assertion |

No new tables. No new services. No changes to the generation pipeline. Progression continuity is free — it already works via the existing `exercise_progression_state` key structure.
