-- V22: Add post_segment_rest_sec to workout_segment.
-- Stores the inter-block rest duration (seconds) prescribed after each segment.
-- Default 0 preserves existing behaviour for all non-Hyrox program types.

ALTER TABLE workout_segment
  ADD COLUMN IF NOT EXISTS post_segment_rest_sec INTEGER NOT NULL DEFAULT 0;
