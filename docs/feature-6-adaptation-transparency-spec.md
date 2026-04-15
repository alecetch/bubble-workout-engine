# Feature 6 Specification: Adaptation Transparency

> "Why is my program changing?"

---

## 1. Executive Summary

Feature 6 makes the adaptation engine legible to the athlete. Layer B already produces
a richly reasoned decision for each exercise after every completed session — outcome
type, primary lever, confidence, evidence, and human-readable `reasons[]` — and
persists all of it to `exercise_progression_decision`. The mobile client sees none of
it. This feature closes that gap in three surfaces:

1. **Exercise-level adaptation chip** — a contextual badge on each exercise card in
   Day Detail, visible when a Layer B decision applies to that exercise this week.
2. **Week insight banner** — a one-sentence summary at the top of the current week
   view, derived deterministically from the set of Layer B decisions across all
   exercises in that week.
3. **Decision history screen** — a per-exercise drill-down showing every past Layer B
   decision in plain language, accessible from the exercise card.

The entire feature requires **one new API endpoint**, **one enrichment to an existing
endpoint**, and **zero new database tables**. All display logic is deterministic server-
side text generation — no LLM calls, no client-side inference.

---

## 2. Product Goals

### Primary goals

1. Surface the adaptation rationale to the athlete at the right moment and granularity.
2. Increase trust in automatic load/rep changes — "the engine knows what it's doing."
3. Reinforce the connection between logged effort and prescription changes.
4. Provide an in-app audit log for power users who want to verify decisions.

### Non-goals

1. Not a coach-override interface (that is Feature 9).
2. Not a real-time decision simulation (that is the admin progression sandbox).
3. Not a general analytics dashboard.
4. Not a push notification channel (that is Feature 7 — deload acknowledgment).
5. Does not require Feature 1 (Layer C) to ship — Feature 6 reads
   `exercise_progression_decision` rows that Layer B already writes today. It will
   show more data once Feature 1 is complete, but it is useful independently.

---

## 3. Current-State Analysis

### What exists

| Asset | Location | Notes |
|-------|----------|-------|
| Decision rows | `exercise_progression_decision` | Written by `progressionDecisionService.applyProgressionRecommendations()` after each session |
| Decision state | `exercise_progression_state` | Aggregated last-known state per `(user_id, program_type, progression_group_key, purpose)` |
| Outcome enum | `decision_outcome` column | Values: `increase_load`, `increase_reps`, `increase_sets`, `reduce_rest`, `hold`, `deload_local` |
| Reasons | `decision_context_json.reasons[]` | Array of plain English strings written by `buildDecision()` |
| Evidence | `evidence_summary_json` | `exposures_considered`, `successful_exposures`, `underperformance_exposures`, `latest_weight_kg`, `latest_reps`, `latest_rir`, `target_low`, `target_high`, `target_rir`, `required_rir` |
| Primary lever | `primary_lever` | Same enum as `decision_outcome` values |
| Confidence label | `confidence` | Text: `"low"`, `"medium"`, `"high"` |
| DB indexes | `idx_exercise_progression_decision_user_created`, `idx_exercise_progression_decision_program` | Indexed by `(user_id, created_at DESC)` and `(program_id, program_exercise_id)` |
| Day full route | `GET /api/day/:id/full` | Returns all exercises for a day — no decision data today |
| Program overview | `GET /api/program/:id/overview` | Returns week/day structure — no decision data today |
| Exercise history | `GET /api/v1/history/exercise/:id` | Already has `?include_decisions=true` param path per Feature 5 spec |

### What is missing

- No public endpoint exposes `exercise_progression_decision` rows.
- `GET /api/day/:id/full` does not join decision data onto exercise rows.
- No week-level summary of Layer B decisions exists anywhere.
- Mobile client has no screen or component for adaptation context.

---

## 4. Data Model Reference

No schema changes required. The relevant columns on `exercise_progression_decision`:

```
decision_outcome          TEXT     -- "increase_load" | "increase_reps" | "increase_sets" | "reduce_rest" | "hold" | "deload_local"
primary_lever             TEXT     -- same enum
confidence                TEXT     -- "low" | "medium" | "high"
recommended_load_delta_kg NUMERIC  -- signed kg delta (positive = increase, negative = deload)
recommended_rep_delta     INT      -- signed rep delta
recommended_load_kg       NUMERIC  -- absolute target load for next session
recommended_reps_target   INT      -- absolute rep target for next session
evidence_summary_json     JSONB    -- { exposures_considered, successful_exposures, underperformance_exposures, latest_weight_kg, latest_reps, latest_rir, target_low, target_high }
decision_context_json     JSONB    -- { reasons: string[], source: string }
program_exercise_id       UUID     -- FK to program_exercise; joins to day full exercises
program_day_id            UUID     -- FK to program_day; used for week-level aggregation
created_at                TIMESTAMPTZ
```

And on `exercise_progression_state`:

```
last_outcome              TEXT
last_primary_lever        TEXT
progress_streak           INT      -- consecutive sessions where outcome was a progression lever
underperformance_streak   INT
confidence                TEXT
last_decided_at           TIMESTAMPTZ
```

---

## 5. Backend — Enrich `GET /api/day/:id/full`

### Change

When building the exercise list for a day, left-join the **most recent**
`exercise_progression_decision` row for each `program_exercise_id` where the decision
was made for the **current program** (same `program_id`).

### New field on each exercise object

```jsonc
{
  "program_exercise_id": "uuid",
  "exercise_name": "Barbell Back Squat",
  // ... existing fields ...
  "adaptation_decision": {
    "outcome": "increase_load",
    "primary_lever": "load",
    "confidence": "high",
    "recommended_load_kg": 92.5,
    "recommended_load_delta_kg": 5.0,
    "recommended_reps_target": null,
    "recommended_rep_delta": null,
    "display_chip": "Load increased ↑",
    "display_detail": "You hit all sets at or above your rep target with good RIR for 2 sessions in a row — time to add weight.",
    "decided_at": "2026-04-10T18:32:00Z"
  }
}
```

`adaptation_decision` is `null` when no Layer B decision exists for this exercise in
the current program.

### SQL (add to day full query)

```sql
LEFT JOIN LATERAL (
  SELECT
    epd.decision_outcome,
    epd.primary_lever,
    epd.confidence,
    epd.recommended_load_kg,
    epd.recommended_load_delta_kg,
    epd.recommended_reps_target,
    epd.recommended_rep_delta,
    epd.decision_context_json,
    epd.evidence_summary_json,
    epd.created_at AS decided_at
  FROM exercise_progression_decision epd
  WHERE epd.program_exercise_id = pe.id
    AND epd.user_id = $user_id
  ORDER BY epd.created_at DESC
  LIMIT 1
) epd ON TRUE
```

### `display_chip` and `display_detail` generation

These are server-generated strings, produced in the route handler (not in the client),
so all display logic lives in one place.

**`display_chip`** — short badge label (≤ 25 chars):

| `decision_outcome` | `display_chip` |
|--------------------|----------------|
| `increase_load` | `"Load increased ↑"` |
| `increase_reps` | `"Reps progressing ↑"` |
| `increase_sets` | `"Sets increasing ↑"` |
| `reduce_rest` | `"Rest reduced ↓"` |
| `hold` | `"Holding steady"` |
| `deload_local` | `"Deload this week"` |

**`display_detail`** — one-sentence expansion, built from the first entry of
`decision_context_json.reasons[]` passed through the sentence-normalisation rules
below. If `reasons[]` is empty or the context JSON is malformed, fall back to a
generic per-outcome string.

**Sentence normalisation rules** (applied in order):
1. Trim leading/trailing whitespace.
2. Ensure sentence ends with a period.
3. Cap at 160 characters; truncate to last full word + "…" if over.

**Generic fallbacks per outcome** (used when `reasons[]` is unavailable):

| `decision_outcome` | Generic fallback |
|--------------------|-----------------|
| `increase_load` | `"Your recent sessions hit the rep target comfortably — load has been increased."` |
| `increase_reps` | `"You are ready to push further into the rep range before the next load jump."` |
| `increase_sets` | `"Volume is increasing this session."` |
| `reduce_rest` | `"Rest periods are tightening as conditioning improves."` |
| `hold` | `"The current prescription stays the same — more data needed before changing."` |
| `deload_local` | `"Recent sessions showed signs of fatigue or underperformance — load is reduced to recover."` |

---

## 6. Backend — Week Insight Banner

### Change

Enrich `GET /api/program/:id/overview` (or add a dedicated sub-resource — see
trade-off below) with a `week_insight` string per week object.

### Recommended approach: enrich the overview response

Add `week_insight: string | null` to each element in the `weeks[]` array. For the
**current week only** (where `week_number === program.current_week`), compute the
insight from Layer B decisions. For completed weeks, compute from historical
decisions. For future weeks, return `null`.

### Insight generation algorithm

```
1. Query exercise_progression_decision WHERE program_id = $program_id
     AND program_day_id IN (SELECT id FROM program_day WHERE week_number = $week_number)
   ORDER BY created_at DESC
   -- take at most one decision per program_exercise_id (most recent)

2. Count by outcome:
     increase_count  = rows where outcome IN ('increase_load', 'increase_reps', 'increase_sets', 'reduce_rest')
     hold_count      = rows where outcome = 'hold'
     deload_count    = rows where outcome = 'deload_local'
     total           = increase_count + hold_count + deload_count

3. If total = 0: week_insight = null

4. Deload takes priority:
   If deload_count >= 1:
     week_insight = "This is a recovery week — {deload_count} exercise(s) showed signs of fatigue and have been dialled back."

5. Majority progression:
   If increase_count > hold_count:
     week_insight = "Progression week — {increase_count} of {total} exercises have been moved forward based on your logged effort."

6. Majority hold:
   If hold_count >= increase_count:
     If total <= 2:
       week_insight = "More data needed — keep logging to unlock your next progression step."
     Else:
       week_insight = "Consolidation week — your current loads are building a solid base before the next step up."

7. If still null: week_insight = null
```

### Trade-off note

If the overview endpoint is already expensive (large join set), the week insight query
can be extracted to `GET /api/program/:id/week/:week_number/insight` and fetched
lazily by the client. Prefer enriching the existing endpoint unless profiling shows it
causes a latency regression > 50ms.

---

## 7. Backend — New Endpoint: Decision History

### Route

```
GET /api/program-exercise/:id/decision-history
```

### Auth

Standard `userAuth` middleware. Validates that `program_exercise.program_id` belongs
to the requesting user's active program (via the user's `program_id`). Return 403 if
not.

### Query parameters

| Param | Default | Meaning |
|-------|---------|---------|
| `limit` | `20` | Max rows returned. Cap at `50`. |
| `offset` | `0` | Pagination offset. |

### SQL

```sql
SELECT
  epd.id,
  epd.decision_outcome,
  epd.primary_lever,
  epd.confidence,
  epd.recommended_load_kg,
  epd.recommended_load_delta_kg,
  epd.recommended_reps_target,
  epd.recommended_rep_delta,
  epd.evidence_summary_json,
  epd.decision_context_json,
  epd.created_at,
  pd.week_number,
  pd.day_number,
  pd.scheduled_date
FROM exercise_progression_decision epd
JOIN program_day pd ON pd.id = epd.program_day_id
JOIN program_exercise pe ON pe.id = epd.program_exercise_id
WHERE epd.program_exercise_id = $1
  AND epd.user_id = $2
ORDER BY epd.created_at DESC
LIMIT $3 OFFSET $4;
```

### Response shape

```jsonc
{
  "exercise_id": "barbell_back_squat",
  "exercise_name": "Barbell Back Squat",
  "total_decisions": 8,
  "decisions": [
    {
      "id": "uuid",
      "week_number": 6,
      "day_number": 1,
      "scheduled_date": "2026-04-10",
      "outcome": "increase_load",
      "primary_lever": "load",
      "confidence": "high",
      "recommended_load_kg": 92.5,
      "recommended_load_delta_kg": 5.0,
      "recommended_reps_target": null,
      "recommended_rep_delta": null,
      "display_label": "Week 6 — Added 5 kg",
      "display_reason": "You hit all sets at the top of your rep range with good RIR for 2 sessions in a row.",
      "evidence": {
        "exposures_considered": 3,
        "successful_exposures": 2,
        "latest_weight_kg": 87.5,
        "latest_reps": 5,
        "latest_rir": 2.5,
        "target_low": 4,
        "target_high": 6
      },
      "decided_at": "2026-04-10T18:32:00Z"
    }
  ]
}
```

### `display_label` generation

Format: `"Week {N} — {action_phrase}"`

| `decision_outcome` | `recommended_load_delta_kg` | `display_label` |
|--------------------|-----------------------------|-----------------|
| `increase_load` | 5.0 | `"Week 6 — Added 5 kg"` |
| `increase_load` | 2.5 | `"Week 6 — Added 2.5 kg"` |
| `increase_reps` | — | `"Week 6 — Rep target increased"` |
| `increase_sets` | — | `"Week 6 — Set added"` |
| `reduce_rest` | — | `"Week 6 — Rest reduced"` |
| `hold` | — | `"Week 6 — Held steady"` |
| `deload_local` | -4.375 | `"Week 6 — Load reduced (deload)"` |

### `display_reason` generation

Take `decision_context_json.reasons[0]`, apply sentence normalisation rules (Section
5). If empty, use the generic fallback from Section 5.

---

## 8. Mobile UI

> The mobile app is in a separate repository. This section specifies the UI contract
> and component behaviour; implementation is driven by the mobile team against these
> API shapes.

### 8.1 Exercise-Level Adaptation Chip (Day Detail)

**When to show:** `adaptation_decision !== null` AND `outcome !== "hold"`.
The `hold` outcome is intentionally suppressed at the chip level — it is not
actionable and clutters the card. It is still visible in the decision history screen.

**Chip placement:** Below the exercise name and above the set/rep prescription line on
the exercise card in Day Detail.

**Chip appearance:**

| Outcome | Chip text | Chip colour |
|---------|-----------|-------------|
| `increase_load` | `"Load increased ↑"` | Green (positive) |
| `increase_reps` | `"Reps progressing ↑"` | Green (positive) |
| `increase_sets` | `"Sets increasing ↑"` | Green (positive) |
| `reduce_rest` | `"Rest reduced ↓"` | Blue (neutral-positive) |
| `deload_local` | `"Deload this week"` | Amber (caution) |

**Tap interaction:** Expand an inline detail card beneath the chip showing:
- `display_detail` string (the why)
- Confidence label: `"Confidence: High"` / `"Medium"` / `"Low"`
- A `"View full history →"` link that navigates to the Decision History screen for
  this exercise.

**Collapse:** Tap the chip again, or tap anywhere outside the detail card.

---

### 8.2 Week Insight Banner (Program Overview / Week View)

**When to show:** `week_insight !== null` for the displayed week.

**Placement:** Sticky card at the top of the week section in Program Overview, above
the day list. Does not appear in future weeks (where `week_insight = null`).

**Appearance:**
- Single card with a small icon indicating the dominant outcome type:
  - Deload weeks: flame-down icon, amber background.
  - Progression weeks: arrow-up icon, green background.
  - Consolidation weeks: lock icon, neutral background.
- One-line insight text from `week_insight`.
- Dismissible for the current session (state stored in local component, not persisted
  — reappears on next app open).

---

### 8.3 Decision History Screen

**Navigation path:** Day Detail → exercise chip → "View full history →" OR a long-
press context menu on any exercise card that has decision history.

**Screen name:** `ExerciseDecisionHistoryScreen`

**Header:** Exercise name. Back button returns to Day Detail.

**Content:** Vertical timeline list, one row per decision, newest first.

**Row layout:**

```
[Week label]  [Outcome chip small]
[display_label]
[display_reason]                      [confidence badge]
────────────────────────────────────
```

Example row:
```
Week 6 · Mon 10 Apr    [Load ↑]
Added 5 kg — now 92.5 kg
You hit the top of your rep range with good RIR for 2 sessions.   [High]
```

**Empty state:** `"No adaptation decisions yet. Keep logging sessions to unlock
personalised progression."` (shown when `decisions.length === 0`).

**Pagination:** Fetch `limit=20`. Show a "Load more" button when `total_decisions >
decisions.length`.

**Evidence detail (optional, Phase 2):** A chevron on each row expands a secondary
panel showing the raw evidence:
```
Based on: 3 sessions · 2 successful · Latest: 87.5 kg × 5 reps · RIR 2.5
```
Values sourced from the `evidence` object in the API response.

---

## 9. Outcome Display Rules — Complete Reference

This table is the single source of truth for all text generation in both the API
(display_chip, display_detail, display_label, display_reason) and client UI.

### Chip text and colour

| Outcome | Chip text | UI colour semantic |
|---------|-----------|-------------------|
| `increase_load` | `"Load increased ↑"` | `success` |
| `increase_reps` | `"Reps progressing ↑"` | `success` |
| `increase_sets` | `"Sets increasing ↑"` | `success` |
| `reduce_rest` | `"Rest reduced ↓"` | `info` |
| `hold` | *(not shown in chip)* | — |
| `deload_local` | `"Deload this week"` | `warning` |

### History screen label phrase (`"Week N — {phrase}"`)

| Outcome | Load delta available? | Phrase |
|---------|----------------------|--------|
| `increase_load` | Yes | `"Added {delta} kg"` |
| `increase_load` | No | `"Load increased"` |
| `increase_reps` | — | `"Rep target increased"` |
| `increase_sets` | — | `"Set added"` |
| `reduce_rest` | — | `"Rest reduced"` |
| `hold` | — | `"Held steady"` |
| `deload_local` | — | `"Load reduced (deload)"` |

### Week insight icon

| Dominant outcome | Icon | Background |
|-----------------|------|-----------|
| Any `deload_local` | Flame-down | Amber |
| `increase_*` majority | Arrow-up | Green |
| `hold` majority | Lock | Neutral grey |

---

## 10. Implementation Phases

Feature 6 can be delivered incrementally. Each phase is independently deployable.

### Phase 1 — Backend only (no visible user impact)

1. Add the lateral join + `adaptation_decision` object to `GET /api/day/:id/full`.
   Return `display_chip` and `display_detail` strings from the server.
2. Add `GET /api/program-exercise/:id/decision-history` endpoint with pagination.

**Deliverable:** API ready. Admin can validate decision data in the browser.

### Phase 2 — Exercise chip (Day Detail)

Implement the adaptation chip component in the mobile app's exercise card. Wire to
the `adaptation_decision` field from Phase 1. Tap expands inline detail.

**Deliverable:** Athletes see "Load increased ↑" chips on relevant exercises.

### Phase 3 — Decision history screen

Implement `ExerciseDecisionHistoryScreen`, wired to the new history endpoint. Navigate
from the chip's "View full history →" link.

**Deliverable:** Athletes can view their full adaptation audit trail per exercise.

### Phase 4 — Week insight banner

Add `week_insight` computation to `GET /api/program/:id/overview`. Implement the
banner component in Program Overview.

**Deliverable:** Athletes see the week-level narrative ("Progression week — 4 of 6
exercises moved forward").

### Phase 5 — Evidence detail (optional)

Add the expandable evidence row in `ExerciseDecisionHistoryScreen`. Low priority —
useful for power users but not required for the core trust narrative.

---

## 11. Dependencies

| Dependency | Status | Impact if absent |
|-----------|--------|-----------------|
| `exercise_progression_decision` table (V60) | **Shipped** | Feature 6 cannot function |
| Layer B trigger in `PATCH /api/day/:id/complete` (Feature 1 partial) | **Planned** | No decision rows are written; all adaptation chips show null. Phase 1 and 2 can ship with dummy data in dev |
| Layer C — Step 07 (Feature 1 full) | **Planned** | Decisions exist but are not applied to prescriptions. Chips can still show "Load increased ↑" — the prescription still reflects it via the state row |
| `GET /api/day/:id/full` route | **Shipped** | Phase 2 enrichment target |
| `GET /api/program/:id/overview` route | **Shipped** | Phase 4 enrichment target |

Feature 6 is **not blocked** by Feature 1 being complete. The decision rows are
already being written in development (the service is wired in the decision service
tests). Phase 1 (backend enrichment) can ship now. The chips will populate
progressively as Layer B decisions accumulate.

---

## 12. Testing

### Backend unit tests

File: `api/src/routes/__tests__/adaptationTransparency.test.js`

| Test | What it validates |
|------|------------------|
| `GET /api/day/:id/full` returns `adaptation_decision: null` when no decisions exist | Null safety |
| `GET /api/day/:id/full` returns correct chip/detail strings for each outcome type | Display text generation |
| `GET /api/program-exercise/:id/decision-history` returns decisions newest-first | Sort order |
| `GET /api/program-exercise/:id/decision-history` respects `limit` and `offset` | Pagination |
| `GET /api/program-exercise/:id/decision-history` returns 403 for wrong user | Auth isolation |
| `display_label` formats load delta correctly for 2.5 kg and 5 kg increments | Label generation |
| `display_reason` falls back to generic string when `reasons[]` is empty | Fallback |
| Week insight returns `null` for weeks with no decisions | Null safety |
| Week insight returns deload string when any deload_local present | Deload priority |
| Week insight returns progression string when increase_count > hold_count | Progression path |

### Integration test

Seed a completed `program_day` with 3 `exercise_progression_decision` rows (one
`increase_load`, one `hold`, one `deload_local`). Call `GET /api/day/:id/full` and
assert all three exercises return the correct `adaptation_decision` shape.

---

## 13. Out of Scope

- **LLM-generated explanations.** All text is deterministic server-side generation.
- **Sharing decision screenshots.** That belongs to Feature 5 (PR timeline shareable
  cards).
- **Coach overrides.** Feature 9.
- **Push notification for deload acknowledgment.** Feature 7.
- **Admin panel decision debugger.** That is the admin progression sandbox (already
  specced in `docs/spec-admin-preview-progression-tab.md`).
- **Cross-exercise fatigue modeling.** The week insight is a simple count-based
  summary, not a fatigue model.
