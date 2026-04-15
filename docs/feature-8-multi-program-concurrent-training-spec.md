# Feature 8 Specification: Multi-Program / Concurrent Training Goals

## 1. Executive Summary

Feature 8 expands the product from a single-program training app into a multi-track training system for athletes who run more than one goal at the same time.

Typical real-world examples:

- a primary strength block plus two weekly conditioning sessions
- a hypertrophy plan plus one weekly Hyrox benchmark day
- a Hyrox-focused cycle plus a small accessory strength plan

The current platform is close to supporting this already:

- the generation engine supports multiple `program_type` values
- the adaptation engine already scopes progression by `program_type`
- the program/calendar/day model is rich enough to represent multiple schedules

What is missing is the orchestration layer:

- allow more than one active program per user
- define which one is primary
- schedule secondary programs around the primary without date collisions
- surface multiple sessions cleanly in the mobile calendar and day flow

This spec turns the roadmap bullet in [vision-and-roadmap.md](/c:/Users/alecp/bubble-workout-engine/docs/vision-and-roadmap.md) into an implementation-ready backend and mobile design.

This feature is intentionally scoped to:

1. multiple active programs per user
2. primary/secondary program semantics
3. schedule conflict avoidance
4. multi-program calendar/day presentation

It explicitly does **not** include:

- cross-program fatigue modeling
- merged adaptation logic across program types
- coach scheduling tools
- shared volume caps across concurrent plans

---

## 2. Product Goals

### Primary goals

1. Allow one user to hold multiple simultaneous active programs when the program types differ.
2. Preserve a simple mental model:
   - one primary program
   - zero or more secondary programs
3. Prevent calendar conflicts automatically at generation time.
4. Make the day view and calendar feel coherent rather than fragmented.
5. Keep progression independent per `program_type`, as the current architecture already intends.

### Non-goals

1. This is not a training-readiness or fatigue-balancing system.
2. This is not an optimizer that composes two plans into one merged prescription.
3. This is not a coach scheduling console.
4. This is not a “run unlimited programs of the same type” feature.
5. This is not a replacement for Feature 4 program lifecycle; it complements it.

---

## 3. Current-State Analysis

### What already exists

- `program` supports:
  - ownership by `user_id`
  - lifecycle `status`
  - `program_type`
  - revision/parent linkage
- `program_day` and `program_calendar_day` already provide:
  - deterministic scheduled dates
  - selected-day and calendar rendering support
- `readProgram.js` already exposes:
  - `GET /api/program/:id/overview`
  - `GET /api/day/:id/full`
- `historyPrograms.js` already returns a list of programs, including active/completed state
- the generation pipeline already supports:
  - `hypertrophy`
  - `strength`
  - `conditioning`
  - `hyrox`
- `exercise_progression_state` is already keyed by `(user_id, program_type, progression_group_key, purpose)`
  - this is the core reason progression independence works without extra schema

### What does not exist yet

1. No explicit primary-vs-secondary distinction on `program`.
2. No route that returns “all active programs for this user” as a unified dashboard object.
3. No route that returns a combined calendar across active programs.
4. No route that returns “all sessions on one date” when multiple programs schedule the same day.
5. No generation-time scheduling rule that avoids conflicts with other active programs.
6. No mobile UX for showing more than one program in the Program tab.

### Important schema correction vs roadmap

The roadmap text says the calendar is already keyed by `(user_id, scheduled_date)`.

That is **not true in the current schema**.

From [db.md](/c:/Users/alecp/bubble-workout-engine/docs/db.md):

- `program_calendar_day` is unique on `(program_id, scheduled_date)`

This means concurrent programs can currently schedule the same date without any database-level prevention.

So Feature 8 **does require new conflict enforcement logic and likely one new materialized ownership column on the calendar table** if we want robust DB-level guarantees.

---

## 4. User Experience Scope

Feature 8 introduces three athlete-facing surfaces.

### 4.1 Multi-Program Home / Program Hub

Purpose:

- show all active programs
- make one program primary
- provide a single entry point to today’s sessions

Primary content:

- primary program hero card
- secondary program cards
- today’s combined sessions list
- quick CTA to generate an additional compatible program

### 4.2 Combined Calendar

Purpose:

- show all scheduled sessions across active programs in one date-driven view

Primary behavior:

- each calendar day can hold:
  - zero sessions
  - one session
  - multiple sessions from different programs
- sessions are color-coded by `program_type`
- tapping a date opens either:
  - direct navigation to one session
  - a picker/sheet if multiple sessions exist

### 4.3 Program-Specific Drilldown

Purpose:

- preserve the existing program overview/day detail behavior for each individual program

Behavior:

- athletes can still open one program in isolation
- the existing `Program Overview` and `Day Detail` flows remain valid
- Feature 8 adds an aggregate layer above them rather than replacing them

---

## 5. Core Product Rules

These are the invariant business rules for v1.

### 5.1 Active-program rule

A user may have:

- at most one active program per `program_type`
- at most one primary active program total

Allowed:

- one active `strength` program and one active `conditioning` program
- one active `hypertrophy` program and one active `hyrox` program

Not allowed:

- two active `strength` programs at once
- two primary programs at once

### 5.2 Primary-program rule

Exactly one active program should be primary whenever the user has any active programs.

If a user creates their first active program:

- it becomes primary automatically

If a user creates a second active program:

- it becomes secondary by default
- the user may later promote it to primary

Promoting one program to primary must demote the current primary in the same transaction.

### 5.3 Scheduling rule

Concurrent active programs must not create same-date conflicts.

For v1, “conflict” means:

- two training days from different active programs on the same `scheduled_date`

Recovery/rest rows are not a conflict.

### 5.4 Progression rule

Progression remains independent by `program_type`.

That means:

- a `strength` program does not influence `conditioning` progression state
- a `hypertrophy` program does not overwrite `hyrox` progression state

This already aligns with the current progression state schema and needs no new conceptual model.

---

## 6. Backend Design

## 6.1 Data Model Changes

### `program`

Add:

- `is_primary BOOLEAN NOT NULL DEFAULT FALSE`

Recommended supporting partial indexes:

- one primary active program per user
- one active program per user per type

Recommended migration behavior:

1. add column with default `FALSE`
2. backfill:
   - for users with one active program, mark it primary
   - for users with multiple active programs in old data, choose the newest active program as primary
3. add partial unique indexes

Recommended indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_program_one_primary_active_per_user
  ON program (user_id)
  WHERE status = 'active' AND is_primary = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_one_active_per_type_per_user
  ON program (user_id, program_type)
  WHERE status = 'active';
```

### `program_calendar_day`

The current table does not carry `user_id`, which makes DB-level cross-program collision enforcement awkward.

Recommended change:

- add `user_id UUID NULL REFERENCES app_user(id) ON DELETE CASCADE`
- backfill from `program.user_id`
- make it `NOT NULL`
- add a partial unique index for training days

Recommended index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_user_training_date
  ON program_calendar_day (user_id, scheduled_date)
  WHERE is_training_day = TRUE;
```

This gives the database a direct guarantee that two active training sessions cannot occupy the same user/date slot if the calendar is materialized correctly.

### Why this is preferable to app-only enforcement

- protects against future code paths writing overlapping calendars
- keeps schedule collisions observable and deterministic
- makes diagnostics and repair queries much simpler

---

## 6.2 API Strategy

Feature 8 should avoid breaking existing single-program clients.

Recommended approach:

1. keep existing single-program routes intact
2. add aggregate multi-program routes
3. extend generation with concurrent-program conflict checks

Recommended new routes:

1. `GET /api/programs/active`
2. `GET /api/calendar/combined`
3. `GET /api/sessions/by-date/:scheduled_date`
4. `PATCH /api/program/:program_id/primary`

Existing route to extend behaviorally:

5. `POST /api/generate-plan-v2`

---

## 6.3 `GET /api/programs/active`

Purpose:

- return all active programs for the signed-in user
- identify which is primary
- give enough data to render the program hub

### Response shape

```json
{
  "ok": true,
  "primary_program_id": "uuid",
  "programs": [
    {
      "program_id": "uuid",
      "program_title": "Strength Block 1",
      "program_type": "strength",
      "is_primary": true,
      "status": "active",
      "weeks_count": 12,
      "days_per_week": 3,
      "start_date": "2026-04-06",
      "hero_media": "https://...",
      "today_session_count": 1,
      "next_session_date": "2026-04-15"
    }
  ],
  "today_sessions": [
    {
      "program_id": "uuid",
      "program_day_id": "uuid",
      "program_title": "Conditioning Builder",
      "program_type": "conditioning",
      "day_label": "Intervals",
      "scheduled_date": "2026-04-15"
    }
  ]
}
```

### Notes

- `today_session_count` is per program
- `today_sessions` is the cross-program merged date view for the current day
- the route should be auth-scoped to `req.auth.user_id`

---

## 6.4 `GET /api/calendar/combined`

Purpose:

- provide a merged calendar feed across all active programs

### Query params

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`

Defaults:

- current date through current date + 28 days

### Response shape

```json
{
  "ok": true,
  "days": [
    {
      "scheduled_date": "2026-04-15",
      "sessions": [
        {
          "program_id": "uuid-a",
          "program_day_id": "uuid-day-a",
          "program_type": "strength",
          "program_title": "Strength Block 1",
          "day_label": "Lower 1",
          "is_primary_program": true,
          "is_completed": false
        },
        {
          "program_id": "uuid-b",
          "program_day_id": "uuid-day-b",
          "program_type": "conditioning",
          "program_title": "Conditioning Builder",
          "day_label": "Aerobic Base",
          "is_primary_program": false,
          "is_completed": false
        }
      ]
    }
  ]
}
```

### Aggregation rules

- include active programs only
- group by `scheduled_date`
- sort dates ASC
- within a date:
  - primary program first
  - then secondary programs ordered by `program_type`, then `program_title`

---

## 6.5 `GET /api/sessions/by-date/:scheduled_date`

Purpose:

- support the tap action from a combined calendar day that may contain multiple sessions

### Behavior

- validate `scheduled_date`
- return all active training sessions for that user/date
- if zero sessions: empty array
- if one session: mobile may navigate directly
- if multiple sessions: mobile shows a chooser

### Response shape

```json
{
  "ok": true,
  "scheduled_date": "2026-04-15",
  "sessions": [
    {
      "program_id": "uuid",
      "program_day_id": "uuid",
      "program_title": "Strength Block 1",
      "program_type": "strength",
      "is_primary_program": true,
      "day_label": "Lower 1",
      "session_duration_mins": 50,
      "is_completed": false
    }
  ]
}
```

---

## 6.6 `PATCH /api/program/:program_id/primary`

Purpose:

- let the athlete promote one active program to be the primary program

### Rules

1. Program must belong to user.
2. Program must be active.
3. Route runs transactionally:
   - demote current primary
   - promote requested program

### Response shape

```json
{
  "ok": true,
  "primary_program_id": "uuid"
}
```

### Why this matters

The UI needs a stable primary program for:

- hero treatment
- default entry in the Program tab
- schedule fallback when the user wants “my main plan” first

---

## 6.7 `POST /api/generate-plan-v2` concurrent-program behavior

This is the most important behavior change in the feature.

### Current behavior

Generation assumes the user is effectively creating their active program in isolation.

### New behavior

When generating a new program:

1. determine requested `programType`
2. check for an existing active program of the same type
3. if one exists:
   - reject with `409 conflict_active_program_same_type`
4. load all active programs for the user
5. build the candidate schedule
6. detect date collisions against existing active programs
7. if collisions exist:
   - attempt schedule repair
   - if still impossible, return `409 schedule_conflict`

### Repair strategy for v1

Keep this simple and deterministic.

Recommended order:

1. treat the current primary program as immovable
2. treat all existing active secondary calendars as occupied dates too
3. for the new candidate program, shift training days to the nearest available preferred-day-compatible dates within the same week where possible
4. if a full valid schedule cannot be materialized:
   - reject rather than silently generating overlapping plans

### Why reject instead of forcing overlap

- overlap is the exact UX failure this feature is trying to prevent
- silent overlap is worse than a clear “pick different preferred days” error

### Recommended error response

```json
{
  "ok": false,
  "code": "schedule_conflict",
  "error": "The new program overlaps with existing active sessions.",
  "details": {
    "conflict_dates": ["2026-04-15", "2026-04-17"],
    "existing_program_types": ["strength"],
    "suggestion": "Choose different preferred days or archive an active program first."
  }
}
```

---

## 7. Scheduling Algorithm

## 7.1 Inputs

- new program candidate:
  - `program_type`
  - preferred days
  - days per week
  - start date / anchor date
- occupied dates:
  - all `program_calendar_day` rows for the user from active programs where `is_training_day = TRUE`

## 7.2 Output

- one conflict-free schedule for the new program
- or a failure payload with the exact conflict dates

## 7.3 v1 scheduling constraints

1. Preserve the program’s own internal weekday cadence where possible.
2. Do not move sessions outside their intended week unless the underlying generator already permits it.
3. Do not rewrite existing active programs’ calendars.
4. Do not insert two training sessions on the same date for the same user.

## 7.4 Practical recommendation

Implement the conflict check in the same place the calendar coverage rows are materialized.

Why:

- that is where actual scheduled dates become real
- the candidate schedule is concrete there
- the same logic can be reused for validation and persistence

---

## 8. Mobile Specification

## 8.1 Navigation Model

Recommended high-level flow:

1. `Program Tab` opens the Program Hub rather than one program overview directly.
2. Program Hub shows:
   - primary program hero
   - secondary program cards
   - combined upcoming sessions
3. Tapping a program card opens the existing `Program Overview` for that specific program.
4. Tapping a combined-calendar day:
   - one session -> open `Day Detail`
   - multiple sessions -> open a bottom sheet/session picker

### Why this is the safest path

- it preserves all existing single-program screens
- Feature 8 adds an aggregate shell rather than requiring a full navigation rewrite

---

## 8.2 Program Hub UI

### Sections

1. Primary Program Hero
2. Today's Sessions
3. Active Programs
4. Combined Calendar
5. Generate Additional Program CTA

### Active Programs card fields

- title
- type badge
- primary/secondary badge
- next session date
- sessions this week
- “Make primary” CTA for non-primary programs

---

## 8.3 Combined Calendar UI

Each date cell should support stacked indicators.

Recommended visual encoding:

- `strength`: blue
- `hypertrophy`: green
- `conditioning`: amber
- `hyrox`: red/orange

Each day cell shows:

- 0 indicators -> no training
- 1 indicator -> direct tap target
- 2+ indicators -> stacked dots/bars and a count badge

Accessibility requirement:

- color should not be the only distinction
- a date with multiple sessions also needs a numeric or icon cue

---

## 8.4 Session Picker UI

When a date has multiple sessions, show a bottom sheet:

- date header
- one card per session
- primary program card listed first

Card fields:

- program title
- program type
- day label
- estimated duration
- completion state

---

## 8.5 Generate Additional Program UX

The onboarding/generation flow should support a “generate another program” path.

Recommended rules:

1. If user has no active program:
   - current behavior unchanged
2. If user has one or more active programs:
   - prefill the generation flow as usual
   - show an inline note:
     - “This will create an additional active program if the type is different.”
3. If chosen type already exists as active:
   - block before generation or return clear conflict after submit

---

## 9. Backend Implementation Plan

## Phase 1: Schema and constraints

Files likely affected:

- new migration for `program.is_primary`
- new migration for `program_calendar_day.user_id`

Changes:

1. add `is_primary` to `program`
2. add `user_id` to `program_calendar_day`
3. backfill both
4. add partial unique indexes

## Phase 2: Aggregate read routes

Files likely affected:

- new route module for active programs / combined calendar
- `api/server.js`

Changes:

1. add `GET /api/programs/active`
2. add `GET /api/calendar/combined`
3. add `GET /api/sessions/by-date/:scheduled_date`
4. add `PATCH /api/program/:program_id/primary`

## Phase 3: Generation conflict enforcement

Files likely affected:

- [generateProgramV2.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/generateProgramV2.js)
- any calendar materialization helper used there

Changes:

1. prevent same-type active duplicates
2. detect cross-program date collisions
3. attempt deterministic repair
4. emit clear `409` errors when repair fails

## Phase 4: Mobile program hub

Likely app work:

- new Program Hub screen
- combined calendar component
- session picker bottom sheet
- “make primary” action
- generate-secondary-program entry point

---

## 10. Suggested API Contracts

## 10.1 `GET /api/programs/active`

Primary contract fields:

- `primary_program_id`
- `programs[]`
- `today_sessions[]`

## 10.2 `GET /api/calendar/combined`

Primary contract fields:

- `days[]`
- `days[].sessions[]`

## 10.3 `GET /api/sessions/by-date/:scheduled_date`

Primary contract fields:

- `scheduled_date`
- `sessions[]`

## 10.4 `PATCH /api/program/:program_id/primary`

Primary contract fields:

- `primary_program_id`

## 10.5 `POST /api/generate-plan-v2`

New conflict codes:

- `conflict_active_program_same_type`
- `schedule_conflict`

---

## 11. Testing Plan

## 11.1 Backend tests

### Schema / constraint tests

Add migration-level or integration coverage for:

- only one active primary program per user
- only one active active-program-per-type per user
- no duplicate training date for same user in `program_calendar_day`

### Route tests

Add cases for:

- `GET /api/programs/active` returns primary + secondary programs
- `GET /api/calendar/combined` merges two programs correctly by date
- `GET /api/sessions/by-date/:scheduled_date` returns one or many sessions
- `PATCH /api/program/:id/primary` demotes old primary and promotes new one
- unauthorized user cannot see or mutate another user’s programs

### Generation tests

Add cases for:

- creating a second program of a different type succeeds when no schedule conflict exists
- creating a second active program of the same type returns `409`
- overlapping schedule returns `409 schedule_conflict`
- repairable near-conflict is shifted to a valid date if repair logic is implemented

## 11.2 Mobile tests

Add:

- Program Hub rendering with one active program
- Program Hub rendering with two active programs
- combined calendar day with multiple sessions
- session picker navigation
- make-primary action
- conflict error state during additional program generation

---

## 12. Rollout Plan

### Stage 1

- schema changes
- hidden backend routes

### Stage 2

- generation conflict enforcement
- internal/manual QA with seeded users having two active programs

### Stage 3

- mobile Program Hub behind feature flag

### Stage 4

- enable multi-program generation for advanced/internal testers first

### Stage 5

- full rollout

This staged rollout is recommended because concurrent scheduling touches the core lifecycle and can create messy user states if shipped all at once.

---

## 13. Open Questions

1. Should future same-date double sessions ever be allowed when one session is marked “optional”?
2. Should `hyrox` be allowed as a secondary program with fewer constraints than full plans, given its benchmark-like nature?
3. Should the Program tab always open the Program Hub, or should users be able to choose a default program landing screen?
4. Should archiving a primary program automatically promote the oldest or newest remaining active secondary?
5. Do we want “paused” as a separate program lifecycle status before enabling full multi-program management?

---

## 14. Recommended First Delivery Slice

The best first delivery slice is:

1. schema support for:
   - `program.is_primary`
   - `program_calendar_day.user_id`
2. backend routes:
   - `GET /api/programs/active`
   - `GET /api/calendar/combined`
   - `PATCH /api/program/:program_id/primary`
3. generation rule:
   - reject same-type duplicates
   - reject schedule conflicts clearly
4. mobile:
   - Program Hub
   - combined calendar
   - multi-session date picker

That slice delivers the core promise of Feature 8 without waiting for more advanced schedule-repair logic or richer multi-plan automation.
