ALTER TABLE warmup_exercise_media
  ADD COLUMN promoted_still_at timestamptz NULL,
  ADD COLUMN promoted_video_at timestamptz NULL;

ALTER TABLE cooldown_exercise_media
  ADD COLUMN promoted_still_at timestamptz NULL,
  ADD COLUMN promoted_video_at timestamptz NULL;
