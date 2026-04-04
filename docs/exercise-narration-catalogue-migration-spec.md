# Exercise Narration Catalogue Migration Spec

## Goal

Move exercise-specific coaching content out of `narration_template` and into `exercise_catalogue`, while keeping `narration_template` responsible for contextual narration at the segment, day, week, and program levels.

This is motivated by two product realities:

1. Exercise-level cues and guidance need to become more specific than the current narration matcher can support.
2. Future exercise videos will need exercise-owned commentary that naturally belongs with the exercise record.

## Recommendation Summary

Adopt a hybrid model:

- `exercise_catalogue` becomes the source of truth for stable exercise-specific coaching content
- `narration_template` remains the source of truth for contextual language and structure

Recommended split:

- `exercise_catalogue`
  - form cues
  - exercise-specific coaching prompts
  - exercise-specific load guidance when it is stable for that movement
  - future video commentary / voiceover metadata
  - warmup hooks
- `narration_template`
  - program / week / day narration
  - segment narration
  - exercise-line framing that depends on context
  - contextual exercise guidance that genuinely varies by program type, phase, purpose, or segment type

## Why This Change Makes Sense

### Current limitation

Exercise narration currently comes from broad templates in `narration_template`:

- `EXERCISE_LINE`
- `CUE_LINE`
- `LOAD_HINT`
- `LOGGING_PROMPT`

These are matched in [api/engine/steps/05_applyNarration.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/05_applyNarration.js#L565) using only broad context:

- `program_type`
- `day_focus`
- `purpose`
- `segment_type` for some fields

They are not matched by:

- `exercise_id`
- `swap_group_id_1` / `sw`
- `swap_group_id_2` / `sw2`
- movement pattern
- video asset

This makes generic cues and load narration too blunt for exercises like Wall Ball Shot, sled push, burpee broad jump, etc.

### Existing schema direction already supports this

`exercise_catalogue` already stores exercise-specific coaching-like fields:

- `form_cues`
- `warmup_hooks`

See:

- [migrations/V4__create_exercise_catalogue.sql](/c:/Users/alecp/bubble-workout-engine/migrations/V4__create_exercise_catalogue.sql#L18)
- [migrations/R__seed_exercise_catalogue.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_exercise_catalogue.sql)

So the system is already treating `exercise_catalogue` as the home for stable movement knowledge.

## Target Design

### 1. `exercise_catalogue` owns exercise-specific coaching content

Add or formalize exercise-owned fields for:

- primary cues
- setup guidance
- load guidance
- logging guidance
- video commentary text

These fields should describe what is always true for the movement, regardless of program context.

Examples:

- Wall Ball Shot:
  - drive from legs first
  - receive high and rebound quickly
  - keep target height consistent
- Farmer Carry:
  - short quick steps
  - stay tall
  - avoid over-gripping early

### 2. `narration_template` owns contextual composition

Keep `narration_template` focused on language that depends on workout context:

- program framing
- week focus / week notes
- day title / day goal
- segment title / execution / intent
- exercise line scaffolding, for example:
  - `{EX_NAME}: {SETS} x {REP_RANGE}`
  - “Move smoothly and stay just below redline”

This avoids stuffing context-sensitive text into the catalogue.

### 3. Runtime composition model

At apply-narration time:

1. build contextual program/day/segment narration from `narration_template`
2. hydrate each item with exercise-owned coaching content from `exercise_catalogue`
3. optionally allow contextual templates to augment or override exercise-owned fields when needed

This yields a cleaner layering model:

- catalogue = movement truth
- templates = session context

## Proposed Schema Direction

### Existing fields to keep using

Keep:

- `form_cues`
- `warmup_hooks`

### New proposed catalogue fields

Recommended additions to `exercise_catalogue`:

- `coaching_cues_json jsonb not null default '[]'::jsonb`
  - array of short cue strings
- `setup_notes_json jsonb not null default '[]'::jsonb`
  - optional setup or execution reminders
- `load_guidance text null`
  - stable exercise-specific loading/progression hint
- `logging_guidance text null`
  - stable exercise-specific logging hint
- `video_commentary_json jsonb not null default '[]'::jsonb`
  - future exercise-video commentary snippets
- `video_media_asset_id uuid null`
  - optional FK to `media_assets` or future exercise-video table

If you want a leaner first phase, the minimum useful set is:

- `coaching_cues_json`
- `load_guidance`
- `logging_guidance`
- `video_commentary_json`

### Notes on field shape

Prefer JSON arrays for multi-variant content that may later support:

- multiple cue variants
- app-side rotation
- video chapter notes

Prefer plain `text` for singular stable content such as:

- one canonical load guidance sentence
- one canonical logging guidance sentence

## What Should Move vs Stay

### Move to `exercise_catalogue`

Move these from template-driven generic exercise narration toward catalogue-owned content:

- `CUE_LINE`
- most `LOAD_HINT`
- most `LOGGING_PROMPT`

These are currently too generic and need to become exercise-aware.

### Keep in `narration_template`

Keep:

- `EXERCISE_LINE`
- all segment/day/week/program fields

Reason:

- `EXERCISE_LINE` is still useful as contextual scaffolding
- it depends on context and tokens such as sets/reps/segment framing

### Hybrid / optional override behavior

Allow contextual override only where necessary.

Examples:

- default cue comes from catalogue
- if a program type needs alternate wording, a template may append a contextual note

But the catalogue field should remain the baseline.

## Migration Strategy

### Phase 1: Add fields, no behavior change

1. Add new nullable / defaulted columns to `exercise_catalogue`
2. Expose them in `/admin/exercises`
3. Leave current `narration_template` behavior unchanged

Outcome:

- no output changes
- data can begin to be populated safely

### Phase 2: Read from catalogue in narration pipeline

Update `applyNarration` so exercise items can source:

- cues from `exercise_catalogue`
- load guidance from `exercise_catalogue`
- logging guidance from `exercise_catalogue`

Recommended first behavior:

- if catalogue field exists, use it
- otherwise fall back to current narration template

This makes rollout backward compatible.

### Phase 3: De-emphasize generic exercise templates

After sufficient catalogue coverage:

- stop relying on generic `CUE_LINE`, `LOAD_HINT`, and `LOGGING_PROMPT`
- optionally keep template support only for fallback or specialized overrides

### Phase 4: Video integration

When exercise videos arrive:

- use catalogue-owned `video_commentary_json`
- optionally associate each exercise with media assets / video ids

This makes exercise video narration naturally co-located with the exercise definition.

## Admin UX Changes

### `/admin/exercises`

This should become the primary editing surface for exercise-specific coaching content.

Recommended new fields in the exercise drawer:

- coaching cues
- load guidance
- logging guidance
- video commentary

This is already the right place conceptually because it is the exercise-owned admin surface.

### `/admin/narration`

Narrow its focus over time to:

- program
- week
- day
- segment
- transition
- exercise line scaffolding only

Eventually, the exercise-specific generic fields can be marked deprecated:

- `CUE_LINE`
- `LOAD_HINT`
- `LOGGING_PROMPT`

## Runtime Behavior Proposal

### Proposed item narration resolution order

For each exercise item:

1. build `line` from `EXERCISE_LINE` template
2. set `cues` from `exercise_catalogue.coaching_cues_json`
3. set `load_hint` from `exercise_catalogue.load_guidance`
4. set `log_prompt` from `exercise_catalogue.logging_guidance`
5. if any catalogue field is blank, fall back to template behavior during migration

This is the simplest backward-compatible rule.

## Pros

- better exercise specificity
- better fit for future video commentary
- clearer ownership model
- easier editorial workflow for movement-specific coaching
- reduces pressure on `narration_template` matching logic

## Risks

### 1. Some load guidance is context-sensitive

Not every load hint is universally true.

Examples:

- hypertrophy context
- strength context
- HYROX engine context

Mitigation:

- store only stable, exercise-owned load guidance in catalogue
- keep contextual wording in templates or rules when needed

### 2. Temporary duplication during migration

For a while, the same concept may live in both places:

- generic template fallback
- catalogue-owned exercise text

Mitigation:

- explicit precedence rules
- a deprecation plan for template exercise fields

### 3. Catalogue editing burden

This introduces more exercise-level editorial work.

Mitigation:

- migrate gradually
- prioritize high-value / high-visibility exercises first
- start with HYROX race stations and common compound lifts

## Recommended First Scope

Start with:

1. HYROX race stations and buy-ins
2. common strength anchors
3. movements where generic cues are clearly bad today

Examples:

- Wall Ball Shot
- Sled Push
- Sled Pull
- Burpee Broad Jump
- Farmer Carry
- Sandbag Lunge
- Ski Erg
- Row Erg
- Run Interval

## Acceptance Criteria For The Design

1. Exercise-specific cues can be authored in `exercise_catalogue` without needing narration-template hacks.
2. Future video commentary can live alongside the exercise record.
3. Program/day/segment narration remains template-driven and contextual.
4. Migration can be rolled out without breaking current preview or program generation.

## Concrete Recommendation

Yes: move exercise-specific cues and most exercise-specific load/logging narration into `exercise_catalogue`, and keep `narration_template` for block, segment, day, week, and program narration.

Do not remove `EXERCISE_LINE` from `narration_template`.

Best final split:

- `exercise_catalogue`
  - cues
  - stable exercise guidance
  - video commentary
- `narration_template`
  - contextual narrative scaffolding
  - segment/day/week/program phrasing

## Suggested Follow-On Specs

After this design is accepted, the next useful docs would be:

1. a schema migration spec for new `exercise_catalogue` fields
2. a runtime precedence spec for `applyNarration`
3. an admin UX spec for adding these fields to `/admin/exercises`
