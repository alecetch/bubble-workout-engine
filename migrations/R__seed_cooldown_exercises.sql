-- Static holds only; bodyweight library sharing the existing placeholder asset.
-- Matches or exceeds active warm-up coverage for every muscle region as of 2026-09-18.
-- Cardio is intentionally excluded: it is not a muscle region for static stretching.
INSERT INTO cooldown_exercise (
  cooldown_exercise_id, name, target_regions_json, equipment_items_slugs,
  cue_text, duration_or_reps_label, rounds, movement_class
)
SELECT * FROM (VALUES
  ('cooldown-standing-quad-stretch', 'Standing Quad Stretch', '["quads"]'::jsonb, '{}'::text[], 'Stand tall, hold one ankle behind you, and keep knees close. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-side-lying-quad-stretch', 'Side-lying Quad Stretch', '["quads"]'::jsonb, '{}'::text[], 'Lie on your side and hold the top ankle behind you without arching. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-figure-four-stretch', 'Figure-four Glute Stretch', '["glutes"]'::jsonb, '{}'::text[], 'Lie back with one ankle over the opposite knee and hold the thigh toward you. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-seated-glute-stretch', 'Seated Glute Stretch', '["glutes"]'::jsonb, '{}'::text[], 'Sit with one leg crossed and gently hold the knee toward the opposite shoulder. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-seated-hamstring-stretch', 'Seated Hamstring Stretch', '["hamstrings"]'::jsonb, '{}'::text[], 'Extend one leg, hinge gently forward, and hold with a long back. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-supine-hamstring-stretch', 'Supine Hamstring Stretch', '["hamstrings"]'::jsonb, '{}'::text[], 'Lie back, support one thigh with your hands, and hold the leg comfortably extended. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-straight-knee-calf-stretch', 'Straight-knee Calf Wall Stretch', '["calves"]'::jsonb, '{}'::text[], 'Place hands on a wall, keep the rear knee straight and heel down, and hold. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-bent-knee-calf-stretch', 'Bent-knee Calf Wall Stretch', '["calves"]'::jsonb, '{}'::text[], 'Facing a wall, bend the rear knee slightly with the heel down and hold. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-doorway-pec-stretch', 'Doorway Pec Stretch', '["chest"]'::jsonb, '{}'::text[], 'Rest one forearm against a doorway and hold a gentle chest opening. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-supine-chest-stretch', 'Supine Chest Stretch', '["chest"]'::jsonb, '{}'::text[], 'Lie on your back with arms open and palms up. Rest in a comfortable chest stretch.', '30 sec', 1, 'stretch'),
  ('cooldown-childs-pose', 'Childs Pose', '["lats","upper_back"]'::jsonb, '{}'::text[], 'Sit hips toward heels, reach arms forward, and hold while breathing slowly.', '30 sec', 1, 'stretch'),
  ('cooldown-side-reach-childs-pose', 'Side-reach Childs Pose', '["lats"]'::jsonb, '{}'::text[], 'From childs pose, place both hands to one side and hold the side-body stretch. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-cross-body-shoulder-stretch', 'Cross-body Shoulder Stretch', '["shoulders","rear_delts"]'::jsonb, '{}'::text[], 'Hold one arm across the chest with the shoulder relaxed. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-side-lying-rear-shoulder-stretch', 'Side-lying Rear Shoulder Stretch', '["rear_delts"]'::jsonb, '{}'::text[], 'Lie on your side and hold the top arm across your chest with gentle support. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-overhead-shoulder-stretch', 'Overhead Shoulder Stretch', '["shoulders"]'::jsonb, '{}'::text[], 'Reach one arm overhead, support the elbow with the other hand, and hold gently. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-overhead-triceps-stretch', 'Overhead Triceps Stretch', '["triceps"]'::jsonb, '{}'::text[], 'Bend one elbow overhead and gently support it with the opposite hand. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-cross-chest-triceps-stretch', 'Cross-chest Triceps Stretch', '["triceps"]'::jsonb, '{}'::text[], 'Bend one arm across the upper chest and gently support the elbow in a steady hold. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-biceps-wall-stretch', 'Biceps Wall Stretch', '["biceps"]'::jsonb, '{}'::text[], 'Place one palm against a wall with the arm extended and turn away gently. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-seated-biceps-stretch', 'Seated Biceps Stretch', '["biceps"]'::jsonb, '{}'::text[], 'Sit with palms behind you and fingers pointing away. Hold with elbows comfortably straight.', '30 sec', 1, 'stretch'),
  ('cooldown-wrist-flexor-stretch', 'Wrist Flexor Stretch', '["grip","arms"]'::jsonb, '{}'::text[], 'Extend one arm palm up and gently draw the fingers back with the other hand. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-wrist-extensor-stretch', 'Wrist Extensor Stretch', '["grip","arms"]'::jsonb, '{}'::text[], 'Extend one arm palm down and gently fold the wrist with the other hand. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-rounded-back-hold', 'Rounded-back Hold', '["upper_back"]'::jsonb, '{}'::text[], 'On hands and knees, gently round the upper back and hold still while breathing.', '30 sec', 1, 'stretch'),
  ('cooldown-seated-upper-back-stretch', 'Seated Upper-back Stretch', '["upper_back"]'::jsonb, '{}'::text[], 'Clasp hands forward and gently reach away, holding the shoulder blades apart.', '30 sec', 1, 'stretch'),
  ('cooldown-sphinx-hold', 'Sphinx Hold', '["core"]'::jsonb, '{}'::text[], 'Lie on your front supported on forearms and hold a gentle abdominal stretch.', '30 sec', 1, 'stretch'),
  ('cooldown-supine-twist-hold', 'Supine Twist Hold', '["core"]'::jsonb, '{}'::text[], 'Lie back with bent knees resting to one side and shoulders relaxed. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-kneeling-hip-flexor-stretch', 'Kneeling Hip-flexor Stretch', '["quads","glutes"]'::jsonb, '{}'::text[], 'In a half-kneeling position, tuck the pelvis gently and hold with the torso upright. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-standing-biceps-stretch', 'Standing Biceps Stretch', '["biceps"]'::jsonb, '{}'::text[], 'Clasp hands behind your hips with palms together, gently straighten the elbows, and hold without lifting the shoulders.', '30 sec', 1, 'stretch'),
  ('cooldown-prone-pec-stretch', 'Prone Pec Stretch', '["chest"]'::jsonb, '{}'::text[], 'Lie face down with one arm extended to the side. Gently turn the chest away from that arm and hold a comfortable stretch. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-supine-knee-to-shoulder-stretch', 'Supine Knee-to-opposite-shoulder Stretch', '["glutes"]'::jsonb, '{}'::text[], 'Lie on your back and gently draw one bent knee toward the opposite shoulder. Keep the pelvis relaxed and hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-finger-extension-stretch', 'Finger Extension Stretch', '["grip"]'::jsonb, '{}'::text[], 'Support one hand with the other and gently draw the fingers back together with the wrist relaxed. Hold each hand without forcing the joints.', '30 sec', 2, 'stretch'),
  ('cooldown-staggered-standing-hamstring-stretch', 'Staggered Standing Hamstring Stretch', '["hamstrings"]'::jsonb, '{}'::text[], 'Place one heel a short step forward, soften the back knee, and hinge at the hips. Hold with a long back and the front knee slightly soft. Hold each side.', '30 sec', 2, 'stretch'),
  ('cooldown-wall-shoulder-flexion-stretch', 'Wall Shoulder Flexion Stretch', '["shoulders"]'::jsonb, '{}'::text[], 'Place both palms on a wall above shoulder height, step back, and gently lower the chest. Hold with the ribs relaxed and elbows comfortably straight.', '30 sec', 1, 'stretch'),
  ('cooldown-behind-back-shoulder-stretch', 'Behind-back Shoulder Stretch', '["shoulders"]'::jsonb, '{}'::text[], 'Rest the back of one hand against the lower back. Use the other hand to gently support that elbow toward the body and hold each side without forcing the range.', '30 sec', 2, 'stretch'),
  ('cooldown-thread-the-needle-hold', 'Thread-the-needle Hold', '["upper_back"]'::jsonb, '{}'::text[], 'From hands and knees, slide one arm beneath the chest and rest that shoulder toward the floor. Stay still in a comfortable upper-back stretch. Hold each side.', '30 sec', 2, 'stretch')
) AS rows(cooldown_exercise_id, name, target_regions_json, equipment_items_slugs, cue_text, duration_or_reps_label, rounds, movement_class)
WHERE NOT EXISTS (
  SELECT 1 FROM cooldown_exercise ce WHERE ce.cooldown_exercise_id = rows.cooldown_exercise_id
);

INSERT INTO cooldown_exercise_media (cooldown_exercise_id, still_image_key, still_image_is_placeholder)
SELECT ce.cooldown_exercise_id, 'exercise-media/_placeholder/still.jpg', true
FROM cooldown_exercise ce
WHERE NOT EXISTS (
  SELECT 1 FROM cooldown_exercise_media cm WHERE cm.cooldown_exercise_id = ce.cooldown_exercise_id
);
