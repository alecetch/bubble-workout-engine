CREATE TABLE cooldown_exercise (
  cooldown_exercise_id      text PRIMARY KEY,
  name                    text NOT NULL,
  target_regions_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment_items_slugs   text[] NOT NULL DEFAULT '{}',
  cue_text                text,
  duration_or_reps_label  text,
  rounds                  integer,
  movement_class          text,
  is_archived             boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cooldown_exercise_regions_gin ON cooldown_exercise USING gin (target_regions_json);
CREATE INDEX idx_cooldown_exercise_equipment_gin ON cooldown_exercise USING gin (equipment_items_slugs);

CREATE TABLE cooldown_exercise_media (
  cooldown_exercise_id           text PRIMARY KEY REFERENCES cooldown_exercise(cooldown_exercise_id) ON DELETE CASCADE,
  still_image_key              text NOT NULL,
  still_image_is_placeholder   boolean NOT NULL DEFAULT true,
  video_key                    text,
  video_status                 text NOT NULL DEFAULT 'none' CHECK (video_status IN ('none','processing','ready','failed')),
  video_duration_sec           numeric,
  video_source_filename        text,
  poster_frame_key             text,
  uploaded_by                  text,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);
