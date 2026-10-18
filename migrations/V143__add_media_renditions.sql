ALTER TABLE exercise_media ADD COLUMN still_renditions_at timestamptz, ADD COLUMN still_thumbhash text, ADD COLUMN poster_renditions_at timestamptz;
ALTER TABLE warmup_exercise_media ADD COLUMN still_renditions_at timestamptz, ADD COLUMN still_thumbhash text, ADD COLUMN poster_renditions_at timestamptz;
ALTER TABLE cooldown_exercise_media ADD COLUMN still_renditions_at timestamptz, ADD COLUMN still_thumbhash text, ADD COLUMN poster_renditions_at timestamptz;
ALTER TABLE media_assets ADD COLUMN renditions_at timestamptz, ADD COLUMN thumbhash text;
