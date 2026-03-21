# Ticket: Rename bubble_user_id → user_key and remove bubble_client_profile_id

**Priority:** Low — no functional impact, purely naming cleanup
**Prerequisite:** All current Codex specs implemented and passing

---

## Background

`bubble_user_id` and `bubble_client_profile_id` were named when the app had a live API
integration with Bubble. That integration is fully deprecated. The names are now misleading —
new contributors have no frame of reference for what "bubble" means in this context.

---

## Part 1 — Rename `app_user.bubble_user_id` → `app_user.user_key`

**What it is:** The external user identity token sent by the mobile client on every request
(`req.body.bubble_user_id` / `req.query.bubble_user_id`). The concept is correct — it's the
stable external key the mobile app uses to identify a user — only the name is wrong.

**Files to update:**
- New Flyway migration: `ALTER TABLE app_user RENAME COLUMN bubble_user_id TO user_key;`
- `api/src/services/clientProfileService.js` — SQL queries referencing `bubble_user_id`
- `api/src/middleware/resolveUser.js` — SQL referencing `bubble_user_id`
- `api/server.js` — any `bubble_user_id` query/body param reads (keep the *parameter name*
  received from the mobile client — only the DB column changes)
- All test files referencing the column name
- Function names: `getProfileByBubbleUserId` → `getProfileByUserKey` (and `makeResolveBubbleUser`
  → `makeResolveUser`) — update call-sites

**Note:** The request parameter name (`bubble_user_id`) sent by the mobile app is a separate
concern — do not rename that until the mobile client is updated. Only the DB column changes
in this step.

---

## Part 2 — Remove `client_profile.bubble_client_profile_id`

**What it is:** A denormalized copy of `app_user.bubble_user_id` (= `user_key` after Part 1)
stored on the profile row. It was needed when Bubble held the profile ID separately; now it
duplicates the FK relationship already expressed by `client_profile.user_id → app_user.id`.

**Migration path:**
1. Update `patchProfile` to look up the profile via `user_id` JOIN (using the Postgres UUID
   or the `user_key` via JOIN) instead of `WHERE bubble_client_profile_id = $1`
2. Update `upsertProfile` to use `ON CONFLICT (user_id)` instead of `ON CONFLICT (bubble_client_profile_id)`
3. Update `toApiShape` — `id` and `userId` currently return `bubble_client_profile_id`; after
   removal they should return `app_user.user_key` (passed through from the JOIN query in
   `getProfileByUserKey`)
4. New Flyway migration: `ALTER TABLE client_profile DROP COLUMN bubble_client_profile_id;`
5. Update all tests

**Do Part 1 first** — Part 2 depends on the rename being settled.

---

## Verification (after both parts)

```bash
node --check api/src/services/clientProfileService.js
cd api && npm test -- --test-concurrency=1
# All tests pass

grep -rn "bubble_user_id\|bubble_client_profile_id" api/src/
# Expected: 0 results (only the incoming request param name may remain in server.js)
```
