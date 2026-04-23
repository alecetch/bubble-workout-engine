-- Structured technique content for exercise catalogue surfaces.
ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS technique_cue            TEXT NULL,
  ADD COLUMN IF NOT EXISTS technique_setup          TEXT NULL,
  ADD COLUMN IF NOT EXISTS technique_execution_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS technique_mistakes_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS technique_video_url      TEXT NULL;
