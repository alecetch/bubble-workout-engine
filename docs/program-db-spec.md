# Program DB Spec (Postgres)

This document defines the Postgres data model for storing generated training programs emitted by the **Emitter v8.1** (rows: `PRG`, `WEEK`, `DAY`, `SEG`, `EX`) and for supporting the Bubble UI (program overview, weekly plan, calendar view, workout screen) with **offline-ish** speed.

Scope:
- ✅ Store *generated plan data* (program header, weeks, scheduled days, segments, prescribed exercises)
- ✅ Support re-generation of days/weeks via OpenAI without rewriting historical logs
- ✅ Fast reads for calendar + day detail
- ⚠️ Logging (weights/reps) may stay in Bubble short-term, but this spec includes a Postgres logging option

---

## 1) Design Principles

### 1.1 Scheduled instance model
**ProgramDay represents the scheduled instance** (e.g., Week 2 Day 3 scheduled for a specific date).  
This means:
- `program_week + day_number` maps to a scheduled day occurrence within the plan
- `scheduled_date` is stored (derived from `program.start_date + scheduled_offset_days`)

### 1.2 Immutable plan, mutable logs
- Program structure (days/segments/exercises) is *effectively immutable* once created.
- If you regenerate a day/week, we create a new revision and switch the “active” reference, or we replace only unstarted instances—see §7.

### 1.3 Bubble UI compatibility
Even if Bubble is the UI, Bubble should **read** from Postgres via API (fast, simple), not write large batches.
- Writes happen server-side in bulk (COPY / batched inserts / transactions)
- Bubble writes only logs (or calls an API to write logs)

---

## 2) Entity Overview (ER-ish)

- `program`
  - has many `program_week`
  - has many `program_day`
- `program_week`
  - belongs to `program`
  - has many `program_day`
- `program_day` (scheduled instance)
  - belongs to `program`
  - belongs to `program_week`
  - has many `workout_segment`
  - has many `program_exercise`
- `workout_segment`
  - belongs to `program_day`
  - has many `program_exercise` (via `segment_key`)
- `program_exercise`
  - belongs to `program_day`
  - belongs to `workout_segment` (nullable for edge cases)
- `program_calendar_day` (optional materialization)
  - belongs to `program`
  - belongs to `program_week`
  - belongs to `program_day`

Optional:
- `segment_exercise_log` (if logging moved to Postgres)

---

## 3) Required Extensions / Conventions

- Use UUID PKs
- Use `timestamptz` for timestamps
- Use `jsonb` for stored program outlines and scheme payloads
- Row-level ownership: `user_id` (UUID) or `client_profile_id` if you prefer

Assumed:
- `app_user` table exists elsewhere (`id uuid pk`)
- `client_profile` exists elsewhere (`id uuid pk`)

---

## 4) Tables (DDL)

> Notes:
> - `program_day_key` is the Emitter key: `PD_W{wk}_D{day}`.
> - `segment_key` is the Emitter key: e.g. `B3_S1`.
> - We enforce uniqueness to prevent duplicate ingest.

### 4.1 program

Stores PRG row + ownership + scheduling anchor.

```sql
create table if not exists program (
  id uuid primary key default gen_random_uuid(),

  -- ownership
  user_id uuid not null,
  client_profile_id uuid null,

  -- core metadata (from PRG row)
  program_title text not null,
  program_summary text not null,
  weeks_count int not null check (weeks_count >= 1),
  days_per_week int not null check (days_per_week >= 1 and days_per_week <= 7),

  -- outline JSON (full program json from step5 output)
  program_outline_json jsonb not null,

  -- scheduling
  start_date date not null,
  start_offset_days int not null default 0,
  start_weekday text not null,                 -- e.g. "Tue"
  preferred_days_sorted_json jsonb not null,   -- e.g. ["Tue","Thu","Sat"]

  -- lifecycle
  status text not null default 'active',       -- active | archived | superseded
  revision int not null default 1,
  parent_program_id uuid null references program(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_program_user on program(user_id, created_at desc);
create index if not exists idx_program_client_profile on program(client_profile_id, created_at desc);
4.2 program_week

Stores WEEK rows + derived phase fields from narration.

create table if not exists program_week (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references program(id) on delete cascade,

  week_number int not null check (week_number >= 1),
  focus text not null default '',
  notes text not null default '',

  -- optional (from program.narration.weeks)
  phase text null,
  phase_label text null,
  title text null,

  created_at timestamptz not null default now(),

  unique(program_id, week_number)
);

create index if not exists idx_program_week_program on program_week(program_id, week_number);
4.3 program_day (scheduled instance)

Represents a scheduled training day instance (Week N, Day M).

create table if not exists program_day (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references program(id) on delete cascade,
  program_week_id uuid not null references program_week(id) on delete cascade,

  -- from DAY row
  week_number int not null check (week_number >= 1),
  day_number int not null check (day_number >= 1 and day_number <= 7),
  global_day_index int not null check (global_day_index >= 1),

  program_day_key text not null, -- "PD_W{wk}_D{day}"

  day_label text not null default '',
  day_type text not null default 'hypertrophy',
  session_duration_mins int not null check (session_duration_mins >= 0),

  day_format_text text not null default '',
  block_format_main_text text not null default '',
  block_format_secondary_text text not null default '',
  block_format_finisher_text text not null default '',

  -- scheduling
  scheduled_offset_days int not null default 0,
  scheduled_weekday text not null default '',
  scheduled_date date not null,

  -- generation state (mirrors Bubble flags)
  day_inputs_status text not null default 'not_started',  -- not_started | building | ready | error
  day_inputs_ready boolean not null default false,
  build_status text not null default 'not_started',       -- not_started | built | error
  generation_error text null,
  day_generation_call_log jsonb null,

  -- activity state
  has_activity boolean not null default false,
  is_completed boolean not null default false,

  -- media hooks
  hero_media_id uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(program_id, program_day_key),
  unique(program_id, week_number, day_number)
);

create index if not exists idx_program_day_program_date on program_day(program_id, scheduled_date);
create index if not exists idx_program_day_program_week on program_day(program_id, week_number, day_number);
create index if not exists idx_program_day_key on program_day(program_day_key);
4.4 program_calendar_day (optional)

You can compute calendar days from program_day directly (preferred), but this table exists if you want an explicit “calendar view” record.

create table if not exists program_calendar_day (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references program(id) on delete cascade,
  program_week_id uuid not null references program_week(id) on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,

  week_number int not null,
  scheduled_offset_days int not null,
  scheduled_weekday text not null,
  scheduled_date date not null,
  global_day_index int not null,

  is_training_day boolean not null default true,
  program_day_key text not null,

  created_at timestamptz not null default now(),

  unique(program_id, scheduled_date),
  unique(program_id, program_day_key)
);

create index if not exists idx_calendar_program_date on program_calendar_day(program_id, scheduled_date);
4.5 workout_segment (SEG rows)
create table if not exists workout_segment (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references program(id) on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,

  program_day_key text not null,

  segment_key text not null,             -- e.g. "B3_S1"
  block_key text not null,               -- e.g. "B3"
  block_order int not null check (block_order >= 1),
  segment_order_in_block int not null check (segment_order_in_block >= 1),

  segment_type text not null,            -- warmup | single | superset | giant_set | cooldown | ...
  purpose text not null,                 -- warmup | main | secondary | accessory | cooldown
  purpose_label text not null default '',

  segment_title text not null default '',
  segment_notes text not null default '',

  rounds int not null default 1 check (rounds >= 1),

  score_type text not null default 'none',     -- rounds | reps | none
  primary_score_label text not null default '',
  secondary_score_label text not null default '',

  segment_scheme_json jsonb not null default '{}'::jsonb,

  segment_duration_seconds int not null default 0 check (segment_duration_seconds >= 0),
  segment_duration_mmss text not null default '',

  created_at timestamptz not null default now(),

  unique(program_day_id, segment_key),
  unique(program_day_id, block_order, segment_order_in_block)
);

create index if not exists idx_segment_day on workout_segment(program_day_id, block_order, segment_order_in_block);
create index if not exists idx_segment_day_key on workout_segment(program_day_key);
4.6 program_exercise (EX rows)
create table if not exists program_exercise (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references program(id) on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,
  workout_segment_id uuid null references workout_segment(id) on delete set null,

  program_day_key text not null,

  segment_key text not null,        -- joins to workout_segment.segment_key
  segment_type text not null,

  exercise_id text not null,        -- catalog ID
  exercise_name text not null default '',
  is_loadable boolean not null default false,

  equipment_items_slugs_csv text not null default '',

  -- ordering
  order_in_day int not null check (order_in_day >= 1),
  block_order int not null check (block_order >= 1),
  order_in_block int not null check (order_in_block >= 1),

  purpose text not null,
  purpose_label text not null default '',

  -- prescription
  sets_prescribed int not null default 0 check (sets_prescribed >= 0),
  reps_prescribed text not null default '',
  reps_unit text not null default 'reps',
  intensity_prescription text not null default '',  -- "~2 RIR"
  tempo text not null default '',
  rest_seconds int not null default 0 check (rest_seconds >= 0),

  notes text not null default '',

  created_at timestamptz not null default now(),

  unique(program_day_id, order_in_day),
  unique(program_day_id, segment_key, order_in_block, exercise_id)
);

create index if not exists idx_ex_day on program_exercise(program_day_id, order_in_day);
create index if not exists idx_ex_segment on program_exercise(program_day_id, segment_key, order_in_block);
create index if not exists idx_ex_exercise_id on program_exercise(exercise_id);
5) Mapping From Emitter Rows
5.1 PRG row (9 cols)

PRG|title|summary|weeks_count|days_per_week|program_outline_json|start_offset_days|start_weekday|preferred_days_sorted_json

Maps to program:

program_title = #2

program_summary = #3

weeks_count = #4

days_per_week = #5

program_outline_json = #6 (jsonb)

start_offset_days = #7

start_weekday = #8

preferred_days_sorted_json = #9 (jsonb)

start_date provided separately by caller (anchor day)

5.2 WEEK row (4 cols)

WEEK|week_number|focus|notes

Maps to program_week:

week_number = #2

focus = #3

notes = #4

Optional: enrich phase/title/phase_label from program.program_outline_json->narration->weeks[]

5.3 DAY row (14 cols)

DAY|week_number|day_number|global_day_index|day_label|day_type|session_duration|day_format_text|main|secondary|finisher|scheduled_offset_days|scheduled_weekday|program_day_key

Maps to program_day:

week_number = #2

day_number = #3

global_day_index = #4

day_label = #5

day_type = #6

session_duration_mins = #7

day_format_text = #8

block_format_main_text = #9

block_format_secondary_text = #10

block_format_finisher_text = #11

scheduled_offset_days = #12

scheduled_weekday = #13

program_day_key = #14

scheduled_date = program.start_date + scheduled_offset_days

5.4 SEG row (19 cols)

SEG|segment_key|segment_type|segment_title|score_type|primary_label|secondary_label|rounds|segment_notes|segment_scheme_json|duration_seconds|mmss|block_key|segment_order_in_block|block_order|purpose|purpose_label|reserved|program_day_key

Maps to workout_segment:

segment_key = #2

segment_type = #3

segment_title = #4

score_type = #5

primary_score_label = #6

secondary_score_label = #7

rounds = #8

segment_notes = #9

segment_scheme_json = #10 (jsonb)

segment_duration_seconds = #11

segment_duration_mmss = #12

block_key = #13

segment_order_in_block = #14

block_order = #15

purpose = #16

purpose_label = #17

program_day_key = #19

5.5 EX row (26 cols)

EX|exercise_id|order_in_day|block_order|purpose|purpose_label|order_in_block|sets|reps|reps_unit|intensity|tempo|rest|notes|block_key|...|segment_key|segment_type|...|segment_rounds|...|item_index|...|program_day_key

Maps to program_exercise:

exercise_id = #2

order_in_day = #3

block_order = #4

purpose = #5

purpose_label = #6

order_in_block = #7

sets_prescribed = #8

reps_prescribed = #9

reps_unit = #10

intensity_prescription = #11

tempo = #12

rest_seconds = #13

notes = #14

segment_key = #18

segment_type = #19

program_day_key = #26

Additional fields (exercise_name, is_loadable, equipment_items_slugs_csv) should be joined from your ExerciseCatalog table during ingest (or added later by a hydrator job).

6) Ingest Contract (Recommended)
6.1 Input

Server receives:

program_json (full program JSON from Step 5 output)

emitter_rows[] (array of pipe-delimited strings)

start_date (date, anchor day rounded down)

user_id and optional client_profile_id

6.2 Transactional ingest

In one transaction:

Parse PRG row -> insert program

Insert WEEK rows -> program_week

Insert DAY rows -> program_day

Insert SEG rows -> workout_segment

Insert EX rows -> program_exercise

Backfill workout_segment_id on program_exercise via join on (program_day_id, segment_key)

(Optional) insert program_calendar_day rows (or skip; compute via query)

6.3 Idempotency

Use unique(...) constraints + insert ... on conflict do nothing or do update depending on policy.

Programs: new program each generation (recommended) -> no conflict

Days/segments/exercises: conflict protects accidental double ingest

7) Regeneration Strategy (Days/Weeks)

Goal: regenerate content with OpenAI without breaking logs.

7.1 Program revision approach (recommended)

Create a new program row with parent_program_id = old_program.id and revision = old.revision + 1

Copy logs forward by linking them to program_day_key + scheduled_date (or keep logs attached to the old program)

Pros:

clean immutability

easy rollback

Cons:

more rows

7.2 In-place replacement for unstarted instances (acceptable)

If program_day.has_activity = false and day_inputs_status != 'ready':

delete segments/exercises for that day and re-insert from new emitter rows

keep the same program_day.id

Pros:

fewer rows
Cons:

careful with race conditions

8) Read Patterns (Bubble UI)
8.1 Program list

Query:

select id, program_title, program_summary, start_date, weeks_count, days_per_week from program where user_id = $1 order by created_at desc limit 20;

8.2 Calendar view

Query program_day directly:

select scheduled_date, week_number, day_number, day_label, is_completed, has_activity, program_day_key from program_day where program_id=$1 order by scheduled_date;

8.3 Day detail (workout screen)

program_day + workout_segment + program_exercise

order segments by (block_order, segment_order_in_block)

order exercises by (order_in_day) or (segment_key, order_in_block)

9) Optional: Logging in Postgres (SegmentExerciseLog)

If/when logs move out of Bubble, use:

create table if not exists segment_exercise_log (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,
  program_id uuid not null references program(id) on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,
  workout_segment_id uuid null references workout_segment(id) on delete set null,
  program_exercise_id uuid null references program_exercise(id) on delete set null,

  -- ordering from UI
  order_index int not null default 1 check (order_index >= 1),

  is_draft boolean not null default true,

  -- captured performance
  weight_kg numeric(6,2) null,
  reps_completed int null,
  rir_actual numeric(3,1) null,
  notes text null,

  -- raw log payload (optional)
  segment_log jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_log_day on segment_exercise_log(user_id, program_day_id);
create index if not exists idx_log_ex on segment_exercise_log(user_id, program_exercise_id);

If logs remain in Bubble initially:

keep Bubble tables as-is

Bubble reads plan from Postgres + writes logs to Bubble

later migrate logs to Postgres without changing plan tables

10) Open Questions / Decisions (Codex TODOs)

Codex should confirm these during implementation:

Canonical ownership key: user_id vs client_profile_id vs both

Whether to materialize program_calendar_day or compute from program_day

Regeneration policy: revision-based (preferred) vs in-place replace for unstarted days

Exercise catalog location (Bubble vs Postgres) for exercise_name/is_loadable/equipment_csv

11) Implementation Notes (Codex Guidance)

Use a single ingest function ingest_emitter_rows(program_json, rows, start_date, user_id, client_profile_id)

Validate row shapes by prefix:

PRG: 9 cols

WEEK: 4 cols

DAY: 14 cols

SEG: 19 cols

EX: 26 cols

Wrap ingest in a transaction; fail fast on parse errors

Use prepared statements / batch inserts

Prefer jsonb and store program_outline_json exactly as received

End.

::contentReference[oaicite:0]{index=0}