# Mobile App — Screen Reference

This document is the canonical reference for screen and UI area names used in the React Native mobile app.
Use these names when requesting specification changes or amendments.

> **Note:** The mobile app lives in a separate repository. This document is derived from API contracts,
> onboarding QA docs, and architecture documentation. Correct any name discrepancies against the actual
> screen file names and update this doc accordingly.

---

## Navigation Structure

```
App
├── Onboarding Flow          (shown on first launch / no profile)
│   ├── Onboarding Entry
│   ├── Onboarding Step 1 — Goals
│   ├── Onboarding Step 2 — Equipment
│   ├── Onboarding Step 3 — Schedule & Metrics
│   └── Program Review
│
└── Main App (tab bar)
    ├── Program Tab
    │   ├── Program Overview
    │   └── Day Detail
    │
    └── History Tab
        ├── History Overview
        ├── History Timeline
        ├── Program History
        ├── Personal Records
        └── Exercise History
```

---

## Onboarding Flow

### Onboarding Entry

**Purpose:** Bootstrap the user and profile records on first launch. Determines which onboarding step to resume if the user re-enters partway through.

**Key behaviour:**
- Calls `POST /api/user/bootstrap` and `POST /api/client_profile/bootstrap` once per session.
- Reads `onboardingStepCompleted` from the profile to route to the correct step.
- Shows a retry view if `/me` or profile fetch fails.

**UI areas:**
| Area | Description |
|---|---|
| Loading Indicator | Spinner while bootstrapping |
| Retry View | Error state with "Retry" CTA |

---

### Onboarding Step 1 — Goals

**Purpose:** Collect the user's primary goal, fitness level, and any injury flags.

**API:** `PATCH /client-profiles/:id` with `goals`, `fitnessLevel`, `injuryFlags`

**UI areas:**
| Area | Description |
|---|---|
| Goals Section | Multi-select pill group for goal type (Fat Loss, General Fitness, Strength, Hypertrophy, Conditioning, HYROX Competition, Turf Games Competition, Rehab / Return From Injury) |
| Fitness Level Section | Single-select pill group (Beginner, Intermediate, Advanced, Elite) |
| Injury Flags Section | Multi-select pill group; selecting "No Known Issues" is mutually exclusive with all others |
| Validation Banner | Inline error shown above the bottom nav when required fields are empty on Next tap |
| Sticky Nav Bar | Contains Back button, step progress indicator, and Next button; both disabled during save |

---

### Onboarding Step 2 — Equipment

**Purpose:** Set the user's equipment availability via preset + individual item selection.

**API:**
- `GET /reference-data` — fetches `equipmentPresets` and `equipmentItems`
- `GET /equipment-items?preset=<code>` — fetches items for a selected preset
- `PATCH /client-profiles/:id` with `equipmentPreset`, `equipmentItemCodes`

**UI areas:**
| Area | Description |
|---|---|
| Equipment Preset Section | Single-select preset cards (Commercial Gym, Decent Home Gym, Minimal Equipment, No Equipment, CrossFit / HYROX Gym) |
| Prefill Banner | Inline "Prefilling equipment list…" indicator shown while preset items load |
| Equipment Items List | Multi-select list of individual equipment items populated from the selected preset |
| Prefill Error Banner | Shown if the preset items API call fails; disables Next |
| Sticky Nav Bar | Contains Back button, step progress indicator, and Next button |

---

### Onboarding Step 3 — Schedule & Metrics

**Purpose:** Collect training schedule preferences and biometric/demographic details.

**API:** `PATCH /client-profiles/:id` with `preferredDays`, `minutesPerSession`, `heightCm`, `weightKg`, `sex`, `ageRange`, `goalNotes`, `scheduleConstraints`, `onboardingStepCompleted`, `onboardingCompletedAt`

**UI areas:**
| Area | Description |
|---|---|
| Preferred Days Section | Multi-select day-of-week pill group (Mon–Sun) |
| Session Duration Section | Single-select option group (40 min / 50 min / 60 min) |
| Body Metrics Section | Height (cm) and weight (kg) numeric inputs |
| Sex Section | Single-select (Male / Female / Prefer Not To Say) |
| Age Range Section | Single-select age band (Under 18 / 18–24 / 25–34 / 35–44 / 45–54 / 55–64 / 65+) |
| Goal Notes Field | Optional free-text additional goal context |
| Schedule Constraints Field | Optional free-text scheduling restrictions |
| Under-18 Blocking Banner | Red blocking message; disables Finish if "Under 18" is selected |
| Validation Banner | Inline error when required fields are empty on Finish tap |
| Sticky Nav Bar | Contains Back button, step progress indicator, and Finish button |

---

### Program Review

**Purpose:** Transition screen shown after onboarding completes. Entry point for program generation.

**API:** `POST /api/program/generate`

**UI areas:**
| Area | Description |
|---|---|
| Program Summary Card | Displays high-level program details once generated (title, summary, weeks, days/week) |
| Generate CTA | Triggers program generation |
| Loading State | Spinner / progress indicator during generation |

---

## Main App — Program Tab

### Program Overview

**Purpose:** The primary home screen after onboarding. Shows the active program, its hero image, a weekly calendar strip, and allows the user to navigate to individual training days.

**API:**
- `GET /api/program/:program_id/overview` — program header, weeks, calendar days, selected day
- `GET /media-assets?usage_scope=program` — hero image for the program

**UI areas:**
| Area | Description |
|---|---|
| Program Hero | Full-width hero image at the top; image resolved from `media_assets` by program type |
| Hero Caption | Short motivational text overlaid on or below the hero image |
| Program Title | Name of the active program (e.g. "Hypertrophy — Week 3") |
| Program Summary | One-to-two sentence program description |
| Week Strip / Calendar | Horizontal scrollable week-by-week calendar showing training days; days marked complete or upcoming |
| Selected Day Card | Preview card for the currently selected day — shows day label, week/day number, and completion status |
| Start / Resume Day CTA | Navigates to Day Detail for the selected day |

---

### Day Detail

**Purpose:** The workout execution screen. Displays all segments and exercises for a single training day, allows the user to log sets in real time, and marks the day complete.

**API:**
- `GET /api/day/:program_day_id/full` — day info, segments, exercises
- `GET /media-assets?usage_scope=program_day&day_type=<type>&focus_type=<focus>` — hero image for the day
- `POST /api/segment-log` — log a completed set
- `PATCH /api/segment-log/:id` — update a logged set

**UI areas:**
| Area | Description |
|---|---|
| Day Hero | Hero image at the top; resolved by day type (e.g. hypertrophy) and focus (upper_body / lower_body / full_body) |
| Day Title | E.g. "Day 1 — Lower Body" |
| Day Subtitle / Notes | Additional context for the day (phase, week notes) |
| Segment List | Ordered list of workout segments for the day |
| Segment Card | Contains the segment title, type badge (Single / Superset / Giant Set / AMRAP / EMOM), and exercise rows |
| Exercise Row | Shows exercise name, prescribed sets × reps, tempo, RIR, rest; tappable to expand logging |
| Set Logger | Inline logging row within an exercise: weight input, reps input, RIR selector, confirm button |
| Warmup Segment | First segment; type = warmup; purpose = warmup |
| Main Segment(s) | Block A segments; purpose = main |
| Secondary Segment(s) | Block B segments; purpose = secondary |
| Accessory Segment(s) | Block C / D segments; purpose = accessory |
| Cooldown Segment | Last segment; type = cooldown; purpose = cooldown |
| Complete Day CTA | Button to mark the day as complete; sets `is_completed = true` on the program day |

---

## Main App — History Tab

### History Overview

**Purpose:** Aggregate statistics dashboard — lifetime session count, volume, streaks, and recent PRs at a glance.

**API:** `GET /api/history/overview`

**UI areas:**
| Area | Description |
|---|---|
| Stats Cards | Key metrics: total sessions, total volume, current streak, longest streak |
| Recent PRs Strip | Horizontally scrollable list of most recent personal records |

---

### History Timeline

**Purpose:** Chronological feed of all completed workout sessions.

**API:** `GET /api/history/timeline`

**UI areas:**
| Area | Description |
|---|---|
| Timeline Feed | Vertical list of session entries sorted by date descending |
| Session Entry | Shows date, day label, program name, total volume, and duration |

---

### Program History

**Purpose:** List of all programs (active and archived) the user has generated.

**API:** `GET /api/history/programs`

**UI areas:**
| Area | Description |
|---|---|
| Program List | Cards for each program: title, date range, weeks completed / total, status badge (Active / Archived) |

---

### Personal Records

**Purpose:** Per-exercise personal bests — estimated 1RM and max weight/reps.

**API:** `GET /api/history/personal-records`

**UI areas:**
| Area | Description |
|---|---|
| PR List | One row per exercise with a PR; shows exercise name, best weight, best reps, estimated 1RM, date achieved |
| PR Feed Strip | Compact recent-PR strip (also shown on History Overview) — driven by `GET /api/prs-feed` |

---

### Exercise History

**Purpose:** Detailed logging history and performance trend for a single exercise.

**API:**
- `GET /api/history/exercise/:exercise_id`
- `GET /api/logged-exercises`
- `GET /api/session-history-metrics`

**UI areas:**
| Area | Description |
|---|---|
| Exercise Name Header | Name of the selected exercise |
| Performance Chart | Volume or max-weight trend over time |
| Session Log List | All logged sessions for this exercise: date, sets × reps × weight |
| PR Banner | Highlights the current personal record set for this exercise |

---

## Shared UI Components

These components appear across multiple screens and are referred to by name in discussions.

| Component | Used On | Description |
|---|---|---|
| Sticky Nav Bar | All onboarding steps | Fixed bottom bar with Back / Next / Finish buttons and a saving-state spinner |
| Step Progress Indicator | All onboarding steps | Horizontal progress bar or dot indicator showing current step (1 of 3, etc.) |
| Validation Banner | Steps 1, 2, 3 | Red banner with error message; appears above Sticky Nav Bar on failed validation |
| Hero Image | Program Overview, Day Detail | Full-width image resolved from `media_assets` via `image_key + S3_PUBLIC_BASE_URL` |
| Segment Card | Day Detail | Container for a single workout segment; renders exercise rows inside |
| Set Logger | Day Detail | Inline per-set logging UI within an Exercise Row |
| PR Badge | Personal Records, History Overview | Visual highlight for a personal record entry |

---

## Key Field Codes (Reference Data)

These are the canonical `code` values used by the API for select fields shown in the UI.

### Goals
| Code | Label |
|---|---|
| `fat_loss` | Fat Loss |
| `general_fitness` | General Fitness |
| `strength` | Strength |
| `hypertrophy` | Hypertrophy |
| `conditioning` | Conditioning |
| `hyrox_competition` | HYROX Competition |
| `turf_games_competition` | Turf Games Competition |
| `rehab_return_from_injury` | Rehab / Return From Injury |

### Equipment Presets
| Code | Label |
|---|---|
| `commercial_gym` | Commercial Gym |
| `decent_home_gym` | Decent Home Gym |
| `minimal_equipment` | Minimal Equipment |
| `no_equipment` | No Equipment |
| `crossfit_hyrox_gym` | CrossFit / HYROX Gym |

### Fitness Levels
| Code | Label |
|---|---|
| `beginner` | Beginner |
| `intermediate` | Intermediate |
| `advanced` | Advanced |
| `elite` | Elite |

### Session Duration Options
| Minutes | Label |
|---|---|
| `40` | 40 min |
| `50` | 50 min |
| `60` | 60 min |

### Age Ranges
| Code | Label |
|---|---|
| `under_18` | Under 18 |
| `18_24` | 18–24 |
| `25_34` | 25–34 |
| `35_44` | 35–44 |
| `45_54` | 45–54 |
| `55_64` | 55–64 |
| `65_plus` | 65+ |
