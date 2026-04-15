# Feature 9 Specification: Coach / Trainer Portal

## 1. Executive Summary

Feature 9 turns the product from a self-serve athlete app into a system that can support a professional coach managing multiple athletes.

The core engine already does most of the hard work:

- it can generate individualized programs
- it stores active/completed programs
- it logs exercise/session performance
- it computes progression decisions and preserves progression state
- it already exposes most athlete-facing read surfaces through authenticated routes

What is missing is the management layer:

- a first-class coach role
- a coach-to-athlete relationship model
- coach-scoped read routes
- a narrowly-scoped override path for next-session progression
- admin tooling to provision and manage coaches safely

This spec expands the Feature 9 roadmap bullet in [vision-and-roadmap.md](/c:/Users/alecp/bubble-workout-engine/docs/vision-and-roadmap.md) into an implementation-ready design for schema, API, admin, and mobile/web-facing behavior.

This feature is intentionally scoped to:

1. coach identity and authorization
2. linking coaches to athletes
3. coach read access to athlete data
4. a one-session progression override capability
5. admin support for provisioning and relationship management

This feature is explicitly **not**:

- a public athlete marketplace
- a team programming engine
- a two-way messaging platform
- a full EMR/medical notes system
- a cross-athlete analytics warehouse

---

## 2. Product Goals

### Primary goals

1. Allow a coach to see the same high-value training context the athlete sees, across multiple linked athletes.
2. Let a coach audit generated programs and progression decisions without needing direct database access.
3. Support a limited “coach override” workflow for the next session only.
4. Preserve tenant isolation strictly:
   - coaches only see linked athletes
   - athletes never see each other
   - coach access must be explicit and revocable
5. Reuse existing athlete-facing routes and response shapes wherever possible.

### Non-goals

1. This is not a complete CRM or billing system.
2. This is not a messaging/chat feature.
3. This is not a collaborative editing model for programs.
4. This is not a coach-authored custom-program builder.
5. This is not a persistent override engine that replaces Layer B permanently.

---

## 3. Current-State Analysis

### What already exists

- `app_user` is the core identity table
- `client_profile` is already user-scoped and contains rich training inputs
- `program`, `program_day`, `program_exercise`, and `segment_exercise_log` already model athlete activity well
- `readProgram.js` already exposes:
  - program overview
  - day full
  - decision history
- history routes already expose:
  - program history
  - timeline
  - personal records
  - overview metrics
- the admin panel already exists and supports internal-token protected operational tools
- progression state and decision data are already persisted in:
  - `exercise_progression_state`
  - `exercise_progression_decision`

### What does not exist

1. No coach role on `app_user`.
2. No table that links a coach to an athlete.
3. No coach-scoped routes.
4. No override source for progression distinct from automatic decisions.
5. No invite/acceptance flow for coach-athlete linking.
6. No admin UI for assigning coaches or viewing relationships.

### Important schema/style correction vs roadmap

The roadmap suggests:

- `role ENUM('athlete', 'coach') DEFAULT 'athlete'`

The current project generally does **not** use native Postgres enums. As noted in [db.md](/c:/Users/alecp/bubble-workout-engine/docs/db.md), enum-like values are typically stored as text and constrained in app code.

So the expanded spec recommends:

- `role TEXT NOT NULL DEFAULT 'athlete'`
- optional `CHECK (role IN ('athlete', 'coach', 'admin'))`

This fits the repo’s current schema style better and avoids introducing a one-off enum type unless the team wants to standardize on enums more broadly.

---

## 4. User Experience Scope

Feature 9 introduces three user-facing surfaces.

### 4.1 Coach Portal Home

Purpose:

- give a coach a dashboard of linked athletes
- show who needs attention today

Primary content:

- linked athlete list
- active program title/type per athlete
- last session date
- streak / completion summary
- alert badges:
  - no recent session
  - deload active
  - override pending

### 4.2 Athlete Detail View (Coach-side)

Purpose:

- show the coach the athlete’s training state without requiring them to impersonate the athlete

Primary sections:

- athlete profile summary
- active program overview
- recent sessions
- progression decision feed
- next-session override tools

### 4.3 Admin Coach Management

Purpose:

- provision coach accounts
- link/unlink coach-athlete relationships
- audit coach access

Primary sections:

- coach user list
- relationship table
- invite/link actions
- activity audit summary

---

## 5. Core Product Rules

These are the invariant business rules for v1.

### 5.1 Role rule

A user has one role:

- `athlete`
- `coach`
- optionally `admin` if the team wants to formalize admin identity in `app_user`

For v1, coach-facing routes require:

- authenticated user
- `role = 'coach'` or internal-admin privilege where applicable

### 5.2 Relationship rule

Coach access is relationship-based.

A coach may only view athlete data if a `coach_client` relationship exists and is active.

Recommended relationship state values:

- `pending`
- `active`
- `revoked`

Only `active` relationships grant read access.

### 5.3 Override rule

A coach override is:

- targeted to one athlete
- targeted to one exercise slot / progression key
- valid for the next session only
- auditable
- non-destructive to the underlying automatic decision history

### 5.4 Ownership rule

Athlete data remains athlete-owned.

This means:

- programs still belong to the athlete user
- logs still belong to the athlete user
- coaches gain scoped access but do not become owners of the data

### 5.5 Revocation rule

When a coach-athlete relationship is revoked:

- coach read access ends immediately
- pending override actions must no longer be applicable
- historical audit rows remain for traceability

---

## 6. Backend Design

## 6.1 Data Model Changes

### `app_user`

Add:

- `role TEXT NOT NULL DEFAULT 'athlete'`

Recommended constraint:

```sql
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'athlete';

ALTER TABLE app_user
  ADD CONSTRAINT chk_app_user_role
  CHECK (role IN ('athlete', 'coach', 'admin'));
```

If the team prefers not to introduce `admin` into the DB schema yet, keep the check to `('athlete', 'coach')` and continue using internal token middleware for admin-only flows.

### `coach_client`

New table:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `coach_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE`
- `client_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `invited_by_user_id UUID NULL REFERENCES app_user(id) ON DELETE SET NULL`
- `accepted_at TIMESTAMPTZ NULL`
- `revoked_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Recommended constraints:

- `CHECK (status IN ('pending', 'active', 'revoked'))`
- `coach_user_id <> client_user_id`
- one active/pending relationship per pair

Recommended indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_client_unique_pair_live
  ON coach_client (coach_user_id, client_user_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_coach_client_coach_status
  ON coach_client (coach_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_client_client_status
  ON coach_client (client_user_id, status, created_at DESC);
```

### `coach_progression_override`

Recommended new table rather than writing directly into `exercise_progression_state`.

Why:

- preserves auditability
- distinguishes coach actions from engine state
- makes one-session consumption explicit
- avoids overloading automatic state rows with manual semantics

Table:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `coach_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE`
- `client_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE`
- `program_id UUID NULL REFERENCES program(id) ON DELETE CASCADE`
- `program_exercise_id UUID NULL REFERENCES program_exercise(id) ON DELETE CASCADE`
- `exercise_id TEXT NOT NULL`
- `progression_group_key TEXT NOT NULL`
- `program_type TEXT NOT NULL`
- `purpose TEXT NOT NULL DEFAULT ''`
- `override_kind TEXT NOT NULL`
- `override_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb`
- `reason_text TEXT NULL`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `applies_until_program_day_id UUID NULL REFERENCES program_day(id) ON DELETE SET NULL`
- `consumed_at TIMESTAMPTZ NULL`
- `revoked_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Recommended checks:

- `override_kind IN ('next_session_load', 'next_session_reps', 'next_session_hold')`
- `status IN ('pending', 'consumed', 'revoked')`

### Why not write only a synthetic row to `exercise_progression_state`

The roadmap suggests a synthetic write into `exercise_progression_state` with `source = "coach_override"`.

That is plausible, but for this codebase a dedicated override table is cleaner because:

1. `exercise_progression_state` is current-state, not command history
2. one-session override semantics require explicit lifecycle tracking
3. reconciliation with future Layer B decisions is easier if overrides are separate inputs

The recommended approach is:

- persist the override in `coach_progression_override`
- optionally materialize it into `exercise_progression_state` at apply-time if the pipeline requires it

---

## 6.2 API Strategy

Recommended API approach:

1. add coach-specific routes under `/api/coach`
2. reuse existing athlete-facing queries internally where possible
3. add a small relationship-management surface
4. keep admin-only provisioning separate from coach self-service

Recommended routes:

1. `GET /api/coach/clients`
2. `GET /api/coach/clients/:client_user_id/overview`
3. `GET /api/coach/clients/:client_user_id/programs`
4. `GET /api/coach/clients/:client_user_id/decisions`
5. `GET /api/coach/clients/:client_user_id/recent-sessions`
6. `POST /api/coach/clients/:client_user_id/progression-override`
7. `GET /api/coach/clients/:client_user_id/progression-overrides`
8. `POST /api/coach/relationships/:relationship_id/revoke`

Admin routes:

9. `GET /api/admin/coaches`
10. `POST /api/admin/coaches/:coach_user_id/clients/:client_user_id/link`
11. `DELETE /api/admin/coaches/:coach_user_id/clients/:client_user_id/link`

Optional invite flow:

12. `POST /api/coach/invitations`
13. `POST /api/coach/invitations/:token/accept`

For v1, the admin-link path is the smallest slice and should come first.

---

## 6.3 Authorization Model

### New middleware concept

Recommended additions:

- `requireCoachRole`
- `requireCoachClientAccess`

Behavior:

1. `requireAuth` verifies JWT and attaches `req.auth.user_id`
2. `requireCoachRole` loads the user role and ensures it is `coach`
3. `requireCoachClientAccess` verifies an active `coach_client` row for:
   - `coach_user_id = req.auth.user_id`
   - `client_user_id = req.params.client_user_id`
   - `status = 'active'`

### Why not rely on admin middleware

Coach routes are end-user authenticated product routes, not internal-token operations. They should use the normal JWT path, not `requireInternalToken`.

---

## 6.4 `GET /api/coach/clients`

Purpose:

- return the coach’s linked athletes with high-value summaries

### Response shape

```json
{
  "ok": true,
  "clients": [
    {
      "client_user_id": "uuid",
      "client_profile_id": "uuid",
      "display_name": "Alex P",
      "active_program": {
        "program_id": "uuid",
        "program_title": "Strength Block 1",
        "program_type": "strength",
        "status": "active"
      },
      "last_session_date": "2026-04-12",
      "current_streak": 4,
      "has_active_override": false,
      "relationship_status": "active"
    }
  ]
}
```

### Notes

- keep this dashboard-oriented and compact
- one active program summary is enough for v1 even if Feature 8 later enables multiple active programs

---

## 6.5 `GET /api/coach/clients/:client_user_id/overview`

Purpose:

- provide the coach-side equivalent of the athlete’s top-level training snapshot

Recommended contents:

- client profile summary
- active program summary
- current week/day
- completion metrics
- streak summary

### Response shape

```json
{
  "ok": true,
  "client": {
    "client_user_id": "uuid",
    "display_name": "Alex P",
    "fitness_level_slug": "intermediate",
    "goals": ["strength"]
  },
  "active_program": {
    "program_id": "uuid",
    "program_title": "Strength Block 1",
    "program_type": "strength",
    "weeks_count": 12,
    "days_per_week": 3
  },
  "summary": {
    "last_session_date": "2026-04-12",
    "current_streak": 4,
    "completion_ratio": 0.67
  }
}
```

### Implementation note

This route should reuse the same underlying data sources as:

- `historyOverview`
- `historyPrograms`
- `readProgram` overview patterns

---

## 6.6 `GET /api/coach/clients/:client_user_id/programs`

Purpose:

- show the coach all programs for one athlete

Recommended response:

- re-use the same mapping shape as `historyPrograms`
- optionally add `is_active` and `program_type`

This prevents a separate bespoke contract when the existing athlete program-history contract is already close.

---

## 6.7 `GET /api/coach/clients/:client_user_id/decisions`

Purpose:

- give the coach a cross-exercise decision feed for one athlete

This is distinct from the exercise-specific decision history route.

### Response shape

```json
{
  "ok": true,
  "rows": [
    {
      "program_exercise_id": "uuid",
      "exercise_id": "bb_back_squat",
      "exercise_name": "Back Squat",
      "program_title": "Strength Block 1",
      "week_number": 6,
      "day_number": 1,
      "outcome": "increase_load",
      "confidence": "high",
      "display_label": "Week 6 - Added 5 kg",
      "display_reason": "You hit all sets at the top of your rep range with good RIR for 2 sessions.",
      "decided_at": "2026-04-10T18:32:00Z"
    }
  ]
}
```

### Query behavior

- newest first
- filterable by:
  - `program_id`
  - `exercise_id`
  - `limit`
  - `offset`

### Why this route matters

The roadmap asks for “Layer B decision history across all exercises.” A coach needs this cross-exercise feed to spot patterns without opening one exercise at a time.

---

## 6.8 `GET /api/coach/clients/:client_user_id/recent-sessions`

Purpose:

- let the coach see the athlete’s recent execution history quickly

Recommended contents:

- recent completed days
- total volume if available
- PR flags if available

This can be built largely from existing history/timeline sources.

---

## 6.9 `POST /api/coach/clients/:client_user_id/progression-override`

Purpose:

- allow a coach to influence the next session for a specific exercise

### Allowed override kinds for v1

1. `next_session_load`
2. `next_session_reps`
3. `next_session_hold`

### Request shape

```json
{
  "program_exercise_id": "uuid",
  "override_kind": "next_session_load",
  "override_payload": {
    "recommended_load_kg": 92.5
  },
  "reason_text": "Reduce jump size this week to keep technique stable."
}
```

### Response shape

```json
{
  "ok": true,
  "override_id": "uuid",
  "status": "pending"
}
```

### Validation rules

1. coach must have active relationship to client
2. `program_exercise_id` must belong to the client
3. target program must be active unless explicit archived handling is added later
4. payload must match `override_kind`

### Why keep the override set narrow

This reduces risk and avoids turning v1 into a general-purpose program editor.

---

## 6.10 Applying coach overrides

This is the key implementation choice.

### Recommended model

Coach overrides are consumed at the next point where prescription state is resolved:

- either at program regeneration / Step 07 application
- or at day-read time if the product wants immediate visibility

For v1, the cleanest implementation is:

1. persist pending override in `coach_progression_override`
2. when the target exercise is next encountered in the active prescription flow:
   - apply the override on top of automatic progression state
   - mark it `consumed`
3. append a synthetic decision/audit entry indicating coach override application

### Suggested synthetic audit entry

If applied, create:

- either a row in `exercise_progression_decision` with:
  - `decision_outcome = 'hold'` or matching effective outcome
  - `decision_context_json.source = 'coach_override'`
- or a dedicated audit row in `coach_progression_override`

Recommended v1:

- keep canonical coach override audit in `coach_progression_override`
- optionally mirror into `exercise_progression_decision` only if athlete-facing history must show it immediately

### Athlete-facing transparency rule

If a coach override changes the visible next prescription, the athlete should be able to see that it was coach-driven, not purely automatic.

That means the adaptation-transparency surfaces should eventually render a label like:

- `Coach adjustment`

This can be a follow-up slice if not included in v1.

---

## 6.11 Relationship creation flows

### Smallest v1: admin-managed link only

Admin creates a coach account and links athletes directly.

Pros:

- simplest
- lowest fraud risk
- easiest to implement

Cons:

- no self-serve coach onboarding

### v1.5: invite/accept flow

Coach creates invite, athlete accepts via tokenized link.

Recommended later table if needed:

- `coach_invitation`

For the expanded spec, the invite flow is optional and should be explicitly marked as a later slice.

---

## 7. Admin Panel Design

## 7.1 Coach Management Tab

Add a new `/admin` tab for coach operations.

Sections:

1. Coach Users
2. Coach-Athlete Relationships
3. Link / Unlink Actions
4. Override Activity

### Coach Users table

Columns:

- user id
- email
- role
- linked athlete count
- created at

### Relationship table

Columns:

- coach email
- athlete display name/email
- status
- linked at
- accepted at
- revoked at

### Actions

- promote user to coach
- link coach to athlete
- revoke relationship
- view athlete overview as coach

---

## 7.2 Admin Routes

Recommended routes:

- `GET /api/admin/coaches`
- `PATCH /api/admin/users/:user_id/role`
- `POST /api/admin/coaches/:coach_user_id/clients/:client_user_id/link`
- `DELETE /api/admin/coaches/:coach_user_id/clients/:client_user_id/link`
- `GET /api/admin/coaches/:coach_user_id/activity`

These should continue using internal/admin middleware, not product JWT coach middleware.

---

## 8. Mobile / Web Coach Portal UX

This depends on where the coach portal lives.

### Recommended v1 placement

Build coach UI as a web/admin-authenticated product surface first, not in the athlete mobile app.

Why:

- coaches are more likely to work on desktop/tablet
- the admin/web stack already exists
- it avoids coupling coach workflows to athlete mobile release cadence

### Coach Portal screens

1. Coach Dashboard
2. Athlete List
3. Athlete Detail
4. Decision Feed
5. Override Composer

### Athlete Detail sections

- profile snapshot
- active program
- recent sessions
- progression decisions
- override composer

---

## 9. Backend Implementation Plan

## Phase 1: roles and relationships

Files likely affected:

- new migration for `app_user.role`
- new migration for `coach_client`
- auth/coach middleware
- admin routes

Changes:

1. add role column
2. add relationship table
3. add admin linking flows
4. add `requireCoachRole` / `requireCoachClientAccess`

## Phase 2: coach read routes

Files likely affected:

- new `coachPortal.js` route module or split route modules
- `api/server.js`

Changes:

1. `GET /api/coach/clients`
2. `GET /api/coach/clients/:client_user_id/overview`
3. `GET /api/coach/clients/:client_user_id/programs`
4. `GET /api/coach/clients/:client_user_id/decisions`
5. `GET /api/coach/clients/:client_user_id/recent-sessions`

## Phase 3: override engine

Files likely affected:

- new migration for `coach_progression_override`
- new route for progression override creation/listing
- progression/state resolution layer

Changes:

1. persist next-session override requests
2. make them consumable by the prescription flow
3. expose coach override history

## Phase 4: admin UI / coach web UI

Likely surfaces:

- `/admin` coach management tab
- coach dashboard web screens

---

## 10. Security and Privacy Requirements

This feature materially increases the risk surface and should be explicit about that.

### Required guarantees

1. Coaches can only access athletes linked by active relationship.
2. Relationship revocation removes access immediately.
3. All coach read routes require JWT auth and role check.
4. All admin management routes require internal/admin middleware.
5. Override actions are fully auditable:
   - who
   - when
   - athlete
   - reason
   - payload
   - consumed/revoked state

### Data minimization for v1

Do not expose unnecessary sensitive profile fields in coach dashboard responses.

Recommended exposure:

- display name
- fitness level
- goals
- active program summary
- session history
- progression decisions

Avoid broad exposure of optional demographic/body fields unless there is a clear coaching need in the UI.

---

## 11. Testing Plan

## 11.1 Backend tests

### Role / relationship tests

Add cases for:

- athlete user denied coach routes with `403`
- coach user denied access to unlinked athlete with `403`
- linked active relationship grants access
- revoked relationship denies access immediately

### Route tests

Add cases for:

- `GET /api/coach/clients` returns linked athletes only
- `GET /api/coach/clients/:id/overview` returns 200 for linked athlete
- `GET /api/coach/clients/:id/decisions` returns newest-first results
- pagination and filters work on decisions route

### Override tests

Add cases for:

- valid override creation succeeds
- invalid payload rejected with `400`
- wrong-coach/wrong-athlete rejected with `403`
- override can be marked consumed
- revoked relationship prevents new override creation

### Admin tests

Add cases for:

- promote user to coach
- create coach-athlete link
- duplicate active link rejected
- revoke link works

## 11.2 UI tests

Add:

- coach athlete list rendering
- athlete detail rendering
- decision feed empty state
- override composer validation
- revoked relationship access error state

---

## 12. Rollout Plan

### Stage 1

- schema support for role + relationships
- admin-only management routes

### Stage 2

- coach read routes behind feature flag

### Stage 3

- internal coach web dashboard

### Stage 4

- progression override support for a limited internal cohort

### Stage 5

- broader B2B rollout

The phased rollout matters because coach access is a permissions-heavy feature and should not ship before the relationship and audit model is stable.

---

## 13. Open Questions

1. Should coaches be provisioned only by admins in v1, or should self-serve coach signup exist at all?
2. Should a coach be allowed to link to another coach acting as an athlete test account, or should role combinations be forbidden?
3. Should athlete consent be mandatory before a relationship becomes active, even for admin-created links?
4. Should coach overrides appear in the athlete-facing adaptation history immediately, or only in the coach audit trail?
5. Should one athlete be allowed multiple active coaches in v1, or should it be one coach per athlete to simplify permissions?

---

## 14. Recommended First Delivery Slice

The best first delivery slice is:

1. schema:
   - `app_user.role`
   - `coach_client`
2. admin:
   - coach provisioning
   - coach-athlete linking
3. backend:
   - `GET /api/coach/clients`
   - `GET /api/coach/clients/:client_user_id/overview`
   - `GET /api/coach/clients/:client_user_id/decisions`
4. web:
   - simple coach dashboard with athlete list and decision feed

That slice delivers real B2B value without waiting for the more complex override machinery. The progression override flow should come immediately after the read-only portal is stable and auditable.
