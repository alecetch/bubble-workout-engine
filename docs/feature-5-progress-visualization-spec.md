# Feature 5 Specification: Progress Visualization

## 1. Executive Summary

Feature 5 in [vision-and-roadmap.md](/c:/Users/alecp/bubble-workout-engine/docs/vision-and-roadmap.md) is the athlete-facing proof layer for the engine. The system already stores high-value training data:

- completed session logs
- weight, reps, tonnage, estimated 1RM
- personal record feed
- session-level history metrics
- progression decisions and progression state

What is missing is a coherent, athlete-readable visualization layer that answers:

- "Is this program working?"
- "Am I getting stronger?"
- "Where am I progressing fastest?"
- "What changed after this session?"

This spec turns the roadmap bullet into an implementation-ready design for backend response shaping and mobile UI. It keeps the existing philosophy wherever possible:

- prefer enriching existing history endpoints over inventing parallel APIs
- keep backend deterministic and aggregation-focused
- keep chart-ready transformations on the server where they are expensive or domain-specific
- make the mobile client primarily responsible for presentation, interaction, and local filtering

This spec recommends a phased implementation:

1. Strength trend chart per exercise
2. Weekly volume load trends by body region
3. PR timeline redesign
4. Session summary card

It does **not** require new tables. It does require enriching some existing history endpoints and adding one small optional query parameter set where useful.

---

## 2. Product Goals

### Primary goals

1. Make athlete progress visible without requiring interpretation of raw logs.
2. Show evidence that the adaptation engine is reacting sensibly to performance.
3. Create retention loops:
   - macro loop: "I am trending up"
   - micro loop: "today moved me forward"
4. Reuse the current API and history architecture wherever possible.

### Non-goals

1. This is not a full analytics warehouse.
2. This is not coach-grade reporting.
3. This is not cross-program fatigue modeling.
4. This is not a general BI dashboard in the admin panel.

---

## 3. Current-State Analysis

### Existing backend capabilities

The API already exposes:

- [historyExercise.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/historyExercise.js)
  - per-exercise series
  - `topWeightKg`, `topReps`, `tonnage`
  - summary with `lastPerformed`, `bestWeightKg`, `sessionsCount`
- [prsFeed.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/prsFeed.js)
  - recent PR rows over 28/90 days
  - fallback heaviest upper/lower rows
- [sessionHistoryMetrics.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/sessionHistoryMetrics.js)
  - day streak
  - consistency rate
  - 28-day volume
  - upper/lower best e1RM trend
- [historyOverview.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/historyOverview.js)
  - high-level aggregate overview
- [exercise_progression_decision](/c:/Users/alecp/bubble-workout-engine/migrations/V60__create_exercise_progression_decision.sql)
  - decision outcomes and reasoning
- [segment_exercise_log](/c:/Users/alecp/bubble-workout-engine/api/src/routes/segmentLog.js)
  - completed set data including `weight_kg`, `reps_completed`, `rir_actual`, `estimated_1rm_kg`

### Current gaps vs roadmap

The roadmap says "no new API routes needed", but the current shape is still insufficient for the complete feature:

1. `GET /api/v1/history/exercise/:id`
   - currently returns top weight, top reps, and tonnage by day
   - does **not** return estimated 1RM series
   - does **not** return progression decision overlays
   - does **not** include an explicit chart window parameter

2. `GET /api/session-history-metrics`
   - currently gives one 28-day volume scalar, not an 8-week weekly series
   - does not break volume by upper/lower/full body

3. `GET /api/prs-feed`
   - useful data exists, but response shape is still feed-first rather than timeline-card-first
   - not yet optimized for shareable grouped timeline presentation

4. No backend route currently gives a "session summary card" payload directly after completion.
   - however, this can be built from the existing `segment-log`, PR feed logic, and day completion flow

### Key design conclusion

Feature 5 should be implemented by:

- **enriching existing history endpoints**
- **adding optional response fields / query parameters**
- **adding one small summary route only if the post-session UI cannot be cleanly built from existing responses**

The default recommendation in this spec is to avoid any brand-new history route unless we hit a practical limit.

---

## 4. User Experience Scope

Feature 5 should produce four athlete-facing surfaces.

### 4.1 Exercise Progress Screen

Purpose:
- visualise progress for one exercise over time

Primary content:
- estimated 1RM line
- optional secondary metric toggle:
  - top set weight
  - session tonnage
- colored decision markers:
  - load increased
  - reps increased
  - hold
  - deload

Default range:
- 12 weeks

Interactions:
- range pills: `4W`, `8W`, `12W`, `All`
- pinch/drag chart exploration
- tap a point for details

### 4.2 Progress Dashboard

Purpose:
- give the athlete a high-level answer to "how training is trending"

Primary cards:
- weekly volume load by region over last 8 weeks
- upper body strength trend snapshot
- lower body strength trend snapshot
- consistency / streak / sessions completed

### 4.3 PR Timeline

Purpose:
- celebrate visible milestones

Primary content:
- chronological PR events
- grouped by date when needed
- medal or trophy affordance
- shareable card framing

### 4.4 Session Summary Card

Purpose:
- close the immediate feedback loop after a workout

Primary content:
- total volume load today
- number of exercises logged
- PRs hit today
- strongest set / notable achievement
- short deterministic message, not LLM-generated

---

## 5. Backend Design

## 5.1 Endpoint Strategy

Recommended API strategy:

1. Enrich `GET /api/v1/history/exercise/:exerciseId`
2. Enrich `GET /api/session-history-metrics`
3. Reshape `GET /api/prs-feed` with backward-compatible additions
4. Add `GET /api/day/:program_day_id/session-summary` only if needed for the post-session card

### Why this is the right boundary

- The existing route ownership and auth model is already correct.
- Most of the needed data is already queryable from the current schema.
- The mobile client should not aggregate raw logs into chart series itself when the DB can do it deterministically.

---

## 5.2 Exercise Strength Trend API

### Existing route

`GET /api/v1/history/exercise/:exerciseId`

### Recommended changes

Add optional query params:

- `window=4w|8w|12w|all`
- `include_decisions=true|false`

Defaults:

- `window=12w`
- `include_decisions=true`

### Response shape

Recommended backward-compatible response:

```json
{
  "exerciseId": "bb_back_squat",
  "exerciseName": "Back Squat",
  "series": [
    {
      "date": "2026-03-01",
      "topWeightKg": 100,
      "tonnage": 1800,
      "topReps": 6,
      "estimatedE1rmKg": 120.0,
      "decisionOutcome": "increase_load",
      "decisionPrimaryLever": "load"
    }
  ],
  "summary": {
    "lastPerformed": "2026-03-15",
    "bestWeightKg": 110,
    "bestEstimatedE1rmKg": 132.0,
    "sessionsCount": 9
  }
}
```

### Query logic

Current route groups by `pd.scheduled_date`. Extend this with:

- `MAX(l.estimated_1rm_kg)` as `estimated_e1rm_kg`
- left join to latest progression decision around that exposure date

Recommended overlay rule:

- For each date, attach the most recent `exercise_progression_decision` row for the same `exercise_id` and user where `created_at::date <= scheduled_date`
- If none exists, leave null

This does not need perfect temporal causality for v1. It only needs a sensible overlay marker so the athlete can see "around here, the engine progressed load" or "this was a deload period."

### Query windowing

Recommended SQL-level date filter:

- `4w` => last 28 days
- `8w` => last 56 days
- `12w` => last 84 days
- `all` => existing 180-row cap can remain

### Implementation notes

- Keep current ASC ordering contract for the client.
- Keep current top-level response keys to avoid breaking existing consumers.
- Add fields rather than rename fields.

---

## 5.3 Weekly Volume Load Trend API

### Existing route

`GET /api/session-history-metrics`

### Recommended changes

Extend this route with a new field:

```json
{
  "weeklyVolumeByRegion8w": {
    "upper": [
      { "weekStart": "2026-01-19", "volumeLoad": 4200 },
      { "weekStart": "2026-01-26", "volumeLoad": 4700 }
    ],
    "lower": [
      { "weekStart": "2026-01-19", "volumeLoad": 5100 }
    ],
    "full": [
      { "weekStart": "2026-01-19", "volumeLoad": 9300 }
    ]
  }
}
```

### Aggregation rules

Source:
- `segment_exercise_log`
- joined to `program_exercise`
- joined to `exercise_catalogue`
- grouped by ISO week start

Volume formula:
- `SUM(weight_kg * reps_completed)`

Region mapping:

- `upper`
  - `exercise_catalogue.strength_primary_region = 'upper'`
- `lower`
  - `exercise_catalogue.strength_primary_region = 'lower'`
- `full`
  - total of all logged volume for the week

Fallback rule:
- if `strength_primary_region` is null, exclude from upper/lower but include in `full`

### Why extend this route instead of adding a new route

- It is already the dashboard metrics endpoint.
- This keeps the dashboard data consolidated.
- It reduces extra mobile round trips.

---

## 5.4 PR Timeline API

### Existing route

`GET /api/prs-feed`

### Current strengths

- already computes actual PR events
- already distinguishes 28-day and 90-day windows

### Recommended changes

Keep current route, add shape enhancements:

```json
{
  "mode": "prs_28d",
  "rows": [
    {
      "exerciseId": "bb_back_squat",
      "exerciseName": "Back Squat",
      "weightKg": 120,
      "repsCompleted": 5,
      "estimatedE1rmKg": 140,
      "date": "2026-03-10",
      "region": "lower",
      "shareLabel": "Back Squat PR",
      "milestoneType": "weight_pr"
    }
  ],
  "heaviest": null
}
```

Optional additions:

- `groupedByDate`
- `totalPrsInWindow`

The mobile client can still render the timeline itself. The backend only needs to supply cleaner labels and grouping hints.

---

## 5.5 Session Summary Card API

### Recommended option A: no new route

Preferred first implementation:

- compute the session summary from the same data already written by `POST /api/segment-log`
- after `PATCH /api/day/:id/complete`, mobile fetches a summary from the day context plus existing history metrics if needed

### Recommended option B: add a small dedicated route if UX becomes awkward

If the mobile flow becomes too fragmented, add:

- `GET /api/day/:program_day_id/session-summary`

Response:

```json
{
  "ok": true,
  "programDayId": "...",
  "volumeLoadKg": 7420,
  "exercisesLogged": 5,
  "setsLogged": 18,
  "prsHit": [
    {
      "exerciseId": "bb_back_squat",
      "exerciseName": "Back Squat",
      "bestWeightKg": 120
    }
  ],
  "headline": "You lifted 7,420 kg across 5 exercises today."
}
```

This route is optional for Feature 5 v1. The roadmap goal can still be met without it.

---

## 6. Mobile Specification

## 6.1 Navigation

Add a top-level Progress surface accessible from:

- home/dashboard tab, or
- history tab promoted with a segmented control

Recommended tabs within Progress:

1. `Overview`
2. `Exercises`
3. `PRs`

### Overview tab

Sections:

- 8-week volume load bar chart
- upper/lower strength snapshot cards
- consistency and streak summary

### Exercises tab

Flow:

- searchable list of logged exercises
- tap into exercise detail trend view

### PRs tab

- vertical timeline
- grouped by date
- share CTA on each milestone cluster

---

## 6.2 Charting Requirements

Recommended chart primitives:

- line chart for estimated 1RM
- bar chart for weekly volume
- timeline list for PRs

Visual encoding:

- `increase_load` -> green dot
- `increase_reps` -> blue dot
- `hold` -> neutral grey dot
- `deload_local` -> amber/red dot

Accessibility:

- each chart must have a text summary fallback
- values should be readable without color alone
- dots / labels need touch targets large enough for mobile

---

## 6.3 Session Summary Card UX

Trigger:

- after successful day completion flow

Content hierarchy:

1. headline metric
2. PRs achieved today
3. total volume load
4. one optional "next step" message

Message generation should be deterministic:

- if `prsHit.length > 0`: "You hit N PRs today."
- else if `volumeLoadKg > priorSessionVolume`: "You moved more total load than your last session."
- else: "Session complete. Recovery starts now."

No LLM copy required.

---

## 7. Detailed Backend Implementation Plan

## Phase 1: Exercise trend enrichment

Files likely affected:

- [historyExercise.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/historyExercise.js)
- [historyExercise.route.test.js](/c:/Users/alecp/bubble-workout-engine/api/test/historyExercise.route.test.js)

Changes:

1. Add query param parsing for `window` and `include_decisions`
2. Extend series query to include `estimated_1rm_kg`
3. Add optional decision overlay join
4. Extend summary with `bestEstimatedE1rmKg`
5. Preserve current response contract

## Phase 2: Weekly volume trend enrichment

Files likely affected:

- [sessionHistoryMetrics.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/sessionHistoryMetrics.js)

Changes:

1. Add 8-week weekly aggregation query
2. Return `weeklyVolumeByRegion8w`
3. Keep existing fields unchanged

## Phase 3: PR feed shaping

Files likely affected:

- [prsFeed.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/prsFeed.js)

Changes:

1. Add timeline-friendly labels / milestone metadata
2. Optionally add grouped-by-date field
3. Keep existing `mode`, `rows`, `heaviest`

## Phase 4: Mobile progress UI

Likely app work:

- new progress overview screen
- updated exercise history chart screen
- PR timeline redesign
- post-session summary card

---

## 8. API Contracts

## 8.1 `GET /api/v1/history/exercise/:exerciseId`

### New query params

- `window`
  - allowed: `4w`, `8w`, `12w`, `all`
- `include_decisions`
  - allowed: `true`, `false`

### New series fields

- `estimatedE1rmKg`
- `decisionOutcome`
- `decisionPrimaryLever`

### New summary field

- `bestEstimatedE1rmKg`

## 8.2 `GET /api/session-history-metrics`

### New field

- `weeklyVolumeByRegion8w`

## 8.3 `GET /api/prs-feed`

### Optional new row fields

- `shareLabel`
- `milestoneType`

---

## 9. Data and Query Notes

### 9.1 Estimated 1RM source of truth

Use `segment_exercise_log.estimated_1rm_kg`.

Do not recompute in the history routes if it already exists in the DB.

### 9.2 Progression overlay source

Use `exercise_progression_decision`.

For v1 overlay, exact nearest-match precision is not required. A date-level association is acceptable.

### 9.3 Volume by region

Use `exercise_catalogue.strength_primary_region`.

This is intentionally simple and aligns with current route patterns like `sessionHistoryMetrics`.

---

## 10. Testing Plan

## 10.1 Backend unit/integration tests

### `historyExercise.route.test.js`

Add cases for:

- `window=4w` filters older points
- `estimatedE1rmKg` appears on series rows
- `bestEstimatedE1rmKg` appears in summary
- `include_decisions=true` returns decision overlay fields
- missing decisions still returns null fields cleanly

### `sessionHistoryMetrics` tests

Add cases for:

- weekly aggregation grouped into 8 buckets
- upper/lower/full values computed correctly
- exercises with null region count toward `full` only

### `prsFeed` tests

Add cases for:

- new share/timeline fields
- backward compatibility of existing fields

## 10.2 Mobile tests

Add:

- chart data mapping tests
- empty-state rendering tests
- range toggle tests
- PR timeline grouping tests
- session summary card rendering tests

## 10.3 Regression tests

Ensure:

- existing clients using old response fields still work
- response ordering remains ASC for exercise series
- auth behavior stays unchanged

---

## 11. Rollout Plan

### Stage 1

- backend enrichments only
- hidden mobile development screens

### Stage 2

- ship exercise trend chart and progress overview

### Stage 3

- ship PR timeline redesign

### Stage 4

- ship session summary card

This staged rollout keeps the highest-value proof-of-progress surfaces first.

---

## 12. Open Questions

1. Should progression overlay markers show the decision date, the session date that triggered the decision, or the next-prescription date?
2. Should the exercise trend screen default to estimated 1RM or top set weight for novice users?
3. Should weekly volume be grouped by `strength_primary_region` only, or eventually also by `target_regions_json` for more detailed musculature views?
4. Do we want to expose a share-card API later, or keep sharing fully client-side?

---

## 13. Recommended First Delivery Slice

The best first slice is:

1. Enrich `GET /api/v1/history/exercise/:exerciseId` with:
   - `estimatedE1rmKg`
   - `bestEstimatedE1rmKg`
   - decision overlay fields
2. Enrich `GET /api/session-history-metrics` with:
   - `weeklyVolumeByRegion8w`
3. Build mobile:
   - Progress Overview screen
   - Exercise Trend screen

That slice delivers the core athlete-facing value of Feature 5 without waiting on the PR timeline redesign or session-summary UX.
