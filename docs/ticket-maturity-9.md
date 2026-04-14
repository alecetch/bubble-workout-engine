# Ticket: Maturity 9 — Three Remaining Gaps

Current maturity: **8/10**. Three concrete gaps stand between here and 9. All are independent and can be shipped in any order.

---

## Gap 1 — Tier 2 mobile component tests

**Priority:** High — component and hook logic is the next largest untested surface  
**Spec:** `docs/codex-prompts-mobile-test-coverage.md` (Tier 2 section)

### Problem

The Tier 1 baseline tests cover pure-logic utilities and state functions. The next layer — React hooks, the `onboardingStore` `fromProfile` normalisation, and component-level rendering — has no automated coverage. The most impactful regressions from here will happen at these layers:

- `fromProfile` in `onboardingStore.ts` — runs on every boot and maps the server profile response to UI state. A field rename or API shape change silently produces wrong defaults with no test failure.
- Hook behaviour under loading/error states — `useUpdateClientProfile`, `useMe`, `useReferenceData` — drives the save/retry UX on every onboarding screen.
- `GuidelineLoadHint` rendering — the `guidelineLoad.value > 0` guard, unit formatting, and confidence colour are all untested.

### Scope

**Jest + `@testing-library/react-native` stack** — this is the prerequisite blocked by the npm peer-resolution issue in the prior Codex pass. Resolve that first.

Recommended test targets in priority order:

| Target | Test type | What to assert |
|---|---|---|
| `onboardingStore.ts` `fromProfile` | Unit (plain function call) | camelCase keys, snake_case keys, missing keys all map correctly; `anchorLifts` always resets to `[]`; `anchorLiftsSkipped` is restored from `anchor_lifts_skipped` |
| `resumeLogic.ts` integration with `fromProfile` | Unit | A raw server profile object round-trips correctly through `fromProfile` → `getResumeStep` |
| `GuidelineLoadHint.tsx` | Render test | Renders summary line with correct unit format; tapping expands detail; `set1Rule` and `reasoning` lines appear; does not render when `value = 0` |
| `SegmentCard.tsx` guidelineLoad guard | Render test | `GuidelineLoadHint` not rendered when `isLogged = true`; rendered when `isLogged = false` and `value > 0` |
| `validators.ts` (Jest flavour) | Unit | Same cases as the existing `node:test` suite — duplicate but proves Jest config is wired |

### Jest stack installation

The prior attempt failed on React 19 peer resolution. The fix: use `--legacy-peer-deps` for the initial install while the Expo SDK catches up.

```bash
npm install --save-dev jest jest-expo @testing-library/react-native @testing-library/jest-native --legacy-peer-deps
```

Restore `jest.config.js` as previously specified. Add `"test:jest": "jest"` to `package.json` scripts. The existing `node:test` suite (`npm test`) must continue to pass alongside Jest (`npm run test:jest`).

---

## Gap 2 — Sentry alert policies

**Priority:** Medium — Sentry captures errors passively but no one is notified  
**No code change required — this is a Sentry dashboard configuration task**

### Problem

Sentry is installed and `setupExpressErrorHandler` is wired. Errors are captured. But the default Sentry behaviour is email-on-first-occurrence per issue. There are no policies for:

- Alert when error rate on a route exceeds a threshold in a rolling window
- Alert when a new error type appears that has never been seen before
- Suppress noisy/expected errors (e.g. 401s from expired tokens)

Without policies, the team either gets too many alerts (every 401 pings email) or too few (a broken `/generate-plan-v2` route produces errors but they're grouped with prior occurrences and not re-alerted).

### What to configure in Sentry

1. **Issue alert — new issue:** Alert on any new issue the first time it occurs (default, confirm it's enabled).
2. **Metric alert — 5xx rate:** Alert when the count of `http.server_error` events exceeds 5 in any 5-minute window. Route: any. Threshold should reflect current baseline.
3. **Inbound data filter — 401/403:** Add a filter rule to drop `401 Unauthorized` and `403 Forbidden` events from `requireAuth` middleware — these are expected and will pollute the issue list.
4. **Environment separation:** Confirm `NODE_ENV` is passed to Sentry `init` so `production` and `development` events are separated. Current `server.js` should already pass this; verify in the Sentry dashboard.

No code changes are needed. Document the configured policies in a comment near `Sentry.init()` in `server.js` so future developers understand what is and isn't alerted.

---

## Gap 3 — Resolve `MODULE_TYPELESS_PACKAGE_JSON` warning

**Priority:** Low — warning only, no functional impact today, but indicates a packaging misconfiguration that will cause real issues if the mobile test suite grows  
**File:** `mobile/package.json`

### Problem

The `node:test` runner emits `MODULE_TYPELESS_PACKAGE_JSON` warnings when loading `.ts` files through the `.js` re-export shims. This occurs because `mobile/package.json` does not declare `"type": "module"`, so Node treats the files as CommonJS by default, and the ESM `import`/`export` syntax in the `.ts` files creates an ambiguity.

The warning is harmless now because `--experimental-specifier-resolution=node` resolves it at runtime. But it means:
1. Test output is noisy.
2. If Node tightens this behaviour in a future version, the test suite breaks silently.

### Fix

Add `"type": "module"` to `mobile/package.json`:

```json
{
  "type": "module",
  ...
}
```

Then verify `npm test` passes cleanly with no warnings. The Expo runtime itself is unaffected — Metro bundler does not read `package.json` `"type"` for the app bundle. Only the `node:test` runner (CI) is affected.

If adding `"type": "module"` causes any Jest compatibility issues when Gap 1 is implemented, the alternative is to add a `mobile/src/test-runner.package.json` with `"type": "module"` and configure the test runner to use it — but try the direct fix first.

---

## Summary

| Gap | Type | Effort |
|---|---|---|
| Tier 2 mobile component tests | Code + Jest stack install | Medium |
| Sentry alert policies | Dashboard configuration | Small |
| `MODULE_TYPELESS_PACKAGE_JSON` warning | One-line config change | Trivial |
