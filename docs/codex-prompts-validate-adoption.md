# Codex Spec: Adopt validate.js Across Route Files

**Problem:** Three route files adopted `validate.js` helpers (`requireUuid`, `requireNonEmpty`,
`safeString`, `clampInt`, `RequestValidationError`) in an earlier pass. The remaining 14 route files
still have ad-hoc inline validation — each defining its own `s()` / `isUuid()` / `ValidationError` /
`clampXxx()` helpers. The same bugs are fixed in one file but not the others; security reviewers must
audit 14 files individually.

**Already adopted** (do not touch): `loggedExercises.js`, `prsFeed.js`, `sessionHistoryMetrics.js`

**Scope of this spec:** The six non-admin mobile-facing files with the highest duplication.
Admin routes (`adminNarration`, `adminConfigs`, `adminCoverage`, `adminObservability`) are
deliberately excluded — they have more complex patterns and should be addressed in a separate PR
scoped to the admin subsystem.

**Files in scope:**
1. `api/src/routes/readProgram.js`
2. `api/src/routes/segmentLog.js`
3. `api/src/routes/debugAllowedExercises.js`
4. `api/src/routes/historyPrograms.js`
5. `api/src/routes/historyPersonalRecords.js`
6. `api/src/routes/historyTimeline.js`

---

## Context for Codex

Read before starting:
- `api/src/utils/validate.js` — the shared helpers: `safeString`, `requireNonEmpty`, `requireUuid`,
  `requireEnum`, `clampInt`, `RequestValidationError`
- `api/src/routes/loggedExercises.js` — reference for how the adopted pattern looks in practice
- Each of the six files listed above

**Critical: `RequestValidationError` vs local `ValidationError`**

`readProgram.js` and `segmentLog.js` each define their own `class ValidationError extends Error`
(not exported) and catch it in a helper function. `RequestValidationError` from `validate.js` has
the same `.status = 400`, `.message`, and `.details` fields, so it is a drop-in replacement. However,
you must update every `instanceof ValidationError` check to `instanceof RequestValidationError`.

`NotFoundError` (also local to `readProgram.js` and `segmentLog.js`) has no validate.js equivalent —
keep it as a local class.

**Exported functions that have tests**

These exported functions are directly tested in `api/test/`:
- `historyPrograms.js` → `clampLimit` (tested in `historyPrograms.route.test.js`)
- `historyPersonalRecords.js` → `clampPersonalRecordsLimit` (tested in `historyPersonalRecords.route.test.js`)
- `historyTimeline.js` → `clampTimelineLimit`, `parseTimelineCursor` (tested in `historyTimeline.route.test.js`)

Do **not** remove or rename these exports. Reimplement their bodies using `clampInt` but keep the
same function signatures and same input/output contracts. The tests will continue to pass unchanged.

**Optional UUID fields**

When a UUID param is optional (only validated if present), use:
```js
if (value) requireUuid(value, "fieldName");
```
Do not use `requireUuid` alone on an optional field — it throws on empty strings.

---

## Prompt 1 — `readProgram.js`

### Task

1. Add import at the top of `readProgram.js`:
   ```js
   import { RequestValidationError, requireUuid, safeString } from "../utils/validate.js";
   ```

2. Remove the local `class ValidationError extends Error { ... }` block entirely. Keep
   `class NotFoundError extends Error { ... }` — it has no validate.js equivalent.

3. Remove the local `function s(v) { ... }` and `function isUuid(v) { ... }` helper functions.
   The `s()` calls throughout the file become `safeString()` calls, and `isUuid()` checks become
   `requireUuid()` calls (see mapping below). Keep all other helper functions unchanged
   (`uniq`, `parseEquipmentSlugs`, `segmentTypeLabel`, etc.).

4. **Update the error-handling helper** (the function around line 100 that checks instanceof):
   - Change `err instanceof ValidationError` → `err instanceof RequestValidationError`
   - Do **not** change the `err instanceof NotFoundError` check.

5. **Replace validation calls** — exact substitutions:

   | Remove | Replace with |
   |--------|-------------|
   | `const user_id = s(query.user_id);` | `const user_id = safeString(query.user_id);` |
   | `if (!isUuid(user_id)) throw new ValidationError("Invalid user_id")` | `if (user_id) requireUuid(user_id, "user_id")` |
   | `const bubble_user_id = s(query.bubble_user_id);` | `const bubble_user_id = safeString(query.bubble_user_id);` |
   | `const program_id = s(req.params.program_id);` | `const program_id = safeString(req.params.program_id);` |
   | `if (!isUuid(program_id)) throw new ValidationError("Invalid program_id")` | `requireUuid(program_id, "program_id")` |
   | `const selected_program_day_id = s(req.query.selected_program_day_id);` | `const selected_program_day_id = safeString(req.query.selected_program_day_id);` |
   | `if (selected_program_day_id && !isUuid(selected_program_day_id)) { throw ... }` | `if (selected_program_day_id) requireUuid(selected_program_day_id, "selected_program_day_id")` |
   | `const program_day_id = s(req.params.program_day_id);` (both occurrences) | `const program_day_id = safeString(req.params.program_day_id);` |
   | `if (!isUuid(program_day_id)) throw new ValidationError("Invalid program_day_id")` (both) | `requireUuid(program_day_id, "program_day_id")` |

   All remaining `s(...)` calls in non-validation helper functions (e.g. inside `segmentTypeLabel`,
   `parseEquipmentSlugs`) — replace with `safeString(...)`.

6. **Throw `RequestValidationError`** for any remaining inline throws that used `ValidationError`:
   - `throw new ValidationError("Provide user_id or bubble_user_id")` →
     `throw new RequestValidationError("Provide user_id or bubble_user_id")`

### Verification
```bash
node --check api/src/routes/readProgram.js
node --test api/test/historyPrograms.route.test.js   # unrelated but confirms test runner works
```
Search for remaining `ValidationError` (the local class):
```bash
grep -n "class ValidationError\|new ValidationError\|instanceof ValidationError" api/src/routes/readProgram.js
# Expected: 0 results
```

---

## Prompt 2 — `segmentLog.js`

Identical pattern to `readProgram.js`. Apply the same four-step process:

1. Add import:
   ```js
   import { RequestValidationError, requireUuid, safeString } from "../utils/validate.js";
   ```

2. Remove local `class ValidationError extends Error`. Keep `class NotFoundError`.

3. Remove local `function s(v)` and `function isUuid(v)`.

4. Update the error-handling instanceof check from `ValidationError` → `RequestValidationError`.

5. **Replace validation calls:**

   | Remove | Replace with |
   |--------|-------------|
   | `const user_id = s(query.user_id)` | `const user_id = safeString(query.user_id)` |
   | `if (!isUuid(user_id)) throw new ValidationError("Invalid user_id")` | `if (user_id) requireUuid(user_id, "user_id")` |
   | `const bubble_user_id = s(query.bubble_user_id)` | `const bubble_user_id = safeString(query.bubble_user_id)` |
   | `throw new ValidationError("Provide user_id or bubble_user_id")` | `throw new RequestValidationError("Provide user_id or bubble_user_id")` |
   | `const workout_segment_id = s(req.query.workout_segment_id)` | `const workout_segment_id = safeString(req.query.workout_segment_id)` |
   | `const program_day_id = s(req.query.program_day_id)` | `const program_day_id = safeString(req.query.program_day_id)` |
   | `if (!isUuid(workout_segment_id)) throw new ValidationError(...)` | `requireUuid(workout_segment_id, "workout_segment_id")` |
   | `if (!isUuid(program_day_id)) throw new ValidationError(...)` | `requireUuid(program_day_id, "program_day_id")` |
   | `const program_id = s(req.body?.program_id)` | `const program_id = safeString(req.body?.program_id)` |
   | `if (!isUuid(program_id)) throw ...` | `requireUuid(program_id, "program_id")` |
   | `if (!isUuid(row?.program_exercise_id)) throw ...` | `requireUuid(safeString(row?.program_exercise_id), "program_exercise_id")` |
   | Any remaining `s(...)` calls | `safeString(...)` |

### Verification
```bash
node --check api/src/routes/segmentLog.js
grep -n "class ValidationError\|new ValidationError\|instanceof ValidationError" api/src/routes/segmentLog.js
# Expected: 0 results
```

---

## Prompt 3 — `debugAllowedExercises.js`

1. Add import:
   ```js
   import { RequestValidationError, requireUuid, safeString } from "../utils/validate.js";
   ```
   (Check whether the file uses a local `ValidationError` class first. If yes: remove it, update
   `instanceof` checks, and replace `throw new ValidationError(...)` with
   `throw new RequestValidationError(...)`. If the file throws raw errors inline without a catch,
   just replace those throw lines.)

2. Remove local `function s(v)` and `function isUuid(v)`.

3. Replace `s(...)` calls with `safeString(...)` throughout.

4. Replace `if (!isUuid(client_profile_id)) { ... }` with `requireUuid(client_profile_id, "client_profile_id")`.

5. Keep the `fitness_rank` coercion as-is — it is not a user-facing input validation, it is
   internal data normalization.

### Verification
```bash
node --check api/src/routes/debugAllowedExercises.js
grep -n "function s\b\|isUuid\b" api/src/routes/debugAllowedExercises.js
# Expected: 0 results
```

---

## Prompt 4 — History clamp functions (`historyPrograms.js`, `historyPersonalRecords.js`, `historyTimeline.js`)

Apply all three files in this single prompt. The change is small and mechanical for each.

### 4a. `historyPrograms.js`

1. Add import:
   ```js
   import { clampInt } from "../utils/validate.js";
   ```

2. Replace the body of `clampLimit` with a `clampInt` call. Keep the function exported:
   ```js
   export function clampLimit(rawLimit) {
     return clampInt(rawLimit, { defaultValue: 10, min: 1, max: 50 });
   }
   ```

3. Remove the local `function toFiniteNumber(...)` if it is only used inside `clampLimit`.
   If `toFiniteNumber` is used elsewhere in the file, keep it.

4. Leave `asString`, `mapHistoryProgramRow`, `createHistoryProgramsHandler`, and the SQL constant
   completely unchanged.

### 4b. `historyPersonalRecords.js`

1. Add import:
   ```js
   import { clampInt } from "../utils/validate.js";
   ```

2. Replace the body of `clampPersonalRecordsLimit`:
   ```js
   export function clampPersonalRecordsLimit(rawLimit) {
     return clampInt(rawLimit, { defaultValue: 20, min: 1, max: 50 });
   }
   ```

3. Remove `toFiniteNumber` if only used by the clamp function.

### 4c. `historyTimeline.js`

1. Add import:
   ```js
   import { clampInt, requireUuid } from "../utils/validate.js";
   ```

2. Replace the body of `clampTimelineLimit`:
   ```js
   export function clampTimelineLimit(rawLimit) {
     return clampInt(rawLimit, { defaultValue: 40, min: 1, max: 100 });
   }
   ```

3. In `parseTimelineCursor`: replace the `UUID_RE.test(rawId)` check with `requireUuid`:
   ```js
   export function parseTimelineCursor(query) {
     const rawDate = safeString(query?.cursorDate);
     const rawId   = safeString(query?.cursorId);

     if (!rawDate && !rawId) {
       return { cursorDate: null, cursorId: null };
     }

     try {
       requireUuid(rawId, "cursorId");
     } catch {
       return { error: "Invalid cursorDate/cursorId" };
     }

     if (!ISO_DATE_RE.test(rawDate)) {
       return { error: "Invalid cursorDate/cursorId" };
     }

     return { cursorDate: rawDate, cursorId: rawId };
   }
   ```
   Add `import { safeString }` to the validate.js import if not already there.
   Keep `const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;` — there is no validate.js helper for date
   format validation. Remove `const UUID_RE = ...` since it is replaced by `requireUuid`.

4. Remove `toFiniteNumber` from `historyTimeline.js` if only used by `clampTimelineLimit`.
   Keep `asString`, `asNullableString`, `mapTimelineItem`, `createHistoryTimelineHandler` unchanged.

### Verification for Prompt 4
```bash
node --check api/src/routes/historyPrograms.js
node --check api/src/routes/historyPersonalRecords.js
node --check api/src/routes/historyTimeline.js
cd api && npm test -- --test-concurrency=1
```

The following exported functions must still pass their existing tests with exactly the same
inputs/outputs as before:
- `clampLimit` in `historyPrograms.js`
- `clampPersonalRecordsLimit` in `historyPersonalRecords.js`
- `clampTimelineLimit` and `parseTimelineCursor` in `historyTimeline.js`

Do not change any test file.

---

## Final Verification (run after all four prompts)

```bash
cd api && npm test -- --test-concurrency=1
```

All 169+ tests must pass. Then confirm no local helper duplication remains in the six touched files:

```bash
grep -rn "function s(v)\|function isUuid\|class ValidationError\|const UUID_RE" \
  api/src/routes/readProgram.js \
  api/src/routes/segmentLog.js \
  api/src/routes/debugAllowedExercises.js \
  api/src/routes/historyPrograms.js \
  api/src/routes/historyPersonalRecords.js \
  api/src/routes/historyTimeline.js
# Expected: 0 results
```

---

## Out of Scope

| File | Reason excluded |
|------|----------------|
| `adminNarration.js` | `parsePriority`, `validateTemplatePayload` are domain-specific — need separate review |
| `adminConfigs.js` | Small file, low risk — migrate when next touched |
| `adminCoverage.js` | `asTextArray`, `flagIsTrue` have no direct validate.js equivalent |
| `adminObservability.js` | Already has its own `clampInt`-like local helpers that work correctly |
| `generateProgramV2.js` | Complex route, high churn — migrate validation alongside future changes |
| `historyExercise.js` | Only 2 patterns; `requireNonEmpty` replacement is trivial — migrate when next touched |
| `historyOverview.js` | No inline validation patterns found |

---

## Rule for Future Work

Any route file modified for any reason should have its remaining inline validation migrated to
`validate.js` helpers in the same PR. This is how the remaining files get cleaned up without a
dedicated big-bang pass.
