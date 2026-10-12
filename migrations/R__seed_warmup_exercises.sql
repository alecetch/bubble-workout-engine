INSERT INTO warmup_exercise (
  warmup_exercise_id,
  name,
  target_regions_json,
  equipment_items_slugs,
  cue_text,
  duration_or_reps_label,
  rounds,
  movement_class
)
SELECT *
FROM (VALUES
  ('warmup-arm-circles', 'Arm Circles', '["arms","shoulders"]'::jsonb, '{}'::text[], 'Keep ribs stacked and make smooth circles both directions.', '20 sec', 1, 'mobility'),
  ('warmup-wrist-circles', 'Wrist Circles', '["grip","arms"]'::jsonb, '{}'::text[], 'Open and close the hands while circling through comfortable range.', '10 reps', 1, 'mobility'),
  ('warmup-elbow-pump', 'Elbow Pump', '["biceps","triceps"]'::jsonb, '{}'::text[], 'Flex and extend the elbows with relaxed shoulders.', '12 reps', 1, 'activation'),
  ('warmup-scap-push-up', 'Scap Push-up', '["chest","upper_back","shoulders"]'::jsonb, '{}'::text[], 'Keep arms straight and glide shoulder blades around the ribs.', '10 reps', 1, 'activation'),
  ('warmup-thoracic-open-book', 'Thoracic Open Book', '["chest","lats","upper_back"]'::jsonb, '{}'::text[], 'Rotate from the upper back and breathe into the open side.', '8 reps', 1, 'mobility'),
  ('warmup-cat-cow', 'Cat-cow', '["core","upper_back"]'::jsonb, '{}'::text[], 'Move slowly from tailbone to neck without forcing end range.', '8 reps', 1, 'mobility'),
  ('warmup-dead-bug-reach', 'Dead Bug Reach', '["core"]'::jsonb, '{}'::text[], 'Exhale as the heel reaches away and keep the low back quiet.', '8 reps', 1, 'activation'),
  ('warmup-glute-bridge', 'Glute Bridge', '["glutes","hamstrings"]'::jsonb, '{}'::text[], 'Drive through heels, pause at the top, and avoid over-arching.', '10 reps', 1, 'activation'),
  ('warmup-bodyweight-good-morning', 'Bodyweight Good Morning', '["hamstrings","glutes"]'::jsonb, '{}'::text[], 'Hinge back with soft knees and keep the torso long.', '10 reps', 1, 'patterning'),
  ('warmup-squat-to-stand', 'Squat to Stand', '["quads","glutes","hamstrings"]'::jsonb, '{}'::text[], 'Sink into a comfortable squat, then lift hips and re-bend knees.', '6 reps', 1, 'mobility'),
  ('warmup-knee-hug-lunge', 'Knee Hug to Lunge', '["quads","glutes"]'::jsonb, '{}'::text[], 'Own balance first, then step into an easy lunge.', '6 reps', 1, 'mobility'),
  ('warmup-ankle-bounces', 'Ankle Bounces', '["calves"]'::jsonb, '{}'::text[], 'Stay tall and make light, springy contacts through the forefoot.', '20 sec', 1, 'activation'),
  ('warmup-calf-rocks', 'Calf Rocks', '["calves"]'::jsonb, '{}'::text[], 'Rock forward until the calf works, then reset with control.', '12 reps', 1, 'mobility'),
  ('warmup-prone-w-raise', 'Prone W Raise', '["rear_delts","upper_back"]'::jsonb, '{}'::text[], 'Lift elbows gently, squeeze shoulder blades, and keep the neck relaxed.', '8 reps', 1, 'activation'),
  ('warmup-wall-slides', 'Wall Slides', '["shoulders","rear_delts","upper_back"]'::jsonb, '{}'::text[], 'Slide only as high as ribs can stay down and wrists stay comfortable.', '8 reps', 1, 'mobility'),
  ('warmup-push-up-plus', 'Push-up Plus', '["chest","triceps","shoulders"]'::jsonb, '{}'::text[], 'Finish each rep by reaching the floor away without shrugging.', '8 reps', 1, 'activation'),
  ('warmup-lat-prayer-reach', 'Lat Prayer Reach', '["lats"]'::jsonb, '{}'::text[], 'Sit hips back and breathe into the side ribs.', '20 sec', 1, 'mobility'),
  ('warmup-biceps-shadow-curl', 'Biceps Shadow Curl', '["biceps"]'::jsonb, '{}'::text[], 'Curl through a full range without shrugging the shoulders.', '12 reps', 1, 'activation'),
  ('warmup-light-db-curl', 'Light Dumbbell Curl', '["biceps"]'::jsonb, '{dumbbells}'::text[], 'Use a light load and control the lowering phase.', '10 reps', 1, 'activation'),
  ('warmup-fist-clench-spread', 'Fist Clench and Spread', '["grip"]'::jsonb, '{}'::text[], 'Squeeze fully, then spread the fingers wide before repeating.', '15 reps', 1, 'activation'),
  ('warmup-farmers-carry-prep', 'Farmer''s Carry Prep', '["grip"]'::jsonb, '{dumbbells}'::text[], 'Stand tall and let the grip work without shrugging the shoulders.', '20m', 2, 'patterning'),
  ('warmup-jumping-jacks', 'Jumping Jacks', '["cardio"]'::jsonb, '{}'::text[], 'Land softly and keep a steady, relaxed rhythm.', '30 sec', 1, 'cardio'),
  ('warmup-high-knees', 'High Knees', '["cardio"]'::jsonb, '{}'::text[], 'Drive the knees up while keeping the chest tall.', '20 sec', 1, 'cardio'),
  ('warmup-bike-erg-easy-spin', 'Bike Erg Easy Spin', '["cardio"]'::jsonb, '{bike_erg}'::text[], 'Hold an easy, conversational pace to raise heart rate.', '3 min', 1, 'cardio'),
  ('warmup-row-erg-easy-pull', 'Row Erg Easy Pull', '["cardio"]'::jsonb, '{row_erg}'::text[], 'Long, relaxed strokes at an easy pace.', '3 min', 1, 'cardio'),
  ('warmup-cossack-squat', 'Cossack Squat', '["quads","glutes","hamstrings"]'::jsonb, '{}'::text[], 'Shift side to side, sitting into one hip while the other leg stays straight. Alternate sides.', '6 reps', 1, 'mobility'),
  ('warmup-kb-cossack-squat', 'Kettlebell Cossack Squat', '["quads","glutes"]'::jsonb, '{kettlebells}'::text[], 'Hold a light kettlebell at the chest as a counterbalance and sink only as deep as the heel stays down. Alternate sides.', '6 reps', 1, 'patterning'),
  ('warmup-walkout-shoulder-tap', 'Walkout to Shoulder Tap', '["hamstrings","shoulders","core"]'::jsonb, '{}'::text[], 'Walk the hands out to a plank, tap each shoulder without rocking the hips, then walk back.', '5 reps', 1, 'activation'),
  ('warmup-worlds-greatest-stretch', 'World''s Greatest Stretch', '["quads","hamstrings","upper_back"]'::jsonb, '{}'::text[], 'Step into a deep lunge, drop the elbow to the instep, then rotate and reach to the ceiling. Alternate sides.', '6 reps', 1, 'mobility'),
  ('warmup-plank-up-down', 'Plank Up-Down', '["triceps","core","shoulders"]'::jsonb, '{}'::text[], 'Move from forearm plank to hands and back, one arm at a time, without rocking the hips.', '6 reps', 1, 'activation'),
  ('warmup-floor-triceps-dip', 'Floor Triceps Dip', '["triceps","shoulders"]'::jsonb, '{}'::text[], 'Sit with hands behind the hips, fingers forward. Lift the hips, then bend and straighten the elbows.', '10 reps', 1, 'activation'),
  -- resistance_band equipment item is added by the exercise-naming-cleanup-round-2 work; until then this row is never selected.
  ('warmup-light-band-curl', 'Light Band Curl', '["biceps"]'::jsonb, '{resistance_band}'::text[], 'Stand on the band, elbows fixed at the sides, and lower slowly.', '15 reps', 1, 'activation'),
  ('warmup-wrist-flexor-extensor-stretch', 'Wrist Flexor and Extensor Stretch', '["grip","arms"]'::jsonb, '{}'::text[], 'Arm straight. Gently pull the fingers back, then the back of the hand down. Do not force end range.', '20 sec', 1, 'mobility'),
  ('warmup-dead-hang', 'Dead Hang', '["grip","lats","shoulders"]'::jsonb, '{pullup_bar}'::text[], 'Hold the bar with a full grip and relax into the shoulders. Short and easy, not to failure.', '15 sec', 1, 'activation')
) AS rows(warmup_exercise_id, name, target_regions_json, equipment_items_slugs, cue_text, duration_or_reps_label, rounds, movement_class)
WHERE NOT EXISTS (
  SELECT 1 FROM warmup_exercise we WHERE we.warmup_exercise_id = rows.warmup_exercise_id
);

-- upper_back is already well covered by scap-push-up/cat-cow/prone-w-raise/wall-slides;
-- trim it here so this region doesn't exceed the review's per-region authoring guideline.
UPDATE warmup_exercise
SET target_regions_json = '["chest","lats"]'::jsonb
WHERE warmup_exercise_id = 'warmup-thoracic-open-book'
  AND target_regions_json = '["chest","lats","upper_back"]'::jsonb;

INSERT INTO warmup_exercise_media (warmup_exercise_id, still_image_key, still_image_is_placeholder)
SELECT we.warmup_exercise_id, 'exercise-media/_placeholder/still.jpg', true
FROM warmup_exercise we
WHERE NOT EXISTS (
  SELECT 1 FROM warmup_exercise_media wm WHERE wm.warmup_exercise_id = we.warmup_exercise_id
);
