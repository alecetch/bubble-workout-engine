# Codex Spec: clientProfileService Tests

**Why:** `clientProfileService.js` is the freshly-written replacement for the pre-production
in-memory blocker. It has zero test coverage. `patchProfile` dynamically builds a SQL SET clause —
a bug there silently corrupts user profiles with no signal in CI. `toApiShape` maps every profile
field — a wrong key name breaks every caller immediately.

---

## Context for Codex

Read before starting:
- `api/src/services/clientProfileService.js` — full source (all five functions)
- `api/src/middleware/__tests__/resolveUser.test.js` — mock-DB pattern to follow
- `api/src/utils/__tests__/mediaUrl.test.js` — pure function test style

Key facts:
- `upsertUser`, `upsertProfile`, `getProfileByBubbleUserId`, `patchProfile` all import `pool`
  directly from `../db.js`. They are **not** testable via injection without refactoring.
- `toApiShape` is a pure function — it takes a DB row object and returns a camelCase shape.
  It needs no mock and can be tested directly.
- For the DB-calling functions, the same `makeXxx(db)` factory refactor used in `resolveUser.js`
  is the right approach.

---

## Prompt 1 — Refactor for Testability

Open `api/src/services/clientProfileService.js`. Apply the same factory pattern used in
`resolveUser.js` (`makeResolveBubbleUser(db = pool)`):

1. Remove `import { pool } from "../db.js"` from the top of the file.

2. Wrap all five exported functions in a single factory:
   ```js
   import { pool as defaultPool } from "../db.js";

   export function makeClientProfileService(db = defaultPool) {
     async function upsertUser(bubbleUserId) { /* unchanged body using db */ }
     async function upsertProfile(pgUserId, bubbleClientProfileId) { /* unchanged body */ }
     async function getProfileByBubbleUserId(bubbleUserId) { /* unchanged body */ }
     async function patchProfile(profileId, fields) { /* unchanged body */ }
     return { upsertUser, upsertProfile, getProfileByBubbleUserId, patchProfile };
   }
   ```

3. Export default instances so all existing call-sites continue to work unchanged:
   ```js
   const _default = makeClientProfileService();
   export const upsertUser = _default.upsertUser;
   export const upsertProfile = _default.upsertProfile;
   export const getProfileByBubbleUserId = _default.getProfileByBubbleUserId;
   export const patchProfile = _default.patchProfile;
   ```

4. Keep `export function toApiShape(row) { ... }` as a standalone export — it is pure and does
   not need the factory.

5. Keep `const profileFieldToColumn = new Map(...)` at module level — it is shared by the factory.

### Verification
```bash
node --check api/src/services/clientProfileService.js
cd api && npm test -- --test-concurrency=1
# All existing tests must continue to pass — no call-site changes needed
```

---

## Prompt 2 — Write the Tests

Create `api/src/services/__tests__/clientProfileService.test.js`.

Use only `node:test`, `node:assert/strict`, and the imports from the service itself.

### Mock DB builder

```js
function mockDb(responses) {
  // responses: array of { rowCount, rows } in call order
  let callIndex = 0;
  return {
    async query(_sql, _params) {
      const response = responses[callIndex++];
      if (!response) throw new Error(`Unexpected DB call at index ${callIndex - 1}`);
      if (response instanceof Error) throw response;
      return response;
    },
  };
}
```

---

### `toApiShape` — pure function, test directly (no mock needed)

```
"toApiShape maps all DB columns to camelCase API fields"
  row = {
    bubble_client_profile_id: "buid-123",
    main_goals_slugs: ["strength"],
    fitness_level_slug: "intermediate",
    injury_flags: ["knee_issues"],
    goal_notes: "focus on legs",
    equipment_preset_slug: "commercial_gym",
    equipment_items_slugs: ["barbell", "dumbbells"],
    preferred_days: ["mon", "wed"],
    schedule_constraints: "no evenings",
    height_cm: 180,
    weight_kg: 80.5,
    minutes_per_session: 60,
    sex: "male",
    age_range: "25_34",
    onboarding_step_completed: 3,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    program_type_slug: "strength",
  }
  → assert.deepEqual(toApiShape(row), {
      id: "buid-123",
      userId: "buid-123",
      goals: ["strength"],
      fitnessLevel: "intermediate",
      injuryFlags: ["knee_issues"],
      goalNotes: "focus on legs",
      equipmentPreset: "commercial_gym",
      equipmentItemCodes: ["barbell", "dumbbells"],
      preferredDays: ["mon", "wed"],
      scheduleConstraints: "no evenings",
      heightCm: 180,
      weightKg: 80.5,
      minutesPerSession: 60,
      sex: "male",
      ageRange: "25_34",
      onboardingStepCompleted: 3,
      onboardingCompletedAt: "2026-01-01T00:00:00Z",
      programType: "strength",
    })

"toApiShape applies null/empty defaults for missing fields"
  row = { bubble_client_profile_id: "buid-empty" }
  → result.goals deep-equals []
  → result.injuryFlags deep-equals []
  → result.equipmentItemCodes deep-equals []
  → result.preferredDays deep-equals []
  → result.goalNotes === ""
  → result.scheduleConstraints === ""
  → result.onboardingStepCompleted === 0
  → result.fitnessLevel === null
  → result.equipmentPreset === null
  → result.programType === null
```

---

### `upsertUser`

Use `makeClientProfileService(mockDb(...))`.

```
"upsertUser returns { id } from RETURNING row"
  db: single call returning { rowCount: 1, rows: [{ id: "pg-uuid-abc" }] }
  call: await svc.upsertUser("bubble-user-1")
  → result deep-equals { id: "pg-uuid-abc" }
  → db query received params containing "bubble-user-1"

"upsertUser propagates DB error"
  db: throws new Error("connection refused")
  → await assert.rejects(() => svc.upsertUser("x"), /connection refused/)
```

To verify the SQL params, capture them from the mock:
```js
let capturedParams;
const db = {
  async query(_sql, params) {
    capturedParams = params;
    return { rowCount: 1, rows: [{ id: "pg-uuid-abc" }] };
  },
};
```

---

### `upsertProfile`

```
"upsertProfile returns new profile UUID when INSERT succeeds"
  db: single call returning { rowCount: 1, rows: [{ id: "profile-uuid-1" }] }
  call: await svc.upsertProfile("pg-user-uuid", "bubble-user-1")
  → result === "profile-uuid-1"

"upsertProfile falls back to SELECT when INSERT conflicts (rowCount 0)"
  db responses: [
    { rowCount: 0, rows: [] },              // INSERT … DO NOTHING
    { rowCount: 1, rows: [{ id: "existing-profile-uuid" }] },  // SELECT fallback
  ]
  call: await svc.upsertProfile("pg-user-uuid", "bubble-user-1")
  → result === "existing-profile-uuid"

"upsertProfile returns null when both INSERT and SELECT return nothing"
  db responses: [
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]
  → result === null
```

---

### `getProfileByBubbleUserId`

```
"getProfileByBubbleUserId returns null when no row found"
  db: { rowCount: 0, rows: [] }
  → result === null

"getProfileByBubbleUserId returns toApiShape(row) when row found"
  db: { rowCount: 1, rows: [{ bubble_client_profile_id: "buid-xyz", main_goals_slugs: ["strength"] }] }
  → result.id === "buid-xyz"
  → result.goals deep-equals ["strength"]
```

---

### `patchProfile`

This is the highest-risk function — it builds SQL dynamically.

```
"patchProfile returns null when no row matches"
  db: { rowCount: 0, rows: [] }
  call: await svc.patchProfile("buid-xyz", { fitnessLevel: "intermediate" })
  → result === null

"patchProfile builds SET clause for known fields only"
  capturedSql = ""
  db = { async query(sql, params) { capturedSql = sql; return { rowCount: 1, rows: [minimalRow] }; } }
  call: await svc.patchProfile("buid-xyz", { fitnessLevel: "advanced", goals: ["strength"] })
  → capturedSql contains "fitness_level_slug = $1"
  → capturedSql contains "main_goals_slugs = $2"
  → capturedSql contains "updated_at = now()"
  → capturedSql contains "WHERE bubble_client_profile_id = $3"

"patchProfile ignores fields not in profileFieldToColumn"
  capturedSql = ""
  db = { async query(sql, params) { capturedSql = sql; return { rowCount: 1, rows: [minimalRow] }; } }
  call: await svc.patchProfile("buid-xyz", { unknownField: "x", fitnessLevel: "beginner" })
  → capturedSql does NOT contain "unknown_field"
  → capturedSql contains "fitness_level_slug"

"patchProfile skips fields with undefined value"
  call: await svc.patchProfile("buid-xyz", { fitnessLevel: undefined, goals: ["strength"] })
  → capturedSql does NOT contain "fitness_level_slug"
  → capturedSql contains "main_goals_slugs"

"patchProfile empty patch only updates updated_at"
  call: await svc.patchProfile("buid-xyz", {})
  → capturedSql contains "updated_at = now()"
  → capturedSql does NOT contain "fitness_level_slug"
  (Still executes the UPDATE and returns the row — not an error)

"patchProfile returns toApiShape of updated row"
  db: { rowCount: 1, rows: [{ bubble_client_profile_id: "buid-xyz", fitness_level_slug: "advanced" }] }
  → result.id === "buid-xyz"
  → result.fitnessLevel === "advanced"
```

For `minimalRow` in the SQL capture tests, use `{ bubble_client_profile_id: "buid-xyz" }`.

---

### Verification

```bash
node --test api/src/services/__tests__/clientProfileService.test.js
# Expected: all tests pass

cd api && npm test -- --test-concurrency=1
# Expected: 172 existing + new tests, 0 failing
```
