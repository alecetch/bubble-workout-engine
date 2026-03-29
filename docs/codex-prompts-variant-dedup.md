# Codex Spec: Same-Day Variant Deduplication

**Why:** The selector can place equipment variants of the same exercise in the same workout
day — e.g. "Dumbbell Bulgarian Split Squat" and "Kettlebell Bulgarian Split Squat" in slots
B:lunge and C:lunge_accessory. These are functionally the same movement; pairing them gives
the athlete no meaningful variety. The fix normalises each exercise name to a
**canonical name** (strip equipment prefix words, slugify) and uses it as a soft avoidance
signal — the same pattern already used for `usedSw2Today`.

The canonical-name avoidance is **soft, not hard**: the selector first attempts to find an
exercise whose canonical name has not been used today; if none qualifies it falls through to
the existing `exDup` fallback and allows the repeat. Small catalogs or tight slot constraints
are therefore never broken.

---

## Context for Codex

Read before starting:

- `api/engine/exerciseSelector.js` — `buildCatalogJsonFromBubble`, `buildIndex`, `pickBest`,
  `pickWithFallback`, `attemptAvoidRepeatSw2` (all in scope for this change)
- `api/engine/selectorStrategies.js` — `bestMatchByMovement` constructs `sel` and calls
  `pickWithFallback`; must pass the new set through
- `api/engine/steps/01_buildProgramFromDefinition.js` — owns `builderState`; must add
  `usedCanonicalNamesToday` and update it after each successful pick
- `api/engine/__tests__/exerciseSelector.test.js` — existing unit tests; extend, do not
  replace

No DB changes. No schema migrations. No changes to catalog JSON format stored in the DB.

---

## Prompt 1 — `canonicalName` utility + catalog plumbing

### 1a. Add `canonicalName` to `exerciseSelector.js`

Add the following **exported** function near the top of the file (after the existing small
helpers, before `buildIndex`):

```js
export function canonicalName(name) {
  const PREFIXES = [
    "smith machine",
    "resistance band",
    "trap bar",
    "single-arm",
    "single arm",
    "ez-bar",
    "ez bar",
    "dumbbells",
    "dumbbell",
    "kettlebells",
    "kettlebell",
    "barbell",
    "machine",
    "sandbag",
    "cable",
    "trx",
  ];
  let s = toStr(name).trim().toLowerCase();
  for (const prefix of PREFIXES) {
    if (s.startsWith(prefix + " ")) {
      s = s.slice(prefix.length).trim();
      break; // strip only the first matching prefix
    }
  }
  return s
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
```

Rules:
- Strip exactly **one** prefix (the longest match that starts the string followed by a space).
  Iterate `PREFIXES` in the order given above (longest first) so "smith machine" is checked
  before "machine".
- If no prefix matches, return a slug of the full name.
- An empty or null `name` returns `""`.

### 1b. Add `cn` field in `buildCatalogJsonFromBubble`

Inside the `map` in `buildCatalogJsonFromBubble`, compute `cn` from the resolved name and
include it in the returned object:

```js
const cn = canonicalName(n);
// ... existing fields ...
return { id, n, cn, sw, sw2, mp, eq, pref, den, cx, impact_level, engine_role,
         load, strength_equivalent, rank, mc, tr, wh };
```

### 1c. Propagate `cn` in `buildIndex`

In `buildIndex`, add `cn` to the object written into `byId`:

```js
byId[raw.id] = {
  // ... all existing fields ...
  cn: toStr(raw.cn || ""),
};
```

---

## Prompt 2 — Thread `usedCanonicalNamesSet` through the selector

### 2a. `pickBest` — add `avoidCnSet` parameter

`pickBest` currently has signature:
```js
export function pickBest(allowedSet, byId, sel, usedSet, usedRegionsSet)
```

Add a sixth parameter `avoidCnSet` (a `Set<string>` or `null`).

Inside the `for` loop, after the existing `if (usedSet && usedSet.has(id)) continue;` guard,
add:

```js
if (avoidCnSet && ex.cn && avoidCnSet.has(ex.cn)) continue;
```

This is a hard skip **within the regular attempts**. The `exDup` fallback in
`pickWithFallback` calls `pickBest` without passing `avoidCnSet` (pass `undefined` / omit),
so the fallback still works for small catalogs.

### 2b. `attemptAvoidRepeatSw2` — pass `avoidCnSet` through

`attemptAvoidRepeatSw2` calls `pickBest` internally. Add `avoidCnSet` as its last parameter
and forward it to every `pickBest` call it makes:

```js
function attemptAvoidRepeatSw2(allowedSet, byId, sel, usedWeek, usedSw2Set, usedRegionsSet, stats, avoidCnSet) {
  // ...
  const ex = pickBest(allowedSet, byId, { ... }, usedWeek, usedRegionsSet, avoidCnSet);
  // same for the mp fallback call
}
```

### 2c. `pickWithFallback` — add `usedCanonicalNamesSet` parameter

New signature:
```js
export function pickWithFallback(allowedSet, byId, sel, usedWeek, stats, usedSw2Set, usedRegionsSet, usedCanonicalNamesSet)
```

The existing `attempt` inner function closes over `usedWeek` and `usedRegionsSet`.
Extend it to also close over `usedCanonicalNamesSet` and forward it as `avoidCnSet`:

```js
function attempt(mp, sw, sw2, sw2Any, requirePref) {
  return pickBest(
    allowedSet, byId,
    { mp, sw, sw2, sw2Any, requirePref, ...sharedFields },
    usedWeek,
    usedRegionsSet,
    usedCanonicalNamesSet,   // ← new
  );
}
```

Pass `avoidCnSet = usedCanonicalNamesSet` to `attemptAvoidRepeatSw2` as well.

The `exDup` chain at the bottom of `pickWithFallback` calls `pickBest` directly — leave
those calls unchanged (no `avoidCnSet` argument). This is intentional: the fallback gives up
on canonical-name avoidance rather than leaving a slot empty.

---

## Prompt 3 — Wire into `selectorStrategies.js` and `01_buildProgramFromDefinition.js`

### 3a. `selectorStrategies.js` — pass `usedCanonicalNamesToday`

In `bestMatchByMovement`, `pickWithFallback` is called with 7 arguments. Add the eighth:

```js
return pickWithFallback(
  catalogIndex.allowedSet,
  catalogIndex.byId,
  sel,
  state.usedIdsWeek,
  state.stats,
  state.usedSw2Today,
  state.usedRegionsToday,
  state.usedCanonicalNamesToday,   // ← new
);
```

### 3b. `01_buildProgramFromDefinition.js` — add `usedCanonicalNamesToday` to `builderState`

Import `canonicalName` at the top of the file (it is already importing other named exports
from `../exerciseSelector.js`):

```js
import {
  buildCatalogJsonFromBubble,
  buildIndex,
  canonicalName,          // ← add
  dayHasRealExercise,
  isConditioning,
  pickSeedExerciseForSlot,
} from "../exerciseSelector.js";
```

Inside the per-day `builderState` object, add:

```js
usedCanonicalNamesToday: new Set(),
```

After a successful exercise pick (the `if (ex)` branch that calls `usedIdsWeek.add(ex.id)`),
add:

```js
const cn = canonicalName(ex.n);
if (cn) builderState.usedCanonicalNamesToday.add(cn);
```

No explicit reset needed — `builderState` is constructed fresh inside the day loop so
`usedCanonicalNamesToday` resets automatically for each new day.

### 3c. Add `avoided_repeat_cn` to stats

In the `stats` object initialised in `buildProgramFromDefinition`, add:

```js
avoided_repeat_cn: 0,
```

Increment it in `pickWithFallback` whenever `usedCanonicalNamesSet` caused a skip that
contributed to picking a different exercise. The simplest approach: in the `attempt` helper,
if `usedCanonicalNamesSet` is non-empty and the attempt would have returned a different
exercise without it, increment the counter. A pragmatic approximation: increment
`stats.avoided_repeat_cn` whenever any successful `attempt()` call returns a result AND
`usedCanonicalNamesSet.size > 0`. This is acceptable as an estimate for the debug log.

Alternatively (simpler and acceptable): skip the stat counter and just confirm the behaviour
via tests. Omit the counter if it would complicate the implementation.

---

## Prompt 4 — Tests

Extend `api/engine/__tests__/exerciseSelector.test.js`. Do NOT create a new file.

Import `canonicalName` alongside existing imports.

### `canonicalName`

```
"strips dumbbell prefix"
  canonicalName("Dumbbell Bulgarian Split Squat") === "bulgarian_split_squat"

"strips kettlebell prefix"
  canonicalName("Kettlebell Bulgarian Split Squat") === "bulgarian_split_squat"

"strips barbell prefix"
  canonicalName("Barbell Romanian Deadlift") === "romanian_deadlift"

"strips only the first matching prefix"
  canonicalName("Dumbbell Dumbbell Curl") === "dumbbell_curl"
  // "dumbbell" is stripped once; remaining "dumbbell curl" is slugified as-is

"does not strip when prefix is not at start"
  canonicalName("Bulgarian Split Squat") === "bulgarian_split_squat"

"smith machine stripped before machine"
  canonicalName("Smith Machine Squat") === "squat"
  // not "machine_squat"

"returns empty string for empty input"
  canonicalName("") === ""
  canonicalName(null) === ""
  canonicalName(undefined) === ""

"exercises with no equipment prefix produce identical canonical names"
  canonicalName("Dumbbell Romanian Deadlift") === canonicalName("Barbell Romanian Deadlift")
  // both → "romanian_deadlift"
```

### `pickBest` with `avoidCnSet`

```
"skips exercise whose cn is in avoidCnSet"
  ex_avoid = makeExercise({ id: "a", sw2: "sq_comp" })
    // ex_avoid.cn = "bulgarian_split_squat" (from buildCatalogJsonFromBubble)
  ex_ok = makeExercise({ id: "b", sw2: "sq_comp" })
    // ex_ok.cn = "romanian_deadlift"
  pool = makeSelectorPool([ex_avoid, ex_ok])
  avoidCnSet = new Set(["bulgarian_split_squat"])
  result = pickBest(pool.allowedSet, pool.byId, { sw2: "sq_comp" }, null, null, avoidCnSet)
  → result.id === "b"

"returns result normally when avoidCnSet is null"
  result = pickBest(pool.allowedSet, pool.byId, { sw2: "sq_comp" }, null, null, null)
  → result !== null

"returns null when avoidCnSet excludes all candidates"
  avoidCnSet = new Set(["bulgarian_split_squat", "romanian_deadlift"])
  result = pickBest(pool.allowedSet, pool.byId, { sw2: "sq_comp" }, null, null, avoidCnSet)
  → result === null
```

### `pickWithFallback` with `usedCanonicalNamesSet`

```
"avoids exercise with same canonical name already used today"
  db = makeExercise({ id: "a", name: "Dumbbell Bulgarian Split Squat", sw2: "lunge_comp" })
  kb = makeExercise({ id: "b", name: "Kettlebell Bulgarian Split Squat", sw2: "lunge_comp" })
  alt = makeExercise({ id: "c", name: "Reverse Lunge", sw2: "lunge_comp" })
  pool = makeSelectorPool([db, kb, alt])
  usedCn = new Set(["bulgarian_split_squat"])  // dumbbell variant already selected
  sel = { sw2: "lunge_comp", requirePref: null }
  result = pickWithFallback(pool.allowedSet, pool.byId, sel, new Set(), makeStats(),
                            new Set(), new Set(), usedCn)
  → result.id === "c"  // "a" and "b" both avoided; alt wins

"falls back to allowing cn repeat when no cn-free alternatives exist"
  db = makeExercise({ id: "a", name: "Dumbbell Bulgarian Split Squat", sw2: "lunge_comp" })
  kb = makeExercise({ id: "b", name: "Kettlebell Bulgarian Split Squat", sw2: "lunge_comp" })
  pool = makeSelectorPool([db, kb])
  usedCn = new Set(["bulgarian_split_squat"])
  sel = { sw2: "lunge_comp", requirePref: null }
  result = pickWithFallback(pool.allowedSet, pool.byId, sel, new Set(), makeStats(),
                            new Set(), new Set(), usedCn)
  → result !== null  // fallback succeeds — one of a or b is returned
```

**Note for test setup:** `makeExercise` currently does not accept a `name` field that feeds
into `cn`. Either:
- Pass `name` through `makeExercise` and ensure `buildCatalogJsonFromBubble` (called inside
  `makeSelectorPool`) picks it up via the `name` → `n` mapping; or
- Add a `cn` override to `makeExercise` so tests can set it directly without relying on name
  normalisation.

Prefer the former (pass real names and let `canonicalName` compute `cn`) so the tests also
cover the end-to-end name→canonical mapping.

---

## Verification

```bash
node --check api/engine/exerciseSelector.js
node --check api/engine/selectorStrategies.js
node --check api/engine/steps/01_buildProgramFromDefinition.js
node --test api/engine/__tests__/exerciseSelector.test.js
cd api && npm test -- --test-concurrency=1
# All tests pass — no regressions
```

After the test suite is green, manually verify via the admin preview endpoint that a
commercial-gym intermediate profile no longer produces two Bulgarian Split Squat variants
in the same day.
