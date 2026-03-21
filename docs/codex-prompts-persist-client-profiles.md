# Codex Spec: Persist Client Profiles to Postgres

**Problem:** `server.js` uses in-memory Maps (`profilesById`, `userToProfileId`) and a hardcoded
`DEV_USER_ID = "dev-user-1"` for all profile operations. Every container restart wipes all user
profiles, and every user shares the same identity. This is a pre-production blocker.

**Goal:** Replace the in-memory store with Postgres-backed reads/writes using the existing
`app_user` (V3) and `client_profile` (V5) tables, with `bubble_user_id` as the stable user key.

---

## Context for Codex

Key files to read before starting:
- `migrations/V3__create_app_user.sql` — `app_user(id uuid, bubble_user_id text UNIQUE)`
- `migrations/V5__create_client_profile.sql` — `client_profile` table schema
- `api/server.js` lines 100–481 — the in-memory store and five routes to replace
- `api/src/middleware/resolveUser.js` — pattern for reading `bubble_user_id` from `req.query`
- `api/src/middleware/chains.js` — `internalApi`, `internalWithUser`, `adminOnly` chain exports
- `api/src/routes/generateProgramV2.js` lines 100–250 — reads `dev_user_id` / `dev_client_profile_id`
  from request body and fetches profile from `req.app.locals.profilesById`

**DB column mapping** (in-memory field → `client_profile` column):

| In-memory field          | DB column                    |
|--------------------------|------------------------------|
| `goals`                  | `main_goals_slugs text[]`    |
| `fitnessLevel`           | `fitness_level_slug text`    |
| `injuryFlags`            | `injury_flags text[]`        |
| `goalNotes`              | `goal_notes text`            |
| `equipmentPreset`        | `equipment_preset_slug text` |
| `equipmentItemCodes`     | `equipment_items_slugs text[]` |
| `preferredDays`          | `preferred_days text[]`      |
| `scheduleConstraints`    | `schedule_constraints text`  |
| `heightCm`               | `height_cm int`              |
| `weightKg`               | `weight_kg numeric`          |
| `minutesPerSession`      | `minutes_per_session int`    |
| `sex`                    | `sex text` *(add via V26)*   |
| `ageRange`               | `age_range text` *(add via V26)* |
| `onboardingStepCompleted`| `onboarding_step_completed int` *(add via V26)* |
| `onboardingCompletedAt`  | `onboarding_completed_at timestamptz` *(add via V26)* |
| `programType`            | `program_type_slug text` *(add via V26)* |

---

## Prompt 1 — Migration + Profile Service

### Task
1. Create `migrations/V26__client_profile_onboarding_fields.sql` to add the five columns missing
   from the existing `client_profile` table:
   ```sql
   ALTER TABLE client_profile
     ADD COLUMN IF NOT EXISTS sex text,
     ADD COLUMN IF NOT EXISTS age_range text,
     ADD COLUMN IF NOT EXISTS onboarding_step_completed int NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
     ADD COLUMN IF NOT EXISTS program_type_slug text;
   ```

2. Create `api/src/services/clientProfileService.js` (ESM, `import { pool } from "../db.js"`).
   Export the following five functions — all `async`, all use parameterised `pool.query()`:

   **`upsertUser(bubbleUserId)`**
   - `INSERT INTO app_user (bubble_user_id) VALUES ($1) ON CONFLICT (bubble_user_id) DO UPDATE SET updated_at = now() RETURNING id`
   - Returns `{ id: uuid }`.

   **`upsertProfile(pgUserId, bubbleClientProfileId)`**
   - `INSERT INTO client_profile (user_id, bubble_client_profile_id) VALUES ($1, $2) ON CONFLICT (bubble_client_profile_id) DO NOTHING RETURNING id`
   - If rowCount === 0 (conflict), fetch the existing row: `SELECT id FROM client_profile WHERE bubble_client_profile_id = $1`
   - Returns the profile UUID string.

   **`getProfileByBubbleUserId(bubbleUserId)`**
   - JOIN `app_user` + `client_profile` on `user_id`:
     ```sql
     SELECT cp.*
     FROM client_profile cp
     JOIN app_user au ON cp.user_id = au.id
     WHERE au.bubble_user_id = $1
     LIMIT 1
     ```
   - Returns `null` if no rows, otherwise calls `toApiShape(row)`.

   **`patchProfile(profileId, fields)`**
   - `fields` is a plain object whose keys are a subset of `profilePatchKeys` (see server.js line 126).
   - Build a SET clause dynamically from the allowed DB columns listed in the mapping table above.
     Skip keys not in the mapping. Skip keys whose value is `undefined`.
   - Append `updated_at = now()` to the SET clause.
   - `UPDATE client_profile SET ... WHERE id = $N RETURNING *`
   - Returns `toApiShape(row)` or `null` if no rows updated.

   **`toApiShape(row)`**
   - Maps DB column names back to camelCase fields matching the current in-memory profile shape:
     ```js
     return {
       id: row.bubble_client_profile_id,   // stable ID the mobile app already holds
       userId: row.bubble_client_profile_id, // legacy field — same value
       goals: row.main_goals_slugs ?? [],
       fitnessLevel: row.fitness_level_slug ?? null,
       injuryFlags: row.injury_flags ?? [],
       goalNotes: row.goal_notes ?? "",
       equipmentPreset: row.equipment_preset_slug ?? null,
       equipmentItemCodes: row.equipment_items_slugs ?? [],
       preferredDays: row.preferred_days ?? [],
       scheduleConstraints: row.schedule_constraints ?? "",
       heightCm: row.height_cm ?? null,
       weightKg: row.weight_kg ?? null,
       minutesPerSession: row.minutes_per_session ?? null,
       sex: row.sex ?? null,
       ageRange: row.age_range ?? null,
       onboardingStepCompleted: row.onboarding_step_completed ?? 0,
       onboardingCompletedAt: row.onboarding_completed_at ?? null,
       programType: row.program_type_slug ?? null,
     };
     ```

   > Note: `id` in the API shape is set to `bubble_client_profile_id` so that the mobile app's
   > existing profile ID references remain valid after the migration.

### Verification
After applying the migration and writing the service, confirm:
- `migrations/V26__client_profile_onboarding_fields.sql` exists and contains only `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements.
- `api/src/services/clientProfileService.js` exports exactly: `upsertUser`, `upsertProfile`, `getProfileByBubbleUserId`, `patchProfile`, `toApiShape`.
- No `console.*` calls — use `import logger from "../utils/logger.js"` for any error logging.

---

## Prompt 2 — Replace In-Memory Routes in server.js

### Task
Open `api/server.js`. Replace the five in-memory profile routes with Postgres-backed equivalents.

**Remove entirely:**
- `const DEV_USER_ID = "dev-user-1";`
- `const profilesById = new Map();`
- `const userToProfileId = new Map();`
- `app.locals.profilesById = profilesById;`
- `function createDevProfile(id, userId) { ... }` (lines ~153–174)
- The five TODO-marked route handlers: `GET /me`, `POST /client-profiles`,
  `GET /client-profiles/:id`, `PATCH /client-profiles/:id`, `PATCH /users/me`

**Add imports at top of server.js (with existing imports):**
```js
import { requireInternalToken } from "./src/middleware/auth.js";
import {
  upsertUser,
  upsertProfile,
  getProfileByBubbleUserId,
  patchProfile,
} from "./src/services/clientProfileService.js";
```

**Add the five replacement routes** (place them where the removed routes were, before the router mounts):

```js
// GET /me — returns the user's identity and current profile ID.
// Query: ?bubble_user_id=<id>
app.get("/me", requireInternalToken, async (req, res) => {
  const bubbleUserId = (req.query.bubble_user_id ?? "").toString().trim();
  if (!bubbleUserId) {
    return res.status(400).json({ ok: false, code: "validation_error", error: "bubble_user_id is required" });
  }
  try {
    const profile = await getProfileByBubbleUserId(bubbleUserId);
    return res.status(200).json({
      id: bubbleUserId,
      clientProfileId: profile?.id ?? null,
    });
  } catch (err) {
    req.log.error({ event: "profile.me.error", err: err?.message }, "GET /me error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

// POST /client-profiles — upsert user + create profile if none exists.
// Query: ?bubble_user_id=<id>
app.post("/client-profiles", requireInternalToken, async (req, res) => {
  const bubbleUserId = (req.query.bubble_user_id ?? "").toString().trim();
  if (!bubbleUserId) {
    return res.status(400).json({ ok: false, code: "validation_error", error: "bubble_user_id is required" });
  }
  try {
    const { id: pgUserId } = await upsertUser(bubbleUserId);
    await upsertProfile(pgUserId, bubbleUserId);   // bubble_client_profile_id = bubble_user_id
    const profile = await getProfileByBubbleUserId(bubbleUserId);
    return res.status(200).json(profile);
  } catch (err) {
    req.log.error({ event: "profile.create.error", err: err?.message }, "POST /client-profiles error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

// GET /client-profiles/:id — read profile by bubble_client_profile_id (= bubble_user_id).
app.get("/client-profiles/:id", requireInternalToken, async (req, res) => {
  const profileId = req.params.id;
  try {
    const profile = await getProfileByBubbleUserId(profileId);
    if (!profile) {
      return res.status(404).json({ ok: false, code: "not_found", error: "Profile not found" });
    }
    return res.status(200).json(profile);
  } catch (err) {
    req.log.error({ event: "profile.get.error", err: err?.message }, "GET /client-profiles/:id error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

// PATCH /client-profiles/:id — patch profile fields.
// :id is bubble_client_profile_id (= bubble_user_id).
app.patch("/client-profiles/:id", requireInternalToken, async (req, res) => {
  const profileId = req.params.id;
  const patch = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  try {
    const updated = await patchProfile(profileId, patch);
    if (!updated) {
      return res.status(404).json({ ok: false, code: "not_found", error: "Profile not found" });
    }
    req.log.debug({ event: "profile.patch", id: profileId }, "profile patch applied");
    return res.status(200).json(updated);
  } catch (err) {
    req.log.error({ event: "profile.patch.error", err: err?.message }, "PATCH /client-profiles/:id error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

// PATCH /users/me — associate a profile with a user (no-op for Postgres-backed store,
// kept for API compatibility; returns current identity).
// Query: ?bubble_user_id=<id>
app.patch("/users/me", requireInternalToken, async (req, res) => {
  const bubbleUserId = (req.query.bubble_user_id ?? "").toString().trim();
  if (!bubbleUserId) {
    return res.status(400).json({ ok: false, code: "validation_error", error: "bubble_user_id is required" });
  }
  try {
    const profile = await getProfileByBubbleUserId(bubbleUserId);
    return res.status(200).json({
      id: bubbleUserId,
      clientProfileId: profile?.id ?? null,
    });
  } catch (err) {
    req.log.error({ event: "profile.users_me.error", err: err?.message }, "PATCH /users/me error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});
```

### Verification
After the edit, confirm:
- `server.js` contains no references to `DEV_USER_ID`, `profilesById`, `userToProfileId`, or `createDevProfile`.
- `server.js` contains no `app.locals.profilesById` assignment.
- All five routes call `requireInternalToken` as the first middleware argument.
- Each route reads `bubble_user_id` from `req.query.bubble_user_id`.
- `profilePatchKeys` array and `devReferenceData` object are **left unchanged** — they are still used by other parts of the app.

---

## Prompt 3 — Update generateProgramV2.js

### Task
Open `api/src/routes/generateProgramV2.js`.

The route currently reads `dev_user_id` and `dev_client_profile_id` from `req.body`, then looks up
the profile from `req.app.locals.profilesById`. After Prompt 2, `app.locals.profilesById` no longer
exists. Replace the in-memory lookup with a direct Postgres read.

**Changes:**

1. Add import at top of file (with existing imports):
   ```js
   import { getProfileByBubbleUserId } from "../services/clientProfileService.js";
   ```

2. At the start of the route handler, rename the two body params:
   - `dev_user_id` → `bubble_user_id` (read as `s(req.body?.bubble_user_id)`)
   - `dev_client_profile_id` → remove entirely (derived from `bubble_user_id`)
   - Update validation errors accordingly:
     - `"Missing dev_user_id"` → `"Missing bubble_user_id"`
     - Remove the `dev_client_profile_id` required check

3. Replace the in-memory profile lookup block:
   ```js
   // REMOVE:
   const profilesById = req.app?.locals?.profilesById;
   const devProfile = profilesById?.get(dev_client_profile_id);
   if (!devProfile) {
     return res.status(404).json({ ok: false, code: "not_found", error: "Dev client profile not found" });
   }
   ```
   with:
   ```js
   const devProfile = await getProfileByBubbleUserId(bubble_user_id);
   if (!devProfile) {
     return res.status(404).json({ ok: false, code: "not_found", error: "Client profile not found for bubble_user_id" });
   }
   ```

4. In Phase 1a (upsert `app_user`), the existing SQL already uses `dev_user_id` as the
   `bubble_user_id` value. Update the variable reference:
   - Replace `[dev_user_id]` with `[bubble_user_id]` in the upsert params array.

5. In Phase 1b (upsert `client_profile`), the existing SQL already uses `dev_client_profile_id` as
   `bubble_client_profile_id`. Update to use `bubble_user_id`:
   - Replace the `dev_client_profile_id` variable with `bubble_user_id` in the upsert params.
   - The profile fields (`mappedFitnessRank`, `mappedEquipmentSlugs`, etc.) are already derived from
     `devProfile` — these do not change.

6. Do **not** change any other pipeline logic. The `devProfile` object returned by
   `getProfileByBubbleUserId` has the same camelCase shape as before (produced by `toApiShape`),
   so all downstream reads of `devProfile.fitnessLevel`, `devProfile.goals`, etc. continue to work.

### Verification
After the edit, confirm:
- No references to `dev_user_id` or `dev_client_profile_id` remain in `generateProgramV2.js`.
- No reference to `req.app.locals.profilesById` or `req.app?.locals?.profilesById` remains.
- The route requires `bubble_user_id` in the request body and returns `400` if missing.
- The profile is fetched from `getProfileByBubbleUserId(bubble_user_id)` and returns `404` if null.
- Phase 1a upserts `app_user` with `bubble_user_id`.
- Phase 1b upserts `client_profile` with `bubble_user_id` as `bubble_client_profile_id`.

---

## Post-Implementation Smoke Test

Run these in order after all three prompts are applied:

```bash
# 1. Apply the migration
docker compose run --rm flyway migrate

# 2. Restart the API
docker compose up -d --force-recreate api

# 3. Create / fetch a profile for a test user (replace TOKEN and KEY with local .env values)
BUID="test-user-$(date +%s)"

curl -s -X POST "http://localhost:3000/client-profiles?bubble_user_id=$BUID" \
  -H "x-engine-key: $ENGINE_KEY" | jq .

curl -s "http://localhost:3000/me?bubble_user_id=$BUID" \
  -H "x-engine-key: $ENGINE_KEY" | jq .

# 4. Patch a field
PROFILE_ID=$(curl -s "http://localhost:3000/me?bubble_user_id=$BUID" \
  -H "x-engine-key: $ENGINE_KEY" | jq -r .clientProfileId)

curl -s -X PATCH "http://localhost:3000/client-profiles/$PROFILE_ID" \
  -H "x-engine-key: $ENGINE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"fitnessLevel":"intermediate","goals":["strength"]}' | jq .

# 5. Force-recreate the container and confirm profile persists
docker compose up -d --force-recreate api
curl -s "http://localhost:3000/me?bubble_user_id=$BUID" \
  -H "x-engine-key: $ENGINE_KEY" | jq .
# clientProfileId must be non-null and profile fields must be intact
```

---

## What Is NOT in Scope

- Reference data (`devReferenceData` in server.js) — keep as-is; moving it to Postgres is a
  separate lower-priority task.
- The `profilePatchKeys` array — keep it; `patchProfile` in the service uses it as the allowed-keys
  list.
- Multi-profile per user support — the DB schema supports it (`client_profile.user_id FK`) but
  all routes assume a single profile per `bubble_user_id`. Do not add multi-profile logic.
- Auth overhaul — `requireInternalToken` is the correct guard for these routes (Bubble backend
  always forwards `ENGINE_KEY`). JWT/session auth is not in scope.
