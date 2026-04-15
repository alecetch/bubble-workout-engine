# Next 10 Features — Formai Roadmap (Round 2)

## Context and Assumptions

This document was produced after reviewing the full codebase, all existing specs, open technical debt tickets, and the following inputs:

- Primary target: **Hyrox competition athletes**, then intermediate/advanced aesthetic-focused athletes
- Monetization: **trial period → paid subscription** (not freemium with artificial limits), with B2B coach revenue as a second channel
- Platform: **mobile-first**, with a web coach portal as a longer-term target
- Known friction: post-onboarding navigation is confusing; UI lacks visual excitement; "Generate Program" appears even after a program has started
- Integrations of interest: Apple Health (simple to justify), OpenAI Vision (physique feature), no others committed
- Cycle scope: comparable to the first 10-feature cycle (mix of medium and large features)

### Open technical debt resolved in this cycle

The following items from existing tickets should be closed as part of this cycle, either as standalone work or folded into the relevant feature:

| Item | Ticket | Action |
|------|--------|--------|
| Narration NULL priority collision bug | `ticket-maturity-gap-close.md` Gap 1 | **Fix immediately** — high priority silent production bug |
| `console.log` in `OnboardingEntry.tsx` | `ticket-maturity-gap-close.md` Gap 2 | Fix with Feature 1 (home screen work touches this file) |
| Mobile Tier 2 component tests (Jest stack) | `ticket-maturity-9.md` Gap 1 | Fix with Feature 1 sprint |
| Exercise catalogue duplicate IDs | `exercise-catalogue-duplicate-cleanup-plan.md` | Addressed in Feature 7 |
| `bubble_user_id` rename | `ticket-rename-bubble-user-id.md` | Low priority — fold into a maintenance sprint |
| Sentry alert policies | `ticket-maturity-9.md` Gap 2 | Dashboard config — resolve independently in one session |

---

## Summary Table

| # | Feature | Priority | What it delivers |
|---|---------|----------|-----------------|
| 1 | Post-onboarding UX overhaul | **Critical** | Fixes the known navigation confusion; makes the daily experience feel like a living product |
| 2 | Visual design refresh + micro-interaction polish | **High** | App Store appeal, retention, differentiates from generic fitness apps |
| 3 | Monetization: trial period + subscription | **High** | Revenue. Without this, nothing else matters commercially |
| 4 | Physique progress tracking with AI vision | **High** | Most differentiated feature; directly enables the aesthetic athlete segment |
| 5 | Hyrox conditioning progression | **High** | Core promise delivered for the primary target user segment |
| 6 | Apple Health integration | **Medium-High** | Standard expectation for serious iOS athletes; passive Layer B signal enrichment |
| 7 | Exercise catalogue deduplication + content expansion | **Medium-High** | Unblocks all technique content features; fixes silent data quality issues |
| 8 | In-app technique guidance and exercise demos | **Medium** | Reduces injury risk; improves form; improves RIR data quality for Layer B |
| 9 | Social sharing and viral loops | **Medium** | Organic acquisition; positive reinforcement loop; ties into PR infrastructure already built |
| 10 | Goal refresh and mid-program adjustment | **Medium** | Prevents the "program no longer fits me" churn; shows the app adapts to the user over time |

Features 1–3 are prerequisites for a commercially viable product. Features 4–6 define the competitive position. Features 7–10 compound the retention and quality gains from the first cycle.

---

## Feature 1 — Post-Onboarding UX Overhaul

**Priority: Critical. The product currently works but does not feel guided after the first session.**

### Why

You noted two specific issues: (1) the "Generate Program" button remains prominently visible after a program has started, which actively encourages the wrong behaviour; (2) the home screen doesn't clearly orient the user around their current workout. Both symptoms point to the same root cause: the home screen has a static layout that doesn't adapt to the user's lifecycle state.

A fitness app's home screen is used daily. If it doesn't answer "what should I do today?" in one glance, the app feels passive. Every competitor that retains users (Whoop, Strava, Garner) has a home screen that greets the user with context-aware content.

Additionally, the `OnboardingEntry.tsx` still contains debug `console.log` calls that should have been removed.

### Spec

1. **Lifecycle-aware home screen**: Refactor `ProgramDashboardScreen` (or the Program tab root) to render one of four clearly distinct states:
   - `no_program` — no active program; show onboarding / generate CTA
   - `today_scheduled` — today is a training day; show today's workout card prominently with a "Start" CTA, streak, and upcoming day preview
   - `today_rest` — rest day; show recovery tips, upcoming scheduled day, streak
   - `program_complete` — active program is done; show the completion summary and re-enrollment CTA (Feature 4 already handles this — surface it here)

2. **Today workout card**: A prominent card on the home screen showing today's day label, type (e.g. "Lower Body — Strength"), estimated duration, and a single "Start Workout" CTA. This replaces the current calendar-first layout as the primary surface.

3. **Hide / replace "Generate Program" during active program**: When `status = 'active'` and `is_ready = TRUE`, the generate CTA should either disappear entirely or become a contextual "Not seeing the right program? Adjust settings" secondary link. The primary CTA must always be the current workout.

4. **Week progress indicator**: Show "Week N of M — X of Y days done this week" inline on the home screen. This gives the user a sense of progress without navigating to the calendar.

5. **Clean up `OnboardingEntry.tsx`**: Remove all `[boot:*]` console.log calls as specified in `ticket-maturity-gap-close.md`.

6. **Mobile component test coverage**: Install Jest + `@testing-library/react-native` and write Tier 2 tests as specified in `ticket-maturity-9.md`, covering `fromProfile`, `resumeLogic`, `validators`, and `GuidelineLoadHint` rendering.

---

## Feature 2 — Visual Design Refresh and Micro-Interaction Polish

**Priority: High. You said the UI isn't very exciting. This is worth fixing early, not late.**

### Why

Fitness is an emotional category. The app competes for attention against apps with strong visual identity (Whoop's glowing ring, Strava's athlete community feel, Garner's premium dark UI). First-session visual impression drives trial conversion. Daily-use visual quality drives retention. Right now the UI is functional and clean but lacks the visual energy that makes athletes want to open it.

This is not a full redesign. It is a focused polish pass on the components that users touch every day.

### Scope

This feature does not change navigation or data — it changes how existing data is presented. The existing component library (`colors.ts`, `typography.ts`, `spacing.ts`, `components.ts`) provides the foundation; this feature extends it.

### Spec

1. **Hero images and gradient overlays**: The `HeroHeader` on day and program screens already shows media assets. Improve this with a gradient overlay that allows text to sit over the image legibly, and animate the transition when entering the screen (fade-in rather than instant render).

2. **Animated progress rings on the home screen**: Use the existing `RingTimer` ring geometry for the week progress indicator and program completion percentage. A 120 px ring showing "Week 4 — 67% complete" is more emotionally engaging than a text line.

3. **Set completion micro-animations**: When a set is logged, add a brief success animation (green checkmark, subtle scale pulse) on the segment card. This is the primary positive feedback event in the app and currently has no celebration.

4. **PR celebration animation**: When the session summary detects a PR, show a full-screen moment (2–3 seconds): large medal icon, exercise name, new 1RM, with a haptic burst. Currently the PR push notification fires server-side but the in-app moment is absent.

5. **Skeleton loading states**: Replace the `ActivityIndicator` spinner on `ProgramDayScreen` and `ProgramDashboardScreen` with skeleton placeholders that match the layout of the content being loaded. Reduces perceived load time.

6. **Typography refinement**: Audit and tighten line heights, letter spacing, and heading sizes across day view and history screens. The current `typography.ts` values are functional but undifferentiated — introduce 1–2 display-weight headline variants for hero moments (PR, completion, week done).

7. **Streak and gamification micro-copy**: On the home screen, replace neutral copy with slightly more motivational variants that vary based on streak length. A 7-day streak deserves a different message than day 1.

### What this is not

This is not a full design system rebuild. Colour palette, component structure, and navigation architecture are not changed. The goal is polish, not redesign.

---

## Feature 3 — Monetization: Trial Period and Subscription

**Priority: High. Without this, the product cannot generate revenue.**

### Why

You favour a trial period over a freemium model with limited features — that is the right call for a training app. Artificial feature limits (e.g., "only 1 program on the free tier") frustrate serious athletes and create perverse incentives. A full-featured trial that converts on trust is more aligned with the product's promise.

### Monetization opinion

I'd recommend a **14-day free trial → subscription** with a single tier at launch. The B2B coach portal revenue channel is real but should come after the consumer product is converting — a separate coach seat pricing model is easier to add once you know the consumer price sensitivity. My recommendation: launch consumer first, B2B 1–2 cycles later, when Feature 9 (coach portal) ships its web interface.

The trial should be gated at the paywall screen before first program generation. Users who complete onboarding but don't subscribe should be able to complete the questionnaire and see a program preview (the first week), but not execute sessions.

### Spec

1. **RevenueCat integration**: Use [RevenueCat](https://www.revenuecat.com/) as the subscription middleware layer. It abstracts Apple StoreKit + Google Play Billing, handles receipt validation, and exposes a simple `isActive: boolean` entitlement flag in the mobile client. This is the standard choice — avoids raw StoreKit complexity and handles restoration, billing retries, and analytics out of the box.

2. **Paywall screen** (`PaywallScreen`): Shown after onboarding completion, before first program generation. Displays:
   - 14-day trial CTA (primary)
   - Subscription price/period (monthly and/or annual)
   - 3–4 benefit bullets (personalised progression, Hyrox-specific programming, coach oversight, etc.)
   - "Restore purchase" link
   - No visible "skip" — the trial IS the entry path

3. **Entitlement guard**: Add a `useEntitlement()` hook that checks RevenueCat's customer info. Any premium screen (ProgramDayScreen, HistoryScreen, etc.) wraps in an entitlement check. If the trial has expired and no subscription is active, redirect to `PaywallScreen`.

4. **Trial expiry re-engagement**: 3 days before trial expires, trigger a push notification (Feature 7 infrastructure already exists): "Your trial ends in 3 days — keep your progress going." On expiry day: one final push + in-app modal on next open.

5. **Backend entitlement validation**: Store subscription status on `app_user` (`subscription_status TEXT`, `trial_expires_at TIMESTAMPTZ`, `subscription_expires_at TIMESTAMPTZ`). RevenueCat webhooks update this via a new `POST /api/webhooks/revenuecat` endpoint (internal-token protected). This allows server-side features (coach portal, generation limits) to check entitlement without a client round-trip.

6. **Admin visibility**: Add subscription status to the admin panel user list so support can inspect a user's state.

### What to gate vs. what to leave open

| Feature | Trial | Paid |
|---------|-------|------|
| Onboarding + profile creation | ✓ | ✓ |
| Program generation (first program) | ✓ | ✓ |
| Session logging | ✓ | ✓ |
| History and PRs | ✓ | ✓ |
| Additional program generations | First 14 days | ✓ |
| Multi-program (Feature 8) | ✗ | ✓ |
| Coach portal access (Feature 9) | ✗ | ✓ (or add-on) |
| Physique tracking (Feature 4) | ✓ during trial | ✓ |

---

## Feature 4 — Physique Progress Tracking with AI Vision

**Priority: High. This is the most differentiated feature in the roadmap.**

### Why

Hyrox athletes and aesthetic-focused intermediate athletes are both highly visual about their progress. "Is my body changing?" is a question they ask every week, but no training app answers it well. Most apps show numbers (weight, 1RM) but not visual change over time. An AI-powered physique assessment that:

- tracks weekly photo submissions
- gives qualitative feedback ("your shoulder-to-waist ratio has improved", "you've added visible upper back width")
- maps visual observations to program emphasis adjustments ("consider adding lateral raises to your next program")

...creates a weekly engagement ritual that goes far beyond workout logging and directly enables the aesthetic athlete segment you want to capture.

### Privacy-first design

Body photos are sensitive. The privacy model must be explicit:

- Photos are stored encrypted in S3 with user-controlled deletion
- Photos never leave the user's account
- AI analysis is sent to OpenAI Vision API and the result is stored, but the photo itself is not permanently retained by OpenAI (per their API data policies)
- On account deletion, all photos and assessments are purged
- Consent is captured explicitly on first use with a clear explanation

### Spec

1. **New backend tables**:
   - `physique_check_in` — `(id, user_id, submitted_at, photo_s3_key, analysis_json, program_emphasis_json, created_at)`
   - `photo_s3_key` stores the S3 object key; actual URL constructed at read time (same pattern as `media_assets`)
   - `analysis_json` stores the OpenAI Vision response, normalized

2. **Photo upload endpoint**: `POST /api/physique/check-in` — accepts `multipart/form-data` with the photo file. Uploads to S3 under `physique/{user_id}/{timestamp}.jpg`. Calls OpenAI Vision API with a structured prompt. Persists result. Returns the analysis.

3. **OpenAI Vision prompt**: Structured prompt asking for:
   - visible muscle group development observations (non-medical, non-clinical language)
   - directional change if prior check-in exists ("compared to 4 weeks ago...")
   - soft emphasis suggestion (e.g., "anterior deltoid", "chest", "lats") mapped to program slot types
   - always concludes with a disclaimer that this is AI-generated guidance, not medical advice

4. **`GET /api/physique/check-ins`**: Returns the user's check-in history (assessments only, pre-signed S3 URLs for photos). Newest first.

5. **Program emphasis signal**: The `analysis_json.emphasis_suggestion[]` (an array of `slot_type` slugs) is stored in `physique_check_in.program_emphasis_json`. On next program generation (`POST /api/generate-plan-v2`), if a recent check-in exists (within 30 days), optionally pass these as soft preference signals into the program builder — biasing accessory slot selection toward the suggested muscles without forcing it.

6. **Mobile: `PhysiqueCheckInScreen`**: New screen accessible from the home screen or profile. Sections:
   - Explanation card (what this is, privacy statement, consent toggle)
   - Camera / photo picker
   - Upload and analysis loading state
   - Result card: AI observations, emphasis suggestion, previous comparison if available
   - Photo timeline strip (last 6 check-ins)

7. **Weekly prompt**: If the user hasn't submitted a check-in in 7+ days, and they've completed at least 2 sessions since the last check-in, trigger a push notification: "How are you looking? Your weekly check-in is ready."

### Scope boundary

This feature does not:
- Make medical or body composition claims
- Store weight measurements (that's already in the profile)
- Replace the adaptation engine — the emphasis suggestion is a soft input, not a prescription override

---

## Feature 5 — Hyrox Conditioning Progression

**Priority: High. The primary target user segment is Hyrox athletes. The adaptation engine must serve them.**

### Why

The current Layer B progression engine is calibrated entirely for load-based exercises: it reads `weight_kg`, `reps_completed`, `rir_actual`, and computes decisions based on whether the athlete hit the rep range at the target RIR. This works well for barbell and dumbbell work.

Hyrox competition performance is measured differently:
- Running: pace (min/km) for a fixed distance
- Ski erg, rowing: calories or distance in a fixed time
- Sled push/pull: time to complete a fixed distance at a fixed load
- Wall balls, sandbag lunges, burpee broad jumps: reps and completion time at a fixed load/distance

None of these use a "lift X kg for Y reps" model. Layer B currently has no signal for these exercises. Without conditioning-specific progression, a Hyrox athlete's Layer B data quality degrades every session they train conditioning — it is literally silent on their primary workouts.

### Spec

1. **New log fields**: Extend `segment_exercise_log` with:
   - `duration_seconds INT NULL` — time taken to complete the set/rep/distance
   - `distance_metres NUMERIC NULL` — distance covered
   - `calories INT NULL` — calories burned (for erg-type machines)
   The existing `weight_kg` and `reps_completed` fields are reused where applicable (e.g., sled push records weight and reps/distance).

2. **Progression key type**: Add `progression_metric TEXT NOT NULL DEFAULT 'load'` to `exercise_progression_state` and `exercise_progression_decision`. Allowed values: `load`, `pace`, `volume_reps`, `time_to_complete`.

3. **Layer B conditioning evaluator**: Add a new decision pathway in `progressionDecisionService` for `progression_metric != 'load'`:
   - `pace`: if athlete's `duration_seconds` for the target distance has improved by >3% over 2 sessions → `increase_distance` or `decrease_target_time`
   - `volume_reps`: if athlete completed prescribed reps with >2 reps in reserve over 2 sessions → `increase_reps` or `reduce_rest`
   - `time_to_complete`: if athlete completed prescribed work faster than target over 2 sessions → `increase_load` (sled) or `increase_distance` (burpee jumps)

4. **Log modal extension**: Extend `LogSegmentModal` to show alternative input fields for conditioning exercises:
   - exercises with `progression_metric = 'pace'` → duration input (MM:SS) instead of weight
   - exercises with `progression_metric = 'time_to_complete'` → time input + load
   - exercises with `progression_metric = 'volume_reps'` → reps only (no weight field for bodyweight movements)
   The `isLoadable` flag on the exercise controls which input set is shown.

5. **Hyrox benchmark tracking**: A new `GET /api/history/hyrox-benchmark` endpoint that returns the athlete's best time and pace per Hyrox station (ski erg, sled push, sled pull, burpees, rowing, wall balls, sandbag lunges, running) from their `segment_exercise_log` history. This feeds a dedicated Hyrox benchmark card on the history screen.

6. **Reference data enrichment**: Add `progression_metric` to the exercise catalogue for all Hyrox-relevant exercises, and seed appropriate initial values in `exercise_progression_state` using the rank-based defaults approach from Feature 10.

---

## Feature 6 — Apple Health Integration

**Priority: Medium-High. Expected by serious iOS athletes. Enables passive Layer B signal enrichment.**

### Why

Apple Health is where iOS athletes store their ground truth. An app that writes workouts to Health (so they appear in the Activity rings) and reads recovery signals (resting HR, HRV, sleep hours) is perceived as integrated with the athlete's ecosystem rather than siloed. This has an outsized effect on perceived quality relative to implementation effort.

The implementation is moderate in complexity — Apple's HealthKit SDK is well-documented and Expo exposes it via `expo-health`. The most impactful read signal is HRV (heart rate variability), which is a direct proxy for recovery readiness and a natural Layer B input.

### Spec

1. **Write: workout completion → Apple Health**: After `PATCH /api/day/:id/complete`, write a `HKWorkout` entry to HealthKit:
   - type: strength training (or functional training for Hyrox days)
   - duration: from `session_duration_mins` if available, otherwise estimated from session start/end
   - calories: not required for v1
   This makes the workout appear in the Activity rings and workout history.

2. **Read: resting HR and HRV**: On app open (or once per day), read the most recent `HKQuantityTypeIdentifierRestingHeartRate` and `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` samples from HealthKit. Store on the user's daily context.

3. **Read: sleep hours**: Read `HKCategoryTypeIdentifierSleepAnalysis` for the prior night's sleep duration. Store alongside resting HR/HRV.

4. **New backend table**: `user_daily_readiness` — `(id, user_id, record_date, resting_hr_bpm, hrv_ms, sleep_hours, source TEXT DEFAULT 'apple_health', created_at)`.

5. **Layer B readiness signal**: Extend `progressionDecisionService` to check the prior night's readiness:
   - if `hrv_ms < user_baseline_hrv * 0.85` AND `sleep_hours < 6`: weight progression decisions toward `hold` rather than `increase_load`. Do not block progression — merely shift the confidence threshold.
   - add `readiness_factor` to `decision_context_json` for transparency

6. **Permission request flow**: Prompt for HealthKit permissions on first workout completion (not on app open — request permission at the point of value). Show a brief explanation: "We'll record your workouts in Apple Health and read your recovery data to personalise your next session."

7. **`healthSync` settings toggle**: In `SettingsScreen`, add a Health section showing sync status and allowing the user to disable individual read permissions without full revocation.

---

## Feature 7 — Exercise Catalogue Deduplication and Coaching Content Expansion

**Priority: Medium-High. This is blocking technical debt with downstream consequences.**

### Why

The exercise catalogue duplicate-ID problem (documented in `exercise-catalogue-duplicate-cleanup-plan.md`) has ~30 known duplicate pairs where the same physical movement exists under two `exercise_id` values. Coaching cues, load guidance, and technique content authored on one ID are invisible when the engine selects the other. This is a silent quality problem that affects every athlete's experience on those exercises.

The plan document is already written and thorough. This feature executes it and uses the clean catalogue as a foundation to expand coaching content.

### Spec

**Phase 1 (technical debt resolution):**
1. Retire `R__seed_exercise_catalogue.sql` as a repeatable migration (rename to `archive__seed_exercise_catalogue.sql`).
2. Run the duplicate audit for all 30 known pairs. Produce a migration that: (a) copies `coaching_cues_json`, `load_guidance`, `logging_guidance` from alias rows onto canonical rows, (b) deletes alias rows.
3. Regenerate `R__exercise_catalogue_edits.sql` and `R__seed_coaching_cues.sql` against canonical IDs only.
4. Add admin duplicate-name detection on exercise create/clone — warn before creating a likely alias.

**Phase 2 (content expansion):**
5. Expand `coaching_cues_json` for the top 40 exercises by selection frequency (the most commonly programmed exercises across all user programs). Each exercise gets:
   - `setup`: 2–3 sentences describing starting position
   - `execution`: 2–3 bullet points for the movement
   - `common_mistakes`: 1–2 bullet points on what to avoid
   - `cue`: one short memorable cue ("chest up", "elbows track knees")

6. Add `technique_video_url TEXT NULL` to `exercise_catalogue` for a future video asset. Populate with links to public-domain or licensed technique demonstrations for the top 20 exercises. This field feeds Feature 8.

7. Admin exercise coverage report: expose which exercises have complete vs. missing coaching content. Use the spec at `docs/admin-exercise-coverage-report-spec.md`.

---

## Feature 8 — In-App Technique Guidance and Exercise Demos

**Priority: Medium. Reduces injury risk, improves form quality, improves RIR data accuracy.**

### Why

RIR (Reps in Reserve) data quality is directly dependent on form quality. An athlete who doesn't know how deep to squat will log unreliable RIR. An athlete who has technique guidance at the point of need will log more accurate effort data, which improves Layer B decision quality. This is a data quality investment, not just a UX nicety.

For Hyrox athletes specifically, technique on conditioning movements (ski erg pull, sled push posture, wall ball squat depth) directly affects competition performance.

### Spec

1. **Exercise detail bottom sheet**: Tapping the exercise name in `SegmentCard` opens a bottom sheet (not a full screen navigation) showing:
   - exercise name + muscle group tags
   - coaching cues (from `coaching_cues_json`) rendered as a short bulleted card
   - one memorable cue in large text at the top
   - if `technique_video_url` is set: a looping silent video or animated GIF demonstration

2. **In-session form reminder**: For exercises where a coach cue exists, show a subtle `"Form tip"` chip below the exercise name in the exercise row. Tapping it opens the same bottom sheet. This is opt-in (the chip is small and unobtrusive) — it doesn't interrupt the session flow.

3. **First-time exercise prompt**: When an exercise appears in the user's program for the first time (no prior `segment_exercise_log` rows), auto-open the technique sheet on first day view of that exercise. This is especially valuable for new Hyrox athletes encountering ski erg or sled movements for the first time.

4. **Backend**: `GET /api/exercise/:exercise_id/guidance` — returns `coaching_cues_json`, `technique_video_url`, `common_name`, `muscle_groups`. Cached aggressively (this data rarely changes).

5. **Video hosting**: Use the existing MinIO/S3 infrastructure. Add a `technique_videos/` prefix in the bucket. Upload short (10–20 second) looping clips for the 20 highest-priority exercises.

---

## Feature 9 — Social Sharing and Viral Loops

**Priority: Medium. Organic acquisition; positive reinforcement loop; zero new backend infrastructure required.**

### Why

The PR detection is already built server-side (Feature 7 push notifications fire on PR in `segmentLog.js`). The session summary card is being built in Feature 2 of the in-plan session UX work. The missing piece is making these moments shareable — turning a private accomplishment into a social proof asset.

Fitness app shares are one of the highest-quality acquisition channels. A "New PR" share card from a real user is more credible than any paid ad.

### Spec

1. **PR share card**: When a PR is detected, the in-app PR celebration (Feature 2 polish) includes a "Share" button. Tapping it generates a static image card containing:
   - Formai branding (logo, app name)
   - Exercise name + new 1RM / best weight
   - Date
   - A short message: "New personal best on [Exercise Name]"
   Use React Native's `Share` API or `expo-sharing` to share to Messages, Instagram Stories, Twitter, etc.

2. **Week complete share card**: After completing all scheduled sessions in a week, the home screen shows a "Week N done — X sessions, Y kg lifted" card. This card has a share button generating a similar static image.

3. **Physique progress share**: From Feature 4 (`PhysiqueCheckInScreen`), allow sharing a side-by-side comparison of two check-in photos with AI improvement notes. User controls which photos are included; photos are masked to a square crop before sharing.

4. **Referral system**: Add a `referral_code TEXT UNIQUE DEFAULT nanoid(8)` to `app_user`. A `GET /api/users/me/referral-code` endpoint returns the user's code. The `PaywallScreen` and settings screen surface a "Refer a friend" option. New users who install via a referral link get an extended trial (e.g., 21 days instead of 14). The referrer gets an incentive (e.g., 1 free month when their referral subscribes). Backend: `referral_conversion` table to track.

5. **App Store review prompt**: After the first PR hit (post-session), show an `expo-store-review` prompt. This is the highest-conversion moment for a review request — the user just achieved something.

---

## Feature 10 — Goal Refresh and Mid-Program Adjustment Flow

**Priority: Medium. Prevents the "program no longer fits me" churn at weeks 6–8.**

### Why

A 12-week program is generated once from a single onboarding snapshot. By week 6, some users have:
- Changed goals ("I've entered a Hyrox race, I want to shift focus")
- Changed equipment ("I joined a proper gym")
- Changed schedule ("I can now train 4 days instead of 3")
- Changed body metrics ("I've lost 8kg")

Currently there is no path to update these without generating a full new program. The re-enrollment flow (Feature 4) handles program completion, but not mid-program drift. This feature adds a lightweight mid-program "recalibrate" option.

### Spec

1. **Recalibrate entry point**: In `SettingsScreen` (or a new "My Program" settings section), add a "Recalibrate program" option. Also surfaced contextually: if the home screen detects the user has missed 3+ consecutive scheduled sessions, show a gentle banner: "Life gets in the way — want to adjust your schedule?"

2. **Recalibrate flow** (`RecalibrateScreen`): A 2-step flow (not the full 5-step onboarding):
   - **Step A — What changed?** Multi-select: Goals, Schedule, Equipment, Body metrics. User picks what's different.
   - **Step B — Amend** the relevant fields only. Uses the existing onboarding components (`DayChipRow`, `PillGrid`, `NumericField`) re-assembled into a compact view.

3. **Apply changes without full regeneration**: For schedule and metric changes — update `client_profile` only. The existing guideline load system will pick up new body metrics automatically; schedule is advisory (it affects future day scheduling but not the existing program structure).

4. **For goal changes — offer re-generation**: If the user changes their primary goal, show a clear choice: "Keep your current program with adjusted focus" vs. "Generate a fresh program for your new goal." Keep current should bias the accessory slot selection in the current program (updating slot defaults for remaining weeks) without rerunning the full pipeline. Fresh generate navigates to the existing re-enrollment flow.

5. **Equipment change — update and notify**: If equipment changes (e.g., user now has a barbell at home), trigger a background substitution pass for remaining program days: exercises marked `equipment_missing` in the original generation can now be replaced with barbell variants. Use the existing substitution engine from Feature 3.

6. **Missed session handling**: If the user misses a scheduled session, offer "Skip" or "Reschedule." Skip marks the day as skipped (not failed); reschedule adds the session to the end of the current week. Both options prevent Layer B from treating missed days as "completed with no reps," which would corrupt progression state.

---

## Appendix: Monetisation Opinion on B2B

You asked for an opinion on timing the B2B coach portal revenue channel.

**Recommendation: Consumer subscription first, B2B second, separated by at least one cycle.**

Reasons:

1. Feature 9 (coach portal) is still in progress. The API is being built; the web UI doesn't exist yet. B2B pricing requires a polished coach portal that coaches can demo and pay for with confidence.

2. Consumer subscription gives you pricing signal. Before you can price a coach seat, you need to know what individual athletes are willing to pay — the coach seat should be a meaningful multiple of the consumer price.

3. The Hyrox coach market is real but niche. Your first coaches will likely be coaches who are themselves Hyrox athletes — meaning you capture them as consumers first, then convert them to coaches.

4. A trial + subscription consumer product is one RevenueCat integration. B2B billing involves Stripe, team management, invoicing, and account provisioning — a full additional infrastructure layer.

**Suggested timing:** Consumer subscription in this cycle (Feature 3). B2B in the following cycle, once the coach portal web interface ships and you have consumer revenue data to anchor the B2B price.
