# Codex Prompt: Feature 1 — Close the Adaptation Loop

## Goal

Wire two things that are architecturally complete but not connected:

1. **Layer B trigger** — after `PATCH /api/day/:id/complete` marks a day done, fire `applyProgressionRecommendations` as a non-blocking post-commit side effect. This writes decisions to `exercise_progression_state` and `exercise_progression_decision`.

2. **Layer C (Step 07)** — a new pipeline step that reads `exercise_progression_state` for the user and applies per-exercise load / rep / set / rest overrides to the generated program object before it is emitted. Wired into `runPipeline.js` after Step 04, before Step 05. Gated by `decision_engine_version: "v2"` in the progression config.

No new DB tables, no new migrations, no new services. All three tables (`exercise_progression_state`, `exercise_progression_decision`, `program_exercise`) and the `applyProgressionRecommendations` function already exist.

---

## Context files to read before writing any code

Read these files in full before starting:

- `api/src/routes/readProgram.js` — the `dayComplete` handler is at line 550; this is where Layer B fires
- `api/src/services/progressionDecisionService.js` — `makeProgressionDecisionService(db)` factory and `applyProgressionRecommendations` method
- `api/engine/runPipeline.js` — orchestrator; DB fetches happen here before steps run
- `api/engine/steps/03_applyProgression.js` — shows `deload_rir_bump` flag written to items; deload week is identified by `progCfg.deload.week` (a 1-based week index)
- `api/engine/steps/04_applyRepRules.js` — so Step 07 can be positioned correctly after it
- `api/src/services/importEmitterService.js` — shows EX row parsing (cols 1–25); confirms `sets_prescribed` = col 7, `reps_prescribed` = col 8, `rest_seconds` = col 12
- `migrations/V59__create_exercise_progression_state.sql` — schema of `exercise_progression_state`
- `migrations/V60__create_exercise_progression_decision.sql` — schema of `exercise_progression_decision`
- `migrations/V58__add_program_exercise_progression_fields.sql` — `prescribed_load_kg`, `progression_key` columns on `program_exercise`
- `api/src/routes/generateProgramV2.js` — to understand where `runPipeline` is called and how `userId` is available

---

## Part 1 — Layer B: trigger in dayComplete

**File: `api/src/routes/readProgram.js`**

### What to change

The `dayComplete` handler (line 550) currently does:
1. Validates `program_day_id`
2. Runs an UPDATE to set `is_completed = $3`
3. Returns `{ ok: true }`

After the UPDATE RETURNING succeeds and `is_completed === true`, add a non-blocking call to `applyProgressionRecommendations`. The response to the mobile client must not be delayed — fire and forget with error logging.

### Implementation

1. Import `makeProgressionDecisionService` at the top of `readProgram.js`:
   ```js
   import { makeProgressionDecisionService } from "../services/progressionDecisionService.js";
   ```

2. In `createReadProgramHandlers`, after constructing `db` (already done in the factory), create the progression service:
   ```js
   const progressionDecisionService = makeProgressionDecisionService(db);
   ```

3. In the `dayComplete` handler, after the RETURNING check passes and `Boolean(is_completed) === true`, fire this non-blocking block **after** `client.release()` and **before** `return res.json(...)`:

   ```js
   if (Boolean(is_completed)) {
     // Non-blocking — do not await; errors must not fail the response
     db.query(
       `SELECT
          p.id            AS program_id,
          p.program_type,
          cp.fitness_rank
        FROM program_day pd
        JOIN program p
          ON p.id = pd.program_id
        LEFT JOIN client_profile cp
          ON cp.user_id = p.user_id
        WHERE pd.id = $1`,
       [program_day_id],
     )
       .then((meta) => {
         const row = meta.rows[0];
         if (!row?.program_id) return;
         return progressionDecisionService.applyProgressionRecommendations({
           programId: row.program_id,
           userId: user_id,
           programType: row.program_type,
           fitnessRank: row.fitness_rank ?? 1,
         });
       })
       .catch((err) => {
         req.log?.warn(
           { event: "progression.layer_b.error", err: err?.message, program_day_id },
           "Layer B progression decision failed (non-blocking)",
         );
       });
   }
   ```

   The `client` pool connection (from `db.connect()`) is released before this block runs. The non-blocking query uses the pool directly (`db.query`), so no connection leak.

### Constraints

- Do NOT `await` the non-blocking block.
- Do NOT move the `return res.json(...)` call — it stays at the same position.
- The handler already has `user_id` in scope from `resolveUserId(req)` — use it.
- Layer B fires only when `is_completed` is truthy. If the client sends `is_completed: false` (uncomplete), skip.

---

## Part 2 — Layer C: Step 07

**New file: `api/engine/steps/07_applyExerciseProgressionOverrides.js`**

### What this step does

Step 07 receives the program object (after Step 04 has applied rep rules) and a map of progression state keyed by `exercise_id`. For each exercise item across all weeks, it applies per-exercise overrides from progression state. Deload weeks are respected: positive progression overrides are suppressed during a structural deload week.

This step operates on `program.weeks[w].days[d].segments[s].items[i]` (the expanded weeks array from Step 03). It does NOT query the DB — all data is pre-fetched by `runPipeline` and passed in.

### Function signature

```js
export function applyExerciseProgressionOverrides({
  program,
  progressionStateByExerciseId,  // Map<exercise_id, exercise_progression_state_row>
  deloadWeekIndex,               // 1-based week number that is a structural deload (null if none)
}) {
  // returns { program, debug }
}
```

### Algorithm

```
For each week w in program.weeks[]:
  isDeloadWeek = (deloadWeekIndex != null && w.week_index === deloadWeekIndex)

  For each day d in w.days[]:
    For each segment s in d.segments[]:
      For each item i in s.items[]:
        state = progressionStateByExerciseId.get(item.exercise_id)
        if !state → continue (no history, no override)

        outcome = state.last_outcome

        if isDeloadWeek:
          // Only apply deload_local load drops. Skip all positive progressions.
          if outcome === 'deload_local' AND state.current_load_kg_override != null:
            item.prescribed_load_kg = state.current_load_kg_override
            item._progression_override_debug = { applied: 'deload_suppressed_structural' }
          else:
            item._progression_override_debug = { skipped: 'deload_week' }
          continue

        // Non-deload week: apply all overrides
        if state.current_load_kg_override != null:
          item.prescribed_load_kg = Number(state.current_load_kg_override)

        if state.current_rep_target_override != null:
          // reps_prescribed is a string like "8-12" or "5". Replace with the target rep count.
          // Preserve any trailing text (e.g. "reps") but replace the numeric part.
          item.reps_prescribed = String(state.current_rep_target_override)

        if state.current_set_override != null AND state.current_set_override >= 1:
          item.sets = state.current_set_override

        if state.current_rest_sec_override != null AND state.current_rest_sec_override >= 0:
          item.rest_seconds = state.current_rest_sec_override

        item._progression_override_debug = {
          applied: true,
          outcome,
          load_kg: item.prescribed_load_kg ?? null,
          reps: item.reps_prescribed,
        }
        overrides_applied++
```

### Important constraints

- Step 07 must be a **pure function** — no DB queries, no async, no side effects.
- The function must be tolerant of missing fields. If `program.weeks` is absent, return the program unchanged.
- Mutations go on the item in place (the deep-copy from Step 03 already isolated template days).
- `item.sets` is the set count used by the emitter (check what field name Step 04 uses — confirm by reading Step 04 output; it may be `item.sets` or `item.sets_prescribed`).
- `item.prescribed_load_kg` is a new field that the emitter does not yet use. Write it to the item regardless; it will be read by `importEmitterService` once that is updated (see Part 3).
- The debug field `_progression_override_debug` is an ephemeral annotation for the debug output — it is fine if the emitter ignores it.
- Return `{ program, debug: { overrides_applied, weeks_with_deload_suppression } }`.

---

## Part 3 — Wire Step 07 into runPipeline

**File: `api/engine/runPipeline.js`**

### Changes

1. **Import Step 07**:
   ```js
   import { applyExerciseProgressionOverrides } from "./steps/07_applyExerciseProgressionOverrides.js";
   ```

2. **Accept `userId` in the options object**:
   ```js
   export async function runPipeline({ inputs, programType, request, db, userId }) {
   ```
   `userId` is optional (null/undefined for admin preview calls). When absent, Step 07 is skipped.

3. **Determine if Layer C is enabled**:

   After `pgcSelectedRow` is resolved (already done in the existing code), read the decision engine version:
   ```js
   const progressionJson = safeJsonParseMaybe(pgcSelectedRow?.program_generation_config_json?.progression ?? pgcSelectedRow?.program_generation_config_json, null);
   const decisionEngineVersion = progressionJson?.decision_engine_version ?? "v1";
   const layerCEnabled = decisionEngineVersion === "v2" && !!userId;
   ```

4. **Fetch progression state (before Step 01)**:

   In the existing pre-step DB fetch block (alongside media assets, narration templates, etc.):
   ```js
   let progressionStateByExerciseId = new Map();
   let progressionStateSource = "none";
   if (layerCEnabled) {
     try {
       const psResult = await dbClient.query(
         `SELECT exercise_id, purpose, current_load_kg_override, current_rep_target_override,
                 current_set_override, current_rest_sec_override, last_outcome, confidence
          FROM exercise_progression_state
          WHERE user_id = $1 AND program_type = $2`,
         [userId, programType],
       );
       for (const row of psResult.rows ?? []) {
         progressionStateByExerciseId.set(row.exercise_id, row);
       }
       progressionStateSource = `db:${progressionStateByExerciseId.size} rows`;
     } catch (err) {
       // Non-fatal: Layer C degrades silently
       progressionStateSource = `error:${err?.message}`;
     }
   }
   ```

5. **Determine deload week index**:

   After Step 03 runs (already done), extract the deload week index from the progression config:
   ```js
   const deloadCfg = pgcSelectedRow?.progression_by_rank_json?.[rankKey(fitnessRank)]?.deload ?? null;
   const deloadWeekIndex = deloadCfg?.week ? Number(deloadCfg.week) : null;
   ```

   Where `rankKey` maps the fitness rank integer to the string key ("beginner"/"intermediate"/"advanced"/"elite"). You can either import this from `progressionDecisionService.js` (it is already exported as a named export) or inline a simple version.

6. **Run Step 07 after Step 04 and before Step 05**:

   ```js
   // Step 7 — apply per-exercise progression overrides (Layer C)
   let step7 = { program: step4.program, debug: { skipped: "layer_c_disabled" } };
   if (layerCEnabled && progressionStateByExerciseId.size > 0) {
     step7 = applyExerciseProgressionOverrides({
       program: step4.program,
       progressionStateByExerciseId,
       deloadWeekIndex,
     });
   }
   step7.debug = step7.debug || {};
   step7.debug.progression_state_source = progressionStateSource;
   ```

7. **Pass step7.program into Step 05** (narration):

   Change `program: step4.program` to `program: step7.program` in the Step 05 call.

8. **Include Step 07 debug in the final debug output**:

   Wherever the existing `debug` object is assembled, include `step7: step7.debug`.

### Constraints

- `runPipeline` must still work when `userId` is absent (admin preview, seeding, tests). When `layerCEnabled` is false, Step 07 is a no-op and `step4.program` passes straight to Step 05 unchanged.
- Do not put the `exercise_progression_state` query inside a pipeline step — keep it in `runPipeline` with the other pre-step DB fetches, consistent with existing architecture.

---

## Part 4 — Pass userId from generateProgramV2

**File: `api/src/routes/generateProgramV2.js`**

Find the call to `runPipeline(...)`. The `user_id` is already in scope (it is used when calling `importEmitterPayload`). Add it to the call:

```js
const pipelineResult = await runPipeline({
  inputs,
  programType,
  request,
  db: pool,
  userId: user_id,   // add this line
});
```

No other changes to this file.

---

## Part 5 — importEmitterService: persist prescribed_load_kg

**File: `api/src/services/importEmitterService.js`**

The EX row format does not currently include `prescribed_load_kg`. Rather than extending the pipe-delimited format, add a post-import DB update after the program exercises are inserted.

After the `INSERT INTO program_exercise ...` batch (find the existing loop that inserts EX rows), add:

```js
// Apply prescribed_load_kg from progression state if present
if (options?.progressionStateByExerciseId?.size > 0) {
  for (const ex of parsedExercises) {
    const state = options.progressionStateByExerciseId.get(ex.exercise_id);
    if (state?.current_load_kg_override != null) {
      await client.query(
        `UPDATE program_exercise
         SET prescribed_load_kg = $1
         WHERE program_id = $2
           AND exercise_id = $3`,
        [state.current_load_kg_override, programId, ex.exercise_id],
      );
    }
  }
}
```

However, **if modifying importEmitterService is complex** (it is a transaction-heavy file), this part can be deferred. The `prescribed_load_kg` column exists but is nullable — leaving it null has no functional impact on the current day view. The mobile client reads `recommended_load_kg` from `program_exercise` (already written by Layer B's `applyProgressionRecommendations`) which is the correct field to display to the user. `prescribed_load_kg` is an internal tracking column only.

**If you choose to defer Part 5**, simply skip it and note it in a code comment near the Step 07 implementation.

---

## Part 6 — Activate Layer C for strength config

**File: `migrations/R__seed_program_generation_config.sql`**

In the `strength_default_v1` config row, inside the `program_generation_config_json` JSONB, set:

```json
"progression": {
  "decision_engine_version": "v2",
  ...existing progression fields...
}
```

Only `strength_default_v1` should be activated in this initial rollout. Leave `hypertrophy_default_v1` at `"v1"` until the strength activation is validated.

---

## Part 7 — Tests

### Test 1: `07_applyExerciseProgressionOverrides.test.js`

**File: `api/engine/steps/__tests__/07_applyExerciseProgressionOverrides.test.js`**

Write using the same `node:test` + `assert` pattern as the existing step tests in the same directory.

Test cases (minimum):

| Case | Description | Assert |
|---|---|---|
| No state rows | `progressionStateByExerciseId` is empty map | Program returned unchanged; debug.overrides_applied = 0 |
| Load override applied | State row has `current_load_kg_override = 110` for `bb_back_squat` | Item in week 1 has `prescribed_load_kg = 110` |
| Reps override applied | State row has `current_rep_target_override = 5` | Item `reps_prescribed = "5"` |
| Deload week suppresses positive override | `deloadWeekIndex = 4`, state has `increase_load` outcome | Week 4 item NOT modified; week 1 item IS modified |
| Deload week applies deload_local drop | `deloadWeekIndex = 4`, state has `deload_local` outcome + `current_load_kg_override = 85` | Week 4 item gets `prescribed_load_kg = 85` |
| Missing weeks | `program.weeks` absent | Returns program unchanged without throwing |

Build a minimal synthetic program object for the tests — weeks with at least 2 days, each day with a segments array containing one item with the test exercise_id.

### Test 2: Layer B trigger in readProgram (existing test file)

**File: `api/test/readProgram.route.test.js`** (or wherever route tests live)

Add a test: `PATCH /api/day/:id/complete responds 200 when Layer B fires non-blocking`. The test should:
- Complete a seeded program day
- Assert the response is `{ ok: true }` immediately (not delayed by Layer B)
- Not assert anything about `exercise_progression_state` (Layer B is non-blocking; the state write may not be committed by the time the response arrives in a test)

---

## Verification steps

After implementation:

1. `npm test -- --test-concurrency=1` must pass (all existing tests green).
2. In local Docker env, generate a strength program, complete day 1 with logged sets, then check `exercise_progression_state` has rows for the user.
3. Generate a new strength program — confirm the `_progression_override_debug` annotations appear in the pipeline debug output.
4. In the admin preview page (`/admin/preview`), the preview should still work with `strength` selected (Layer C is gated to `userId` being present; admin preview has no `userId`, so Step 07 is skipped).

---

## Summary of files changed

| File | Change |
|---|---|
| `api/src/routes/readProgram.js` | Layer B non-blocking trigger in `dayComplete` |
| `api/engine/steps/07_applyExerciseProgressionOverrides.js` | New file — Layer C pure function |
| `api/engine/runPipeline.js` | Import Step 07; add `userId` param; fetch progression state; call Step 07 after Step 04 |
| `api/src/routes/generateProgramV2.js` | Pass `userId` to `runPipeline` |
| `migrations/R__seed_program_generation_config.sql` | Set `decision_engine_version: "v2"` on `strength_default_v1` only |
| `api/engine/steps/__tests__/07_applyExerciseProgressionOverrides.test.js` | New test file |
| `api/src/services/importEmitterService.js` | *(optional)* `prescribed_load_kg` post-import update |

Four required files, one optional, one new test. No new DB tables. No new services.
