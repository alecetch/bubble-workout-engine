-- Sync program_exercise.exercise_name snapshots after the 2026-09-30 exercise naming cleanup.
-- Runs after R__exercise_catalogue_edits.sql (repeatables apply in description order).
-- Only rows still carrying an exact pre-cleanup name are touched, so the update is idempotent
-- and leaves blank or otherwise-customised names alone.
UPDATE program_exercise pe
SET exercise_name = ec.name
FROM exercise_catalogue ec,
  (VALUES
    ('incline_bb_bench_press', 'Incline Barbell Bench Press'),
    ('db_incline_press', 'Dumbbell Incline Press'),
    ('singlearm_db_row', 'Single-Arm Dumbbell Row'),
    ('singleleg_db_romanian_deadlift', 'Single-Leg Dumbbell Romanian Deadlift'),
    ('singleleg_kb_romanian_deadlift', 'Single-Leg Kettlebell Romanian Deadlift'),
    ('seated_db_calf_raise', 'Seated Dumbbell Calf Raise'),
    ('double_db_front_squat', 'Double Dumbbell Front Squat'),
    ('rear_delt_fly_machine_or_db', 'Rear Delt Fly (Machine or DB)'),
    ('stepup_weighted', 'Step-Up (Weighted)'),
    ('front_rack_carry', 'Front Rack Carry'),
    ('standing_calf_raise', 'Standing Calf Raise'),
    ('seated_calf_raise', 'Seated Calf Raise'),
    ('hack_squat_machine', 'Hack Squat Machine'),
    ('chestsupported_row_machine', 'Chest-Supported Row Machine'),
    ('face_pull', 'Face Pull'),
    ('straightarm_pulldown', 'Straight-Arm Pulldown'),
    ('overhead_cable_extension', 'Overhead Cable Extension'),
    ('skullcrusher', 'Skullcrusher'),
    ('db_rdl', 'Dumbbell RDL'),
    ('bstance_rdl', 'B-Stance RDL'),
    ('rdl_and_bent_over_row', 'RDL and Bent over row'),
    ('bodyweight_reverse_lunge', 'Reverse Lunge (Bodyweight)'),
    ('single_leg_standing_calf_raise', 'Single-Leg Standing Calf Raise (Loaded Optional)'),
    ('bb_row_upright_row', 'Barbell row (upright row)'),
    ('kb_row_upright_row', 'Kettlebell row (upright row)'),
    ('kb_row_upright_row_and_swing', 'Kettlebell row (upright row) and swing'),
    ('wall_ball', 'Wall Ball Shot'),
    ('dead_tread', 'Dead tread'),
    ('table_row', 'Table row'),
    ('wheelbarrow_pull', 'Wheelbarrow pull'),
    ('hamstring_walkouts', 'Hamstring walkouts'),
    ('kb_swing_high', 'Kettlebell Swing (high)'),
    ('kb_swing_low', 'Kettlebell Swing (low)'),
    ('pike_push_up', 'Pike Push Up'),
    ('atomic_push_ups', 'Atomic Push Ups'),
    ('closegrip_pushups', 'Close-Grip Push-Ups'),
    ('box_step_up', 'Box Step Up'),
    ('mountain_climber', 'Mountain Climbers'),
    ('walking_lunges', 'Walking Lunges'),
    ('db_walking_lunges', 'Dumbbell Walking Lunges'),
    ('kb_walking_lunges', 'Kettlebell Walking Lunges'),
    ('shuttle_runs', 'Shuttle Runs'),
    ('wide_table_rear_delt_row', 'Wide Table Rear-Delt Row'),
    ('cyclist_squat_heels_elevated', 'Cyclist Squat (Heels Elevated)'),
    ('devils_press', 'Devils Press'),
    ('weighted_pushup', 'Weighted Push-Up'),
    ('farmer_carry_weighted', 'Farmer Carry (weighted)'),
    ('singleleg_bodyweight_rdl', 'Single-Leg Bodyweight RDL'),
    ('standing_calf_raise_bodyweight', 'Standing Calf Raise (Bodyweight)')
  ) AS renamed(exercise_id, old_name)
WHERE pe.exercise_id = renamed.exercise_id
  AND pe.exercise_name = renamed.old_name
  AND ec.exercise_id = renamed.exercise_id;
