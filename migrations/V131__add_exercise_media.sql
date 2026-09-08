CREATE TABLE exercise_media (
  exercise_id                  text PRIMARY KEY REFERENCES exercise_catalogue(exercise_id) ON DELETE CASCADE,
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

INSERT INTO exercise_media (exercise_id, still_image_key)
SELECT exercise_id, 'exercise-media/_placeholder/still.jpg'
FROM exercise_catalogue
WHERE is_archived = FALSE
ON CONFLICT (exercise_id) DO NOTHING;
