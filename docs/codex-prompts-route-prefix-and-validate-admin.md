# Codex Spec: Route Prefix Completion + validate.js Admin Adoption

Two independent but related tidying tasks. Run them in order — they touch different files and
can be reviewed independently.

---

# Part A: Complete Route Prefix Migration

**Problem:** The history routes were moved to `/api/v1/history/*` in the last pass. The following
routes remain at root level with no `/api` prefix and no transition plan:

| Route | Description |
|-------|-------------|
| `GET /me` | Profile identity |
| `POST /client-profiles` | Create/upsert profile |
| `GET /client-profiles/:id` | Read profile |
| `PATCH /client-profiles/:id` | Update profile |
| `PATCH /users/me` | Link profile to user |
| `POST /generate-plan-v2` | Core generation endpoint |
| `GET /reference-data` | Onboarding reference lists |
| `GET /media-assets` | Media asset catalogue |
| `GET /equipment-items` | Equipment lookup |

Additionally, the admin observability router is mounted at the bizarre path
`/admin/api/observability/*` — the only admin route with a double-level prefix. It should join
the other API admin routes at `/api/admin/observability/*`.

**Strategy:** same dual-mount pattern used for history routes — add canonical `/api`-prefixed
mounts alongside existing root-level mounts, mark root-level mounts as deprecated.
`/generate-plan-v2` is the highest-risk endpoint (core Bubble integration); it gets the
same treatment — both paths live until Bubble confirms the client is updated.

---

## Prompt A1 — server.js dual-mount

### Context
Read `api/server.js` before starting, focusing on the existing route registration block
(lines ~236–511) and the admin observability mount specifically.

### Task

**Step 1: Mobile-facing routes (inline in server.js)**

For each of the nine routes defined directly in `server.js`, add a canonical `/api`-prefixed
duplicate immediately above the existing registration, and mark the original as deprecated:

```js
// Canonical (new)
app.get("/api/me", requireInternalToken, async (req, res) => { /* same handler */ });
// DEPRECATED — remove after Bubble client updates to /api/me
app.get("/me", requireInternalToken, async (req, res) => { /* existing handler unchanged */ });
```

Apply this pattern to all nine routes:
- `GET /api/me` + deprecated `GET /me`
- `POST /api/client-profiles` + deprecated `POST /client-profiles`
- `GET /api/client-profiles/:id` + deprecated `GET /client-profiles/:id`
- `PATCH /api/client-profiles/:id` + deprecated `PATCH /client-profiles/:id`
- `PATCH /api/users/me` + deprecated `PATCH /users/me`
- `GET /api/reference-data` + deprecated `GET /reference-data`
- `GET /api/media-assets` + deprecated `GET /media-assets`
- `GET /api/equipment-items` + deprecated `GET /equipment-items`

For `POST /generate-plan-v2` (router-mounted, not inline):
```js
// Canonical (new)
app.use("/api", generateProgramV2Router);  // → POST /api/generate-plan-v2
// DEPRECATED — remove after Bubble client updates
app.use(generateProgramV2Router);          // → POST /generate-plan-v2 (existing)
```

**Step 2: Admin observability prefix fix**

Find:
```js
app.use("/admin/api/observability", ...adminOnly, adminObservabilityRouter);
```
Replace with:
```js
// Canonical — /api/admin matches all other API admin routes
app.use("/api/admin/observability", ...adminOnly, adminObservabilityRouter);
// DEPRECATED backward-compat alias
app.use("/admin/api/observability", ...adminOnly, adminObservabilityRouter);
```

**Step 3: Update the admin HTML page that calls the observability API**

Search for `/admin/api/observability` URL references in `api/admin/observability.html`.
Update each fetch URL from `/admin/api/observability/...` to `/api/admin/observability/...`.
The deprecated mount keeps the old URL working for any cached browser tabs during transition.

### Verification for A1
```bash
node --check api/server.js
cd api && npm test -- --test-concurrency=1

# Confirm both canonical and deprecated paths are live:
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/me?bubble_user_id=x" \
  -H "x-engine-key: $ENGINE_KEY"
# Expected: 400 or 401 (not 404)

curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/me?bubble_user_id=x" \
  -H "x-engine-key: $ENGINE_KEY"
# Expected: 400 or 401 (not 404)

curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/generate-plan-v2" \
  -X POST -H "x-engine-key: $ENGINE_KEY" -H "Content-Type: application/json" -d "{}"
# Expected: 400 (validation error) not 404

curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/admin/observability/summary" \
  -H "x-engine-key: $ENGINE_KEY"
# Expected: 200 or 401 (not 404)
```

---

# Part B: validate.js Adoption — Admin Route Files

**Problem:** Four admin route files still have local re-implementations of string/int helpers
that `validate.js` already provides. This is the agreed follow-up from the six-file migration.

**Scope:** Replace only the primitives that map directly to validate.js helpers. Complex
admin-specific validators (`isPlainObject`, `asArray`, `asTextArray`, `asJsonObject`,
`flagIsTrue`, `asNullableEnum`, `toIsoDateUtc`, `parsePriority`, `parseJsonObjectInput`,
`parseTextPoolInput`) do NOT have validate.js equivalents — leave them untouched.

---

## Prompt B1 — adminObservability.js

File: `api/src/routes/adminObservability.js`

1. Add import:
   ```js
   import { safeString, clampInt as _clampInt } from "../utils/validate.js";
   ```
   (Use `_clampInt` alias to avoid shadowing the local `clampInt` during the transition.)

2. Replace the local helpers with imports:
   - Remove `function toText(value) { ... }` — replace all `toText(...)` calls with `safeString(...)`
   - Remove the local `function toInt(value, fallback) { ... }`
   - Remove the local `function clampInt(value, fallback, min, max) { ... }` — replace all
     `clampInt(...)` calls with `_clampInt(value, { defaultValue: fallback, min, max })`
     then rename `_clampInt` to `clampInt` in the import once the local is removed

3. Keep `asNullableEnum` and `toIsoDateUtc` — they have no validate.js equivalent.

4. Note on `clampInt` signature difference:
   - Local: `clampInt(value, fallback, min, max)`
   - validate.js: `clampInt(value, { defaultValue, min, max })`
   - Update all call-sites to use the named-option form:
     ```js
     // Before:
     clampInt(req.query?.days, 30, 1, 365)
     // After:
     clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 })
     ```

### Verification for B1
```bash
node --check api/src/routes/adminObservability.js
grep -n "function toText\|function toInt\|function clampInt" api/src/routes/adminObservability.js
# Expected: 0 results
```

---

## Prompt B2 — adminNarration.js

File: `api/src/routes/adminNarration.js`

1. Add import:
   ```js
   import { safeString } from "../utils/validate.js";
   ```

2. Remove `function asTrimmedString(value) { ... }` — replace all `asTrimmedString(...)` calls
   with `safeString(...)`.

3. Update `toNullableText`:
   ```js
   function toNullableText(value) {
     const text = safeString(value);
     return text || null;
   }
   ```
   (Remove `asTrimmedString` from its body — replace with `safeString`.)

4. Keep `parsePriority`, `parseJsonObjectInput`, `parseTextPoolInput`, `isPlainObject`,
   `validateTemplatePayload` — these are domain-specific and have no validate.js equivalents.

### Verification for B2
```bash
node --check api/src/routes/adminNarration.js
grep -n "function asTrimmedString" api/src/routes/adminNarration.js
# Expected: 0 results
```

---

## Prompt B3 — adminConfigs.js + adminCoverage.js

### adminConfigs.js

File: `api/src/routes/adminConfigs.js`

1. Add import:
   ```js
   import { safeString, requireNonEmpty, RequestValidationError } from "../utils/validate.js";
   ```

2. Remove `function nonEmptyString(value) { ... }`.

3. Replace the validation check in the `POST /configs` handler:
   ```js
   // Before:
   if (!nonEmptyString(source_key) || !nonEmptyString(new_key)) {
     return res.status(400).json({ ok: false, error: "source_key and new_key are required" });
   }

   // After:
   try {
     requireNonEmpty(source_key, "source_key");
     requireNonEmpty(new_key, "new_key");
   } catch (err) {
     if (err instanceof RequestValidationError) {
       return res.status(400).json({ ok: false, error: err.message });
     }
     throw err;
   }
   ```

4. Replace `source_key.trim()` and `new_key.trim()` with `safeString(source_key)` and
   `safeString(new_key)` in the query params array.

5. Keep `isPlainObject` — it has no validate.js equivalent.

### adminCoverage.js

File: `api/src/routes/adminCoverage.js`

1. Add import:
   ```js
   import { safeString } from "../utils/validate.js";
   ```

2. Remove `function asText(value) { ... }` — replace all `asText(...)` calls with `safeString(...)`.

3. Update `asTextArray` to use `safeString`:
   ```js
   function asTextArray(value) {
     return asArray(value).map((item) => safeString(item)).filter(Boolean);
   }
   ```

4. Keep `asArray`, `asObject`, `asJsonObject`, `flagIsTrue`, `deriveEquipmentProfile`,
   `resolveSlotVariant` — all are domain-specific with no validate.js equivalent.

### Verification for B3
```bash
node --check api/src/routes/adminConfigs.js
node --check api/src/routes/adminCoverage.js
grep -n "function nonEmptyString\|function asText\b" \
  api/src/routes/adminConfigs.js \
  api/src/routes/adminCoverage.js
# Expected: 0 results
```

---

## Final Verification (after all prompts)

```bash
cd api && npm test -- --test-concurrency=1
# All tests must pass

grep -rn "function asText\b\|function asTrimmedString\|function nonEmptyString\|function toText\b\|function toInt\b" \
  api/src/routes/adminObservability.js \
  api/src/routes/adminNarration.js \
  api/src/routes/adminConfigs.js \
  api/src/routes/adminCoverage.js
# Expected: 0 results
```

---

## Out of Scope

- The local `clampInt` in `adminObservability.js` (the one in the route file) is the only
  true duplicate of `validate.js`'s `clampInt` — it is replaced. The local `asNullableEnum`
  does not have a validate.js equivalent and stays.
- `parsePriority` in `adminNarration.js` returns `null` for invalid input — `clampInt` always
  returns a number. They are not equivalent; `parsePriority` stays.
- The `/admin-ui` static file serving, `/admin/coverage`, `/admin/exercises`, etc. HTML page
  routes are intentionally at `/admin/*` with no `/api` prefix — these are browser pages, not
  API endpoints, and are excluded from the migration.
