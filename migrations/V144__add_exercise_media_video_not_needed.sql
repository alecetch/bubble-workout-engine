ALTER TABLE exercise_media
  ADD COLUMN video_not_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN video_not_needed_pending_promotion boolean NOT NULL DEFAULT false;
ALTER TABLE warmup_exercise_media
  ADD COLUMN video_not_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN video_not_needed_pending_promotion boolean NOT NULL DEFAULT false;
ALTER TABLE cooldown_exercise_media
  ADD COLUMN video_not_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN video_not_needed_pending_promotion boolean NOT NULL DEFAULT false;
