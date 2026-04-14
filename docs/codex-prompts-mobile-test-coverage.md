# Codex Spec: Mobile Test Coverage

**Target:** `mobile/` — React Native (Expo) app
**Goal:** Add comprehensive test coverage across three tiers: pure logic unit tests, component tests, and E2E flows.

---

## Pre-flight: what already exists

Before writing anything, read:

- `mobile/src/components/program/segmentCardLogic.test.ts` — the one existing test file. It uses `node:test` and `node:assert/strict`. All Tier 1 tests follow this exact pattern.
- `mobile/src/components/program/segmentCardLogic.ts` — the module it tests. Same import style to follow.
- `mobile/package.json` — no test script yet; you will add one.
- `mobile/tsconfig.json` — `"strict": true` is already set. Do not change it.

---

## Architecture decision: three test tiers

### Tier 1 — Pure logic tests (`node:test`, no new deps)

Tests for modules with zero React Native or Expo imports. Run identically to the backend test suite. These can be added immediately with no new dependencies.

Runner: `node --test`

Files to create and modules to test are listed in detail in Section A below.

### Tier 2 — Component and hook tests (Jest + React Testing Library)

Tests for React components, screens, and hooks. Requires new dev dependencies. Configuration is fully specified in Section B.

Runner: `jest`

### Tier 3 — E2E flows (Maestro)

Tests for the full app running on a simulator or device. Maestro is a CLI tool — no npm dependency. YAML flow files live in `.maestro/` at the repo root. See Section C.

---

## Package.json changes

Add the following to `mobile/package.json`. Read the file before editing.

### `scripts`

```json
{
  "test": "node --test src/**/*.test.ts",
  "test:unit": "node --test src/**/*.test.ts",
  "test:jest": "jest",
  "test:all": "node --test src/**/*.test.ts && jest"
}
```

### New `devDependencies`

Add these for Tier 2 only:

```json
{
  "@testing-library/react-native": "^12.5.1",
  "@testing-library/jest-native": "^5.4.3",
  "jest": "^29.7.0",
  "jest-expo": "~54.0.0",
  "babel-jest": "^29.7.0",
  "@types/jest": "^29.5.14"
}
```

---

## Jest configuration

Create `mobile/jest.config.js`:

```js
module.exports = {
  preset: "jest-expo",
  setupFilesAfterFramework: [],
  setupFilesAfterFramework: ["@testing-library/jest-native/extend-expect"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)",
  ],
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)", "**/*.jest.test.[jt]s?(x)"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
};
```

Note: Tier 1 files use `.test.ts` (no `.jest.` prefix). Jest only picks up files matching `*.jest.test.*` to avoid double-running Tier 1 files. Tier 2 files use the `.jest.test.tsx` suffix convention.

---

## Section A: Tier 1 — Pure logic unit tests

All files use `import test from "node:test"` and `import assert from "node:assert/strict"`. No React, no Expo, no mocking libraries.

Follow the structure of `segmentCardLogic.test.ts` exactly.

---

### A1 — `src/utils/numbers.test.ts`

Tests for `mobile/src/utils/numbers.ts` which exports `parseNumberOrNull` and `clamp`.

Required cases:

**`parseNumberOrNull`**
- `"42"` → `42`
- `"3.14"` → `3.14`
- `""` → `null`
- `"  "` → `null`
- `"abc"` → `null`
- `"0"` → `0`
- `"-5"` → `-5`
- `null` coerced as string → `null`

**`clamp`**
- value within range → unchanged
- value below min → min
- value above max → max
- value equals min → min
- value equals max → max

---

### A2 — `src/utils/normalizeText.test.ts`

Tests for `mobile/src/utils/normalizeText.ts` which exports `normalizeText`.

Required cases:
- Leading/trailing whitespace stripped
- `\r\n` and `\r` normalized to `\n`
- Three or more consecutive newlines collapsed to two
- Two newlines preserved as-is
- Empty string returns empty string
- Already-normalized text is unchanged

---

### A3 — `src/utils/text.test.ts`

Tests for `mobile/src/utils/text.ts` which exports `toTitleCase`.

Required cases:
- `"hello world"` → `"Hello World"`
- `"hello_world"` → `"Hello World"`
- `"hello-world"` → `"Hello World"`
- `"UPPER CASE"` → `"Upper Case"`
- `""` → `""`
- Single word → capitalized
- Already title case → unchanged

---

### A4 — `src/screens/onboarding/toggleInjuryFlag.test.ts`

Tests for `mobile/src/screens/onboarding/toggleInjuryFlag.ts`.

The function signature: `toggleInjuryFlag(current: string[], clicked: string, noneSlug: string): string[]`

`noneSlug` represents "No known issues" — clicking it clears all others; it is mutually exclusive with specific flags.

Required cases:
- Adding a new flag when none are selected
- Adding a second flag alongside an existing one
- Removing a flag that is already selected
- Clicking the noneSlug when it is not selected → `[noneSlug]`
- Clicking the noneSlug when it is already selected → `[]`
- Adding a specific flag when noneSlug is selected → removes noneSlug, adds the flag
- Clicking noneSlug when other flags are selected → replaces all with `[noneSlug]`
- Empty string as `clicked` → returns current unchanged
- Duplicate entries in `current` are deduplicated in output

---

### A5 — `src/state/onboarding/validators.test.ts`

Tests for `mobile/src/state/onboarding/validators.ts` — `validateStep` and `validateAll`.

Import the `ERROR_MESSAGES` constant and assert against specific message strings to avoid magic strings in tests.

**`validateStep(1, draft)`**
- Empty goals → `errors.goals` = `ERROR_MESSAGES.goalsRequired`
- Missing fitnessLevel → `errors.fitnessLevel` = `ERROR_MESSAGES.fitnessLevelRequired`
- Empty injuryFlags → `errors.injuryFlags` = `ERROR_MESSAGES.injuryFlagsRequired`
- All valid step 1 draft → `isValid: true`, empty errors
- One goal but no fitnessLevel → only `fitnessLevel` error present

**`validateStep(2, draft)`**
- Missing `equipmentPresetCode` → `errors.equipmentPreset` error
- Empty `selectedEquipmentCodes` → `errors.equipmentItemCodes` error
- Both present → `isValid: true`

**`validateStep("2b", draft)`**
- Always returns `isValid: true` (step 2b is optional)

**`validateStep(3, draft)`**
- Missing `preferredDays` → error
- Missing `minutesPerSession` → error
- `heightCm: 99` (below 100) → `ERROR_MESSAGES.heightRange`
- `heightCm: 251` (above 250) → `ERROR_MESSAGES.heightRange`
- `heightCm: 100` (at boundary) → no error
- `heightCm: 250` (at boundary) → no error
- `weightKg: 29` → `ERROR_MESSAGES.weightRange`
- `weightKg: 301` → `ERROR_MESSAGES.weightRange`
- Missing `sex` → error
- `ageRange: "Under 18"` → `ERROR_MESSAGES.ageRangeUnder18`
- All valid step 3 draft → `isValid: true`

**`validateAll`**
- All steps valid → `{ step1Valid: true, step2Valid: true, step3Valid: true }`
- Invalid step 1 → `step1Valid: false` while others may be true

---

### A6 — `src/state/onboarding/resumeLogic.test.ts`

Tests for `mobile/src/state/onboarding/resumeLogic.ts` — `getResumeStep`.

A valid fully-complete draft is defined as a helper at the top of the test file.

The `isNonBeginner` logic: if `fitnessLevel` is `"Intermediate"`, `"Advanced"`, or `"Elite"`, the athlete sees step 2b unless they skipped it or have anchor lifts.

Required cases:
- Draft with no goals → returns `1`
- Step 1 valid, step 2 invalid → returns `2`
- Non-beginner with empty anchor lifts and `anchorLiftsSkipped: false` → returns `"2b"`
- Non-beginner with `anchorLiftsSkipped: true` → skips `"2b"`, returns `3` if step 3 invalid
- Non-beginner with at least one anchor lift → skips `"2b"`
- Beginner (`fitnessLevel: "Beginner"`) always skips step `"2b"`
- All steps valid (non-beginner, skipped 2b) → returns `"done"`
- All steps valid (non-beginner, has anchor lifts) → returns `"done"`
- Step 3 invalid → returns `3`

---

### A7 — `src/utils/localWorkoutLog.test.ts`

Tests for `mobile/src/utils/localWorkoutLog.ts`.

This module uses an in-memory fallback store when `require` is not available. In `node:test`, `globalThis.require` is not defined, so all functions use the in-memory store automatically. No mocking needed.

**Important:** The in-memory store is a module-level `Map`. Reset state between tests by re-importing the module or calling functions with unique IDs per test to avoid cross-test contamination. Use unique `programDayId` values per test.

Required cases:

**`getSegmentLog`**
- Returns `null` when nothing has been written
- Returns the entry after `setSegmentLog` is called

**`setSegmentLog`**
- Persists load, rounds, notes
- `updatedAt` is an ISO string
- Writing twice overwrites the first entry

**`getWorkoutComplete` / `setWorkoutComplete`**
- Defaults to `false` before any write
- `setWorkoutComplete(id, true)` → `getWorkoutComplete(id)` returns `true`
- `setWorkoutComplete(id, false)` → `getWorkoutComplete(id)` returns `false`

**`hasAnySegmentLog`**
- Returns `false` when no segments are logged
- Returns `true` after logging one of the segment IDs
- Empty `segmentIds` array → returns `false`

**`getDayStatus`**
- Returns `"scheduled"` with no data
- Returns `"started"` after calling `setSegmentLog`
- Returns `"complete"` after `setWorkoutComplete(id, true)`

---

## Section B: Tier 2 — Component and hook tests (Jest)

These tests use `@testing-library/react-native` and the `.jest.test.tsx` file suffix.

Create a shared test helper at `mobile/src/__test-utils__/renderWithProviders.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}
```

---

### B1 — `src/api/client.jest.test.ts`

Tests for `mobile/src/api/client.ts` pure logic — **not** a React component test, but uses Jest for easier `fetch` mocking.

Mock `fetch` globally using `jest.fn()`. Do not mock `tokenStorage`.

**`ApiError`**
- `new ApiError(404, "Not found")` has `status: 404`, `message: "Not found"`
- `instanceof ApiError` is true
- `instanceof Error` is true

**`apiFetch` (via mocked fetch)**
- 200 response with JSON body → returns parsed body
- 404 response → throws `ApiError` with status 404
- Error message extracted from `{ error: "..." }` in response body
- Non-JSON response body → error message is fallback

**`authenticatedFetch` (mock `getAccessToken`)**
- No access token → throws `ApiError(401, ..., { code: "session_expired" })`
- Valid token → injects `Authorization: Bearer <token>` header
- 401 response with `code: "token_expired"` → attempts refresh; on refresh success retries original request
- 401 response with `code: "token_expired"` → on refresh failure throws `ApiError(401, ...)` with `session_expired`

Mock `getAccessToken` and `getRefreshToken` from `./tokenStorage` using `jest.mock`.

---

### B2 — `src/state/onboarding/onboardingStore.jest.test.ts`

Tests for the Zustand store directly — no React render needed. Import the store and interact with `getState()` and the action functions.

**Initial state**
- `userId` is `null`
- `draft` has empty goals, no fitnessLevel, etc.
- `isSaving` is `false`

**`setIdentity`**
- Sets `userId` and `clientProfileId`

**`setDraft` (partial update)**
- Merges into existing draft without overwriting other fields

**`applyInjuryExclusivity`**
- When `NO_KNOWN_ISSUES` is in the next array, returns only `[NO_KNOWN_ISSUES]`
- When specific flags are present alongside `NO_KNOWN_ISSUES`, removes `NO_KNOWN_ISSUES`
- Empty array returns empty array

**`resetFromProfile`**
- Given a profile-like object, resets draft fields correctly
- Fields absent from the profile object do not throw; they fall back to defaults

---

### B3 — `src/components/onboarding/ErrorBanner.jest.test.tsx`

Simple render test for `mobile/src/components/onboarding/ErrorBanner.tsx`.

- With no message prop: component renders nothing or returns null (query should return `null`)
- With a message string: renders the message text
- Message is accessible via `getByText`

---

### B4 — `src/components/onboarding/Pill.jest.test.tsx`

Tests for the `Pill` component.

- Renders the label text
- `onPress` callback called when pressed (use `fireEvent.press`)
- `selected` prop visually reflected — test via `accessibilityState` or a `testID` if available; if neither is present, test that `onPress` fires and trust the visual output to manual review

---

### B5 — `src/screens/auth/LoginScreen.jest.test.tsx`

This is the highest-risk screen for regressions. Mock the API calls and navigation.

Mock:
- `../../api/authApi` — mock `login` to resolve with `{ access_token: "tok", refresh_token: "ref" }`
- `../../api/tokenStorage` — mock `saveTokens` as a no-op jest.fn
- `@react-navigation/native-stack` — mock `useNavigation` returning `{ navigate: jest.fn(), reset: jest.fn() }`
- `../../state/session/sessionStore` — mock `useSessionStore` returning `{ setSession: jest.fn() }`

Required cases:
- Screen renders email and password inputs
- Submit with empty fields → shows validation feedback (error banner or input error)
- Submit with valid email + password → calls `login` with correct args
- On successful login → `saveTokens` is called; `setSession` is called; navigation reset fires
- On failed login (mock throws `ApiError(401, "Invalid credentials")`) → error message shown on screen

---

### B6 — `src/screens/onboarding/Step1GoalsScreen.jest.test.tsx`

Mock:
- `../../api/hooks` — mock `useReferenceData` returning a fixed reference data object with known goal types
- `@react-navigation/native-stack` — mock `useNavigation`
- `../../state/onboarding/onboardingStore` — use a real Zustand store instance or mock `useOnboardingStore`

Required cases:
- Renders goal pills from reference data
- Tapping a goal pill calls `setDraft` with the goal added
- Continue button pressed with no goals selected → validation error shown
- Continue button pressed with a valid selection → `navigate` called

---

### B7 — `src/screens/program/ProgramDayScreen.jest.test.tsx`

Mock `useProgramDayFull` hook to return a fixed day with two segments and known exercises.

Required cases:
- Day title renders
- Segment cards render for each segment
- Log button is visible for non-warmup segments
- Warmup segment shows no log button
- `progression_recommendation` with `outcome: "increase_load"` and `recommended_load_kg: 82.5` renders the load hint (either as text or via `testID="progression-hint"`)

---

## Section C: Tier 3 — Maestro E2E flows

Maestro is a standalone CLI tool, not an npm package. Install it once per machine:

```sh
curl -Ls "https://get.maestro.mobile.dev" | bash
```

E2E flow files live in `.maestro/` at the **repo root** (not inside `mobile/`).

All flows target a running Expo development build on iOS Simulator or Android emulator. They are **not run in CI automatically** — they are development verification tools for major flows.

Create the following files.

---

### C1 — `.maestro/flows/01_auth_register.yaml`

Full registration flow: app launch → register screen → fill form → submit → land on onboarding.

```yaml
appId: com.formai.workout  # replace with actual bundle ID
---
- launchApp:
    clearState: true

- assertVisible: "Create account"

- tapOn:
    id: "input-email"
- inputText: "test+${RANDOM_STRING}@example.com"

- tapOn:
    id: "input-password"
- inputText: "TestPass123!"

- tapOn:
    id: "input-confirm-password"
- inputText: "TestPass123!"

- tapOn:
    text: "Create account"

- assertVisible: "What are your goals?"
```

---

### C2 — `.maestro/flows/02_onboarding_full.yaml`

Full onboarding flow from goals to program generation.

Precondition: must run after `01_auth_register.yaml` or the app must already be logged in at the onboarding entry.

```yaml
appId: com.formai.workout
---
# Step 1 — Goals
- tapOn:
    text: "Hypertrophy"
- tapOn:
    text: "Intermediate"
- tapOn:
    text: "No known issues"
- tapOn:
    text: "Continue"

# Step 2 — Equipment
- tapOn:
    text: "Commercial Gym"
- tapOn:
    text: "Continue"

# Step 3 — Schedule
- tapOn:
    text: "Mon"
- tapOn:
    text: "Wed"
- tapOn:
    text: "Fri"
- tapOn:
    text: "50 minutes"
- tapOn:
    id: "input-height"
- inputText: "178"
- tapOn:
    id: "input-weight"
- inputText: "80"
- tapOn:
    text: "Male"
- tapOn:
    text: "25-34"
- tapOn:
    text: "Generate my program"

# Should land on program dashboard
- assertVisible: "Week 1"
```

---

### C3 — `.maestro/flows/03_workout_log.yaml`

Open a program day, log a segment, mark day complete.

Precondition: a program must exist for the user. Run after `02_onboarding_full.yaml`.

```yaml
appId: com.formai.workout
---
- launchApp

# Navigate to today's workout
- tapOn:
    text: "Today"

# Open the first available day
- tapOn:
    id: "day-card-0"

- assertVisible: "Log"

# Log the first segment
- tapOn:
    text: "Log"
    index: 0

# Enter reps and weight for each set
- tapOn:
    id: "set-reps-0"
- inputText: "8"
- tapOn:
    id: "set-weight-0"
- inputText: "80"

- tapOn:
    text: "Save"

# Complete the day
- tapOn:
    text: "Complete workout"
- tapOn:
    text: "Confirm"

- assertVisible: "Well done"
```

---

### C4 — `.maestro/flows/04_auth_login_logout.yaml`

Login → navigate to settings → logout → confirm back at login screen.

```yaml
appId: com.formai.workout
---
- launchApp:
    clearState: true

- assertVisible: "Sign in"

- tapOn:
    id: "input-email"
- inputText: "existing@example.com"

- tapOn:
    id: "input-password"
- inputText: "TestPass123!"

- tapOn:
    text: "Sign in"

- assertVisible: "Today"

- tapOn:
    text: "Settings"

- tapOn:
    text: "Log out"

- assertVisible: "Sign in"
```

---

### C5 — `.maestro/flows/05_password_reset.yaml`

Forgot password → receive OTP → reset → sign in with new password.

Note: this flow requires a real email or a test account where the OTP can be intercepted. Mark this flow as manual-only in the header comment.

```yaml
# MANUAL ONLY — requires access to the test account inbox.
# Not run in automated suites.
appId: com.formai.workout
---
- launchApp:
    clearState: true

- tapOn:
    text: "Forgot password"

- tapOn:
    id: "input-email"
- inputText: "reset-test@example.com"

- tapOn:
    text: "Send reset code"

- assertVisible: "Enter your code"

# Code entered manually after checking email
```

---

## Section D: CI integration

### `package.json` test script (Tier 1 only in CI)

The `test` script in `mobile/package.json` runs only Tier 1 tests (no React Native renderer needed, no simulator needed):

```json
"test": "node --test 'src/**/*.test.ts'"
```

### Add mobile Tier 1 to the existing CI workflow

Edit `.github/workflows/ci.yml`. After the API test step, add:

```yaml
- name: Install mobile dependencies
  working-directory: mobile
  run: npm ci

- name: Run mobile Tier 1 unit tests
  working-directory: mobile
  run: npm test
```

This adds zero new services or simulators to CI. All Tier 1 tests are pure Node — they pass in the same environment as the API tests.

### Tier 2 (Jest) — not added to CI yet

Tier 2 tests require a configured test environment with Babel and Expo preset. Add to CI in a follow-up once Tier 1 is green and the Jest configuration is stable locally.

### Tier 3 (Maestro) — not added to CI

Maestro E2E flows run locally against a simulator. They are developer verification tools. CI E2E with Maestro (using GitHub Actions Maestro cloud or a self-hosted runner with a simulator) is a later step.

---

## Section E: Implementation order

Implement in this order. Verify each phase passes before moving to the next.

1. **Phase 1:** Add Tier 1 test files A1–A7. Add `test` script to `package.json`. Run `npm test` from `mobile/` — all should pass.

2. **Phase 2:** Add Jest config and Tier 2 dev dependencies. Run `npm run test:jest` locally. Fix any Babel or transform issues before writing test content.

3. **Phase 3:** Write Tier 2 test files B1–B7 one at a time. Confirm each passes with `npm run test:jest -- --testPathPattern=<filename>` before moving on.

4. **Phase 4:** Create `.maestro/` directory and flow files C1–C5. Verify C1 and C2 manually against a running simulator. Do not add Maestro to CI at this stage.

5. **Phase 5:** Update `.github/workflows/ci.yml` to add mobile Tier 1 tests.

---

## Section F: Explicit non-goals

Do not implement:

- Tests for theme files (`colors.ts`, `spacing.ts`, `typography.ts`, `components.ts`) — pure constants with no logic.
- Tests for navigation stack files (`AppTabs.tsx`, `AuthNavigator.tsx`, etc.) — these are wiring files with no independent logic.
- Snapshot tests — avoid them. They break on every minor UI change and add no behavioral signal.
- Tests that require a real API server — all tests mock network calls. The E2E Maestro flows are the only tests that hit a real backend, and they are manual-only.

---

## Known issues to be aware of while implementing

### `localWorkoutLog.ts` — in-memory store is module-level

The `inMemoryStore = new Map()` at module level persists across tests within a single `node:test` run. Use unique `programDayId` values in each test (e.g. `"day-a7-1"`, `"day-a7-2"`) to avoid contamination. Do not attempt to reset the module between tests.

### `client.ts` — `console.log` calls in production code

`requestJson` has several `console.log` calls. In tests these will emit to stdout. Suppress them in Jest tests using `jest.spyOn(console, "log").mockImplementation(() => {})` in a `beforeEach`.

### Step 2b (`BaselineLoadsScreen`) is in-flight

`Step2bBaselineLoadsScreen.tsx` is on a feature branch not yet merged to main. Do not write Tier 2 tests for it yet. The `resumeLogic.test.ts` (Tier 1) should test the step `"2b"` routing logic, which is stable. The screen component tests come after the branch is merged.

### Maestro `appId`

Replace `com.formai.workout` with the actual bundle ID from `mobile/app.json` or `mobile/eas.json` before running Maestro flows. Read these files to confirm the correct value.
