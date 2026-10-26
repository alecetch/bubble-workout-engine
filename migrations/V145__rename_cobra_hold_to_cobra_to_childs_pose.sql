-- The uploaded video for cooldown-cobra-hold shows a cobra flowing into child's pose, not a static
-- cobra hold. Rename the exercise and rewrite its cue and dose to match the video. Keep the id (program
-- history references it) and the target regions (core, chest): adding lats/upper_back would let it be
-- picked alongside Childs Pose in the same cool-down.
-- R__seed_cooldown_exercises.sql carries the same values for fresh databases; its insert is
-- WHERE NOT EXISTS, so this one-off update is what changes existing rows.
UPDATE cooldown_exercise
SET name = 'Cobra to Child''s Pose',
    cue_text = 'Lie face down with hands under the shoulders and gently press the chest up, hips down. Hold briefly, then push the hips back to your heels into child''s pose. Move slowly between the two.',
    duration_or_reps_label = '5 slow reps',
    updated_at = now()
WHERE cooldown_exercise_id = 'cooldown-cobra-hold';
