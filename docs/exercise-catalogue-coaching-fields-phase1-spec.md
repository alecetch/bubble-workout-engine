# Exercise Catalogue Coaching Fields — Phase 1 Spec

## Goal

Add three coaching content fields to `exercise_catalogue` so exercise-specific cues, load guidance, and logging guidance can be authored directly on the exercise record.

Phase 1 is **schema and admin UI only**. The narration pipeline is not changed. No program generation output changes in this phase.

---

## Decision: Replace `form_cues` with `coaching_cues_json`

`form_cues` is a `text null` column added in V4. It is NULL for every row in the database and is not consumed by any engine step. Its intent (exercise form cues) overlaps exactly with the proposed `coaching_cues_json` field.

**Recommendation: drop `form_cues` and replace it with `coaching_cues_json jsonb not null default '[]'::jsonb`.**

Reasons:

- No data loss — all rows are NULL
- `jsonb` array is strictly better for this use case: supports multiple cues, future app-side rotation, and typed reads
- Eliminates the ambiguity of having two fields for the same concept
- Cleans up the schema before any content is authored

---

## New Fields

Three fields replace or extend the coaching content surface on `exercise_catalogue`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `coaching_cues_json` | `jsonb not null` | `'[]'::jsonb` | Array of short cue strings (replaces `form_cues`) |
| `load_guidance` | `text null` | NULL | One stable sentence on how to load or scale this exercise |
| `logging_guidance` | `text null` | NULL | One stable sentence on what to log for this exercise |

---

## What Is NOT in Phase 1

- `video_commentary_json` — deferred until the video feature is actually designed
- `video_media_asset_id` — deferred
- `setup_notes_json` — not needed yet; `coaching_cues_json` covers the immediate use case
- Any changes to the narration pipeline (`05_applyNarration.js`, `06_emitPlan.js`, `generateProgramV2.js`) — Phase 2 only

---

## Stability Rule for Content Authors

A field in `exercise_catalogue` should contain content that is true for this movement regardless of program type, phase, or context.

**Test:** "Would this cue or hint be wrong in a different program type?" If yes → it belongs in a narration template, not the catalogue.

Examples:

- ✓ "Drive from legs first, then release the ball" — always true for Wall Ball Shot
- ✗ "Use a weight that allows smooth, unbroken reps" — context-sensitive, stays in a template

---

## Files Changed

### 1. `migrations/V36__exercise_catalogue_coaching_fields.sql` (new file)

```sql
-- Replace form_cues (text, all NULL, unused) with coaching_cues_json.
-- Add load_guidance and logging_guidance for stable exercise-owned coaching content.

alter table exercise_catalogue drop column if exists form_cues;

alter table exercise_catalogue
  add column if not exists coaching_cues_json jsonb not null default '[]'::jsonb,
  add column if not exists load_guidance text null,
  add column if not exists logging_guidance text null;
```

### 2. `migrations/R__seed_exercise_catalogue.sql`

Remove every reference to `form_cues` from all column lists and all `ON CONFLICT DO UPDATE SET` blocks. The three new fields have safe defaults and do not need to be explicitly listed in the seed file.

### 3. `api/src/routes/adminExerciseCatalogue.js`

- Add `"coaching_cues_json"` to the `JSONB_FIELDS` Set (line ~41)
- In `buildInsertSql` COLS array: replace `"form_cues"` with `"coaching_cues_json"`, then append `"load_guidance"` and `"logging_guidance"` to the array
- In the CSV import row mapping (the object literal around line 941): replace `form_cues: row.form_cues || null` with `coaching_cues_json: toJson(row.coaching_cues_json)` and add `load_guidance: row.load_guidance || null` and `logging_guidance: row.logging_guidance || null`

### 4. `api/admin/exercises.html`

- Replace the `form_cues` textarea (around line 579) with a `coaching_cues_json` JSON textarea (same style as `warmup_hooks`)
- Add a plain-text textarea for `load_guidance`
- Add a plain-text textarea for `logging_guidance`
- In the `FIELDS` constant (around line 1314): replace `"form_cues"` with `"coaching_cues_json"`, and add `"load_guidance"` and `"logging_guidance"`
- In the save payload (around line 1476): replace the `form_cues` entry with the three new fields, where `coaching_cues_json` is parsed with `toJson` and the text fields are saved as `getFV(...) || null`

### 5. `api/scripts/importExerciseCatalogueFromCsv.js`

- In the field mapping (around line 168): replace `form_cues: toNullableText(...)` with `coaching_cues_json: parseJsonArray(firstNonEmpty(row, ["coaching_cues_json"]))` and add `load_guidance: toNullableText(firstNonEmpty(row, ["load_guidance"]))` and `logging_guidance: toNullableText(firstNonEmpty(row, ["logging_guidance"]))`
- In the INSERT columns list and `ON CONFLICT DO UPDATE SET` block: replace `form_cues` with `coaching_cues_json`, add `load_guidance` and `logging_guidance`
- In the values array (around line 278): replace the `form_cues` value with `JSON.stringify(r.coaching_cues_json)` (passed through the JSONB path), add `r.load_guidance` and `r.logging_guidance` as nullable text

---

## No Pipeline Changes

`05_applyNarration.js`, `06_emitPlan.js`, `exerciseSelector.js`, and `generateProgramV2.js` are not modified in Phase 1. Narration output is unchanged.

---

## Acceptance Criteria

1. `form_cues` column no longer exists in `exercise_catalogue` after running migrations.
2. All three new columns are present with correct types and defaults.
3. In `/admin/exercises`, coaching cues can be authored as a JSON array (e.g. `["Stay tall", "Short quick steps"]`), and load/logging guidance as plain text.
4. Saving an exercise with the new fields round-trips correctly — data persists and reloads from the drawer.
5. Existing program generation, narration, and preview output are unchanged.
6. All existing tests pass (`node --test`).

---

## Recommended First Content (after Phase 1 ships)

Start authoring cues for:

- Wall Ball Shot
- Sled Push / Sled Pull
- Burpee Broad Jump
- Farmer Carry
- Sandbag Lunge
- Ski Erg / Row Erg / Run Interval
- Common strength anchors (squat, hinge, press, pull patterns)
