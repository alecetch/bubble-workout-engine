# Vision and Roadmap

## Vision Statement

**Formai is an intelligent training engine that generates genuinely personalized workout programs for recreational athletes and automatically adapts load, volume, and intensity based on actual performance — making evidence-based progressive overload accessible without a personal trainer.**

The system already has a strong foundation: a config-driven six-step generation pipeline, a three-layer progression architecture, an equipment-aware exercise catalogue with 83 exercises, workout logging with history and PRs, anchor lift capture for cold-start load estimation, and a deployed production API with CI gating. The generation layer is complete. The adaptation layer is architecturally designed but not fully closed. The athlete-facing experience layer has the right data model but is missing the UX loops that make the adaptation tangible and sticky.

Closing those three gaps — adaptation, experience, and lifecycle — is what takes this from "impressive engine with a thin client" to "a product that can replace a personal trainer for most recreational athletes."

---

## The 10 Most Important Features

### Feature 1 — Close the Adaptation Loop (Layer C Step 07 + Layer B Session Trigger)

**Priority: Critical. This is the single most important feature.**

**Why:** The entire three-layer progression architecture exists to produce athlete-responsive programs. Layer A (structural) runs. Layer B (decision engine, `progressionDecisionService`) is fully built but the post-session trigger that fires it is still "planned" per the architecture doc. Layer C (Step 07 — applying decisions to the emitted prescription) is also still "planned." Without these two wires connected, no athlete-specific adaptation ever reaches a workout. The anchor lift capture, estimation families, guideline loads, progression state tables, and decision audit log are all inert until this loop closes.

**Spec:**
1. **Layer B trigger**: In `PATCH /api/day/:id/complete`, after `program_day.is_completed` is set to `TRUE`, call `progressionDecisionService.runForDay(dayId, userId)` as a non-blocking post-commit side effect. This gathers history for each exercise on the completed day and writes to `exercise_progression_state` + `exercise_progression_decision`.
2. **Layer C (Step 07)**: Implement `07_applyExerciseProgressionOverrides.js` as specified in the architecture. Reads `exercise_progression_state` rows for the user + program type, matches each emitted `EX` row by `progression_key`, and applies `recommended_load_delta_kg`, `recommended_rep_delta`, `recommended_set_delta`, `recommended_rest_delta_sec`. Respects scheduled deload weeks from Step 03. Skips gracefully when no state row exists.
3. **Config activation**: Set `decision_engine_version: "v2"` in `strength_default_v1` first for controlled rollout. Hypertrophy follows once validated.
4. **Admin preview**: The progression preview tab (spec at `docs/spec-admin-preview-progression-tab.md`) is the test tool for this. Implement and use it to validate Layer B decisions before wiring Layer C.

---

### Feature 2 — Session UX: Rest Timer and Set-by-Set Completion Flow

**Priority: High. Without this, the workout logging experience is fragile and passive.**

**Why:** The data model already encodes `rest_seconds` per exercise, set counts, rep ranges, tempo, and RIR targets. But the mobile client has no active in-session UX loop. Users log sets after the fact rather than being guided through them in real time. This means rest periods are ignored, RIR data is unreliable (logged retrospectively), and the quality of Layer B's history inputs degrades. The adaptation engine is only as good as the data it receives.

**Spec:**
1. **Session screen** (`WorkoutSessionScreen`): Enter a day from the day view into an "active session" mode. Exercises presented one at a time (or scrollable with current set highlighted).
2. **Set completion flow**: Tap to complete each set. Prompt for reps actually completed and optional RIR. Pre-fill with the prescribed values so accurate athletes can confirm in one tap.
3. **Rest timer**: Countdown using the `rest_seconds` value from the exercise prescription. Visual ring timer with skip option. Push notification fallback when app is backgrounded.
4. **Session summary**: On final set of final exercise, show a session summary: volume load, estimated 1RMs hit, any PRs. Triggers `PATCH /api/day/:id/complete` on dismiss (which fires Layer B).
5. No changes to the logging API — `POST /api/segment-log` already supports the required fields.

---

### Feature 3 — Exercise Substitution (Day-of Swap)

**Priority: High. A core UX need in every real training app.**

**Why:** Users skip exercises they don't have equipment for that day, dislike, or are nursing an injury through. Without a swap mechanism, the program becomes prescriptive and brittle. The swap group system (`sw`, `sw2`, `swAny`) already encodes semantically equivalent substitutes. The day view already has the exercise data. What's missing is a swap endpoint and UI.

**Spec:**
1. **API**: `POST /api/program-exercise/:id/swap` — runs the slot selection logic for the same slot definition but excludes the current exercise and any already-used exercises in the day. Returns the selected substitute. Writes the substitution to `program_exercise` (update `exercise_id`) and logs the original in a new `substitution_reason` column (optional text).
2. **Swap pool**: Re-use `getAllowedExercises` scoped to the user's equipment + rank. Score with the original slot's `sw`, `sw2`, `mp`, `requirePref` to ensure semantic equivalence.
3. **Mobile UI**: Long-press or three-dot menu on an exercise card opens a "Swap" option. Shows 2–3 alternatives with their names and a brief rationale ("Same movement pattern, dumbbell variant"). User confirms.
4. **Constraints**: Substitutions do not affect progression state for the original exercise — the new exercise creates its own progression key. A swap within a session does not retroactively reset guideline loads.

---

### Feature 4 — Program Lifecycle: End-of-Program Re-enrollment

**Priority: High. Without this, the product has a hard cliff at week 12.**

**Why:** A 12-week program ends. What happens? Currently nothing — the user sees their completed program and has no guided path forward. The natural next step (start a new program) should carry forward their progression state, anchor lifts, and optionally offer an increased difficulty tier. If this flow is absent, users churn at program completion.

**Spec:**
1. **Completion detection**: The history API already tracks program completion status. Add a `GET /api/program/:id/completion-summary` endpoint that returns: weeks completed, PRs achieved, average progression confidence, suggested next difficulty tier (current rank or rank+1 based on Layer B outcomes).
2. **Re-enrollment flow**: Mobile "Your program is complete" screen with three options: `Start a new program (same settings)`, `Progress to next level`, `Change goals`. Each option pre-fills the onboarding with the appropriate values.
3. **Progression continuity**: On `POST /api/generate-plan-v2`, if the user has `exercise_progression_state` rows from a prior program of the same type, carry them forward as the initial state for the new program. New exercises start from guideline loads; returning exercises start from their last known state.
4. **No migration needed** — `exercise_progression_state` is already keyed by `user_id + progression_key + program_type`. State persists across program generations naturally.

---

### Feature 5 — Progress Visualization

**Priority: High. Data without insight is noise.**

**Why:** The history API is comprehensive: 1RM estimates, PR feed, timeline, per-exercise history, session metrics. But without visualizing the trend — is my squat going up? am I progressing faster on upper body than lower? — the data is invisible to the athlete. Progress visualization is a primary retention driver and the most direct proof that the adaptation engine is working.

**Spec:**
1. **Strength trend chart** (`GET /api/v1/history/exercise/:id`): Line chart of estimated 1RM over time per exercise. 12-week window by default, pinch-to-zoom. Overlay: progression decision outcomes (load increased, hold, deload) as coloured points.
2. **Volume load trend**: Weekly volume load (sets × reps × weight) per muscle group (upper/lower/full body) over the last 8 weeks. Bar chart. Shows whether weekly training load is trending correctly.
3. **PRs timeline** (`GET /api/prs-feed`): Redesign as a vertical timeline with medal icons, not just a list. Shareable screenshot card.
4. **Session summary card**: After each completed session, show a summary card: "You lifted X total kg today across N exercises. You hit a PR on Y." This is the micro-feedback loop that makes progression feel tangible.
5. No new API routes needed — all data is already available from existing history endpoints.

---

### Feature 6 — Adaptation Transparency ("Why is my program changing?")

**Priority: Medium-high. Trust in the engine depends on explainability.**

**Why:** When a user's prescribed load increases, or a deload week fires, or their rep range shifts, they need to understand why. Without explanation, adaptation feels arbitrary and undermines trust. Layer B already produces `reasons[]` per decision and writes an audit log to `exercise_progression_decision`. The mobile client doesn't surface any of this.

**Spec:**
1. **Exercise-level context chip**: On the day view, for exercises where a Layer B decision applied this week, show a small chip: "Load increased ↑" / "Deload week" / "Reps progressing". Tap expands to a brief explanation drawn from `reasons[]` in the decision.
2. **Week insight banner**: At the top of each week view, a one-sentence insight: "This is a deload week — your recent sessions showed signs of accumulated fatigue on 3 exercises." Generated by summarising Layer B decisions across the week, not by an LLM (deterministic logic based on outcome types).
3. **Decision history screen**: Per exercise, a scrollable list of past decisions: "Week 6 — Added 2.5kg (you hit all sets with RIR ≥ 2 for two sessions)". This is the human-readable audit log.
4. **API**: Add `GET /api/program-exercise/:id/decision-history` that returns the last N rows from `exercise_progression_decision` for the user + progression_key.

---

### Feature 7 — Push Notifications and Engagement Hooks

**Priority: Medium. Retention without push is passive.**

**Why:** Users forget to train. A workout reminder sent 30 minutes before a scheduled session — derived from the calendar coverage rows already in the DB — can meaningfully increase completion rates. PR celebrations sent immediately after a session create a positive feedback loop. The existing email infrastructure (Resend) can be leveraged for this, and a proper push notification service (Expo Notifications) is a one-time integration.

**Spec:**
1. **Push token registration**: Add `device_push_token` column to `app_user`. Mobile registers on first app open via Expo Notifications and sends to a new `PATCH /api/users/me/push-token` endpoint.
2. **Workout reminders**: A daily cron (or Fly.io scheduled task) queries `program_calendar` for sessions scheduled today, cross-references users with push tokens, and sends "Your [Day Type] workout is ready" at a user-configurable time (default: 8am).
3. **PR notifications**: In the `POST /api/segment-log` handler, after writing to `estimated_1rm`, check if the new 1RM exceeds the historical max for this exercise. If so, enqueue a push: "New PR! You hit a [exercise name] 1RM of [X]kg."
4. **Deload acknowledgment**: When Layer B triggers `deload_local`, send "Easy week incoming — your body needs it. Here's why." Drives the adaptation transparency narrative.
5. **Email fallback**: For users without push tokens, the same events are emailable via the existing email abstraction.

---

### Feature 8 — Multi-Program / Concurrent Training Goals

**Priority: Medium. Unlocks a wider athlete profile.**

**Why:** Many intermediate-to-advanced athletes run concurrent programs: a primary strength block alongside 2 conditioning sessions per week, or a hypertrophy program with a weekly Hyrox benchmark. The current architecture is one active program per user. The exercise catalogue and generation pipeline already support all four program types. Extending to concurrent programs primarily requires data model and scheduling changes, not engine changes.

**Spec:**
1. **Data model**: Add `is_primary BOOLEAN DEFAULT true` to `program`. Allow multiple active programs per user if they have different `program_type` values. `program_calendar` is already keyed by `(user_id, scheduled_date)` — enforce no same-date conflicts between concurrent programs.
2. **Day view**: Calendar shows sessions from all active programs by day. Color-coded by program type. Tapping a day with multiple sessions shows both.
3. **Generation**: `POST /api/generate-plan-v2` with a different `programType` than the user's current primary creates a secondary program. Days are scheduled to avoid conflicts with the primary program's preferred days.
4. **Progression independence**: `exercise_progression_state` is already keyed by `program_type` — concurrent programs track progression independently.
5. **No cross-program fatigue model** — out of scope for this feature. This is scheduling + multi-program UI only.

---

### Feature 9 — Coach / Trainer Portal

**Priority: Medium. Unlocks the B2B use case.**

**Why:** The engine is strong enough that a coach could use it to manage multiple athletes. Currently the admin panel is self-use only and operates on a single global state. A coach-facing portal — where a trainer can view client profiles, their active programs, recent session logs, and Layer B decision history — would let the product serve a B2B segment without changing the core generation or adaptation logic.

**Spec:**
1. **Coach role**: Add `role ENUM('athlete', 'coach') DEFAULT 'athlete'` to `app_user`. Coaches are provisioned by admin.
2. **Coach → client relationship**: New table `coach_client` (`coach_user_id`, `client_user_id`, FK constraints). Coaches can invite clients via a shareable link that creates the relationship on the client's first sign-in.
3. **Coach portal routes**: `GET /api/coach/clients` — list all linked clients with their active program, last session date, and streak. `GET /api/coach/clients/:id/overview` — same as the athlete's own program overview. `GET /api/coach/clients/:id/decisions` — Layer B decision history across all exercises.
4. **Override capability**: `POST /api/coach/clients/:id/progression-override` — allows a coach to manually set a recommended load for a specific exercise, bypassing Layer B's automatic decision for the next session only. Writes a synthetic row to `exercise_progression_state` with `source: "coach_override"`.
5. **Admin panel**: Extend the existing `/admin` panel with a coach management tab. Assign coaches, link clients, view coach activity.

---

### Feature 10 — Advanced Onboarding: Fitness Test Mode and Training History Import

**Priority: Medium. Improves cold-start quality for users without known working weights.**

**Why:** Step 2b anchor lift capture works well for athletes who know their working weights. But many recreational athletes — especially those returning after a break or new to structured training — don't know what weight to enter. "What's your working weight for a squat?" often produces a blank stare or a wildly wrong number. A structured fitness test alternative, or the ability to import prior training history (CSV from MyFitnessPal, Hevy, Strong), would dramatically improve the quality of the initial guideline loads and Layer B's first decisions.

**Spec:**
1. **Fitness test mode**: Replace the anchor lift kg/reps input with a guided test for each family: "Do 5 reps with a weight you can comfortably complete. Log the weight." The onboarding Step 2b screen adds a "Test mode" toggle. Test mode shows one exercise at a time with timer and a load input. Submits as anchor lifts at the end. No additional API changes needed — the result is the same `AnchorLiftEntry[]` shape.
2. **History import (CSV)**: Add `POST /api/import/training-history` that accepts a CSV upload from Hevy (the most popular simple training logger). Parser extracts exercise name, date, weight, and reps. Maps exercise names to `estimation_family` via a fuzzy lookup table (seeded in DB). Derives anchor lifts as the max working set per family in the last 90 days. Writes to `client_anchor_lift` as a batch. No UI changes to the generation pipeline — the anchor lifts feed directly into the existing guideline load system.
3. **"I don't know" path improvement**: For users who skip all anchor lifts, derive initial guideline loads from fitness rank defaults rather than leaving `guidelineLoad.value = 0`. Add rank-based default loads to `exercise_load_estimation_family_config` (e.g. beginner squat default = 40kg, intermediate = 80kg). This ensures every user gets a sensible starting point even with zero history.

---

## Summary Table

| # | Feature | Priority | What it closes |
|---|---|---|---|
| 1 | Layer C + Layer B session trigger | **Critical** | Adaptation loop — the engine's core promise |
| 2 | Session UX: rest timer + set-by-set flow | **High** | Data quality for Layer B; user experience during workouts |
| 3 | Exercise substitution | **High** | Flexibility within sessions; programme adherence |
| 4 | Program lifecycle + re-enrollment | **High** | Retention cliff at program completion |
| 5 | Progress visualization | **High** | Proof the engine is working; primary retention driver |
| 6 | Adaptation transparency | **Medium-High** | Trust in automatic changes; explainability |
| 7 | Push notifications + engagement hooks | **Medium** | Passive retention; PR celebration loop |
| 8 | Multi-program / concurrent training | **Medium** | Wider athlete profile; advanced users |
| 9 | Coach / trainer portal | **Medium** | B2B use case; managed athletes |
| 10 | Advanced onboarding (fitness test + import) | **Medium** | Cold-start quality; onboarding for users without history |

Features 1–5 are the path to a complete, trustworthy product. Features 6–10 are the path to a differentiated, commercially viable one.
