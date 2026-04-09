# Ticket: Maturity Gap Close

Three concrete gaps identified in the April 2026 maturity review. All are small, low-risk, and can be shipped independently.

---

## Gap 1 — Narration priority NULL collision bug

**Priority:** High — silent data bug in production  
**File:** `api/engine/steps/05_applyNarration.js` line 176

### Problem

`normalizeTemplates` calls `toInt(r.priority, 1)` to coerce `NULL` priorities. This means a template with no priority set is treated identically to one with explicit `priority = 1`. In the tie-breaking sort (`ORDER BY priority ASC`) these collide, producing non-deterministic template selection and making it impossible to insert a template at the explicit top slot without racing with all the NULL-priority rows.

### Fix

Change the default from `1` to `9999`:

```js
// before
priority: toInt(r.priority, 1),

// after
priority: toInt(r.priority, 9999),
```

This pushes unranked templates to the bottom of the sort, which is the intended behaviour — explicit priority values control ordering, everything unranked falls through.

### Verification

The existing `narrationTemplates.test.js` suite should continue to pass. Add one case: a template with `priority: null` must sort after a template with `priority: 1`.

---

## Gap 2 — Remove debug `console.log` from `OnboardingEntry`

**Priority:** Medium — noise in production logs, minor performance overhead on every render  
**File:** `mobile/src/screens/onboarding/OnboardingEntry.tsx`

### Problem

The boot-hang investigation left `[boot:render]`, `[boot:bootstrap-fn]`, `[boot:hydrate-effect]`, and `[boot:navigate]` console logs in place. They fire on every render cycle of `OnboardingEntry` and on every navigation event. The in-code comment already marks them for removal: `// DEBUG: remove once boot hang is resolved`.

### Fix

Delete all `console.log(...)` calls in `OnboardingEntry.tsx` (lines ~54–155). No logic changes — only the log statements.

### Verification

Open the app, complete onboarding boot, confirm the Metro/device console is clean of `[boot:*]` lines.

---

## Gap 3 — Mobile test coverage baseline

**Priority:** Medium — risk grows as mobile complexity increases  
**Current state:** 1 test file (`segmentCardLogic.test.ts`) covering ~1% of the mobile surface

### Problem

The mobile app now has non-trivial state logic that is entirely untested:

- `resumeLogic.ts` — routing decisions that determine which screen a user lands on after re-opening the app. A regression here silently drops users into the wrong step or skips the new Step 2b entirely for non-beginners.
- `validators.ts` — step validation rules. Incorrect validation lets users proceed with bad state or blocks valid users.
- `onboardingStore.ts` — `fromProfile` normalisation. This runs on every boot and is the source of truth for what the server profile maps to in UI state.

The codex spec for this already exists at `docs/codex-prompts-mobile-test-coverage.md`.

### Scope (minimum viable baseline)

| File | What to test |
|---|---|
| `resumeLogic.ts` | Each branch: step1 missing → returns `1`; step2 missing → returns `2`; non-beginner with no anchors → returns `"2b"`; beginner with no anchors → skips `"2b"`, returns `3`; all complete → `"done"` |
| `validators.ts` | `validateStep(1/2/3)` happy path and each required-field error; `validateAll` flags correct step |
| `onboardingStore.ts` `fromProfile` | camelCase keys, snake_case keys, missing keys, `anchorLiftsSkipped` restoration, `anchorLifts` always resets to `[]` |

Use Jest (already configured in the mobile project). No network or navigation mocks required — all three are pure functions or functions operating on plain objects.

### Out of scope

Component/screen tests, navigation integration, React Query mocking — these are tracked separately in `docs/codex-prompts-mobile-test-coverage.md`.

---

## Already confirmed closed (not in scope here)

The review also flagged these — all are resolved:

| Gap | Status |
|---|---|
| CI runs integration tests against real Postgres | Done — `.github/workflows/ci.yml` with Postgres service container and Flyway |
| Sentry error tracking | Done — `@sentry/node` installed, `Sentry.setupExpressErrorHandler` wired in `server.js` |
| Security middleware tests | Done — `auth.test.js` covers `requireInternalToken` and `requireTrustedAdminOrigin`; `requestLogger.test.js` and `resolveUser.test.js` present |
