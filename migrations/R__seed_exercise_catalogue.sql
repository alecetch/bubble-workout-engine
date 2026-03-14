-- Seed: exercise catalogue baseline sourced from api/data/export_ExerciseCatalogue_2026-03-08.csv
-- Idempotent via ON CONFLICT (exercise_id) DO UPDATE.

WITH seed_rows AS (
  SELECT *
  FROM (
    VALUES
      ('air_bike_sprint', 'Air Bike Sprint', 'engine', 'cyclical_engine', '2', 'False', 'False', '1', '[]', '{}', '3', 'True', 'high_power', '{assault_bike}', '["assault_bike"]', NULL, '0', NULL, '["conditioning_main", "finisher"]', 'engine', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('assault_bike', 'Assault Bike', 'engine', 'cyclical_engine', '1', 'False', 'False', '1', '[]', '{}', '3', 'True', 'sustainable', '{assault_bike}', '["assault_bike"]', NULL, '0', NULL, '["conditioning_main"]', 'engine', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('battle_ropes', 'Battle Ropes', 'engine', 'locomotion', '1', 'False', 'False', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{battle_rope}', '["battle_rope"]', NULL, '1', NULL, '["conditioning_main"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('bear_crawl', 'Bear Crawl', 'engine', 'locomotion', '1', 'False', 'False', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{}', '[]', NULL, '1', NULL, '["conditioning_main"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('bike_erg', 'Bike Erg', 'engine', 'cyclical_engine', '1', 'False', 'False', '1', '[]', '{}', '3', 'True', 'sustainable', '{bike_erg}', '["bike_erg"]', NULL, '0', NULL, '["conditioning_main"]', 'engine', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('box_jump', 'Box Jump', 'engine', 'locomotion', '2', 'False', 'False', '2', '[]', '{}', '3', 'False', 'high_power', '{box}', '["box"]', NULL, '3', NULL, '["conditioning_main"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('burpee', 'Burpee', 'engine', 'locomotion', '2', 'False', 'False', '2', '[]', '{}', '3', 'False', 'mixed_modal', '{}', '[]', NULL, '3', NULL, '["conditioning_main", "finisher"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('chest_supported_row', 'Chest-Supported Row Machine', 'compound', 'pull_horizontal', '1', 'False', 'False', '1', '[]', '{}', '2', 'False', NULL, '{row_machine}', '["row_machine"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('hanging_knee_raise', 'Hanging Knee Raise', 'core', 'anti_extension', '1', 'False', 'False', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{pullup_bar}', '["pullup_bar"]', NULL, '0', NULL, '["conditioning_main", "hypertrophy_secondary"]', 'core', NULL, '["core"]', '["general_heat", "brace"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('jump_rope', 'Jump Rope', 'engine', 'locomotion', '1', 'False', 'False', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{jump_rope}', '["jump_rope"]', NULL, '2', NULL, '["conditioning_main"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('mountain_climber', 'Mountain Climbers', 'engine', 'locomotion', '1', 'False', 'False', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{}', '[]', NULL, '2', NULL, '["conditioning_main"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('outdoor_run', 'Outdoor Run', 'engine', 'cyclical_engine', '1', 'False', 'False', '1', '[]', '{}', '3', 'True', 'sustainable', '{}', '[]', NULL, '2', NULL, '["conditioning_main"]', 'engine', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('pull_up', 'Pull-Up', 'compound', 'pull_vertical', '2', 'False', 'False', '2', '[]', '{}', '2', 'False', NULL, '{pullup_bar}', '["pullup_bar"]', NULL, '1', NULL, '["hypertrophy_secondary"]', 'pull_vertical', NULL, '["lats", "biceps"]', '["general_heat", "shoulders", "scap_pull", "lat_engage"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('ring_row', 'Ring Row', 'compound', 'pull_horizontal', '1', 'False', 'False', '1', '[]', '{}', '3', 'False', NULL, '{rings}', '["rings"]', NULL, '0', NULL, '["conditioning_main"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('row_erg', 'Row Erg', 'engine', 'cyclical_engine', '1', 'False', 'False', '1', '[]', '{}', '3', 'True', 'sustainable', '{row_erg}', '["row_erg"]', NULL, '0', NULL, '["conditioning_main"]', 'engine', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('lat_pulldown', 'Lat Pulldown', 'compound', 'pull_vertical', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{lat_pulldown}', '["lat_pulldown"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'pull_vertical', NULL, '["lats", "biceps"]', '["general_heat", "shoulders", "scap_pull", "lat_engage"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('shuttle_run', 'Shuttle Runs', 'engine', 'locomotion', '1', 'False', 'False', '1', '[]', '{}', '3', 'False', 'high_power', '{}', '[]', NULL, '2', NULL, '["conditioning_main"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('ski_erg', 'Ski Erg', 'engine', 'cyclical_engine', '1', 'False', 'False', '1', '[]', '{}', '3', 'True', 'sustainable', '{ski_erg}', '["ski_erg"]', NULL, '0', NULL, '["conditioning_main"]', 'engine', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('standing_calf_raise_bw', 'Standing Calf Raise (Bodyweight)', 'isolation', 'calf', '1', 'False', 'False', '1', '[]', '{}', '2', 'False', NULL, '{bodyweight}', '["bodyweight"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'calf_iso', NULL, '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('toes_to_bar', 'Toes-to-Bar', 'core', 'anti_extension', '3', 'False', 'False', '3', '[]', '{}', '2', 'False', 'mixed_modal', '{pullup_bar}', '["pullup_bar"]', NULL, '1', NULL, '["conditioning_main"]', 'core', NULL, '["core"]', '["general_heat", "brace"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('treadmill_run', 'Treadmill Run', 'engine', 'cyclical_engine', '1', 'False', 'False', '1', '[]', '{}', '3', 'True', 'sustainable', '{treadmill}', '["treadmill"]', NULL, '1', NULL, '["conditioning_main"]', 'engine', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', NULL),
      ('sled_pull', 'Sled Pull', 'engine', 'locomotion', '2', 'False', 'True', '1', '[]', '{}', '3', 'False', 'high_power', '{sled}', '["sled"]', NULL, '1', NULL, '["conditioning_main", "finisher"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('barbell_back_squat', 'Barbell Back Squat', 'compound', 'squat', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell}', '["barbell"]', NULL, '1', NULL, '["strength_main"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('seated_calf_raise', 'Seated Calf Raise', 'isolation', 'locomotion', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{calf_machine}', '["calf_machine"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'calf_iso', NULL, '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('bench_press', 'Barbell Bench Press', 'compound', 'push_horizontal', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell,bench}', '["barbell", "bench"]', NULL, '0', NULL, '["strength_main"]', 'push_horizontal_barbell', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('barbell_row', 'Barbell Bent-Over Row', 'compound', 'pull_horizontal', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell}', '["barbell"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('bb_curl', 'Barbell Curl', 'isolation', 'pull_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{barbell}', '["barbell"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'arms', NULL, '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('barbell_deadlift', 'Barbell Deadlift', 'compound', 'hinge', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell}', '["barbell"]', NULL, '0', NULL, '["strength_main", "hypertrophy_main"]', 'hinge_barbell', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('barbell_front_squat', 'Barbell Front Squat', 'compound', 'squat', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell}', '["barbell"]', NULL, '1', NULL, '["strength_main"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('barbell_good_morning', 'Barbell Good Morning', 'compound', 'hinge', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell}', '["barbell"]', NULL, '0', NULL, '["hypertrophy_secondary", "strength_main"]', 'hinge_barbell', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('hip_thrust', 'Barbell Hip Thrust', 'isolation', 'hinge', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{barbell,bench}', '["barbell", "bench"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'glute_iso', NULL, '["glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('ohp', 'Barbell Overhead Press', 'compound', 'push_vertical', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell}', '["barbell"]', NULL, '0', NULL, '["strength_main"]', 'push_vertical', NULL, '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('barbell_rdl', 'Barbell Romanian Deadlift', 'compound', 'hinge', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell}', '["barbell"]', NULL, '0', NULL, '["strength_main", "hypertrophy_secondary"]', 'hinge_barbell', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('barbell_standing_calf_raise', 'Barbell Standing Calf Raise', 'isolation', 'calf', '2', 'False', 'True', '2', '[]', '{}', '2', 'False', NULL, '{barbell}', '["barbell"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'calf_iso', NULL, '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('bulgarian_split_squat', 'Bulgarian Split Squat', 'isolation', 'lunge', '2', 'False', 'True', '2', '[]', '{}', '2', 'False', NULL, '{dumbbells,bench}', '["dumbbells", "bench"]', NULL, '1', NULL, '["hypertrophy_secondary"]', 'quad_iso_unilateral', NULL, '["quads", "glutes"]', '["general_heat", "hips", "ankles", "lunge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('cable_curl', 'Cable Curl', 'isolation', 'pull_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{cable}', '["cable"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'arms', NULL, '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('cable_fly', 'Cable Fly', 'isolation', 'push_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{cable}', '["cable"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'chest_iso', NULL, '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('cable_lateral_raise', 'Cable Lateral Raise', 'isolation', 'push_vertical', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{cable}', '["cable"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'shoulder_iso', NULL, '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('pushdown', 'Cable Triceps Pushdown', 'isolation', 'push_vertical', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{cable}', '["cable"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'arms', NULL, '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('devils_press', 'Devils Press', 'engine', 'locomotion', '3', 'False', 'True', '3', '[]', '{}', '3', 'False', 'high_power', '{dumbbells}', '["dumbbells"]', NULL, '2', NULL, '["conditioning_main", "finisher"]', 'mixed_modal', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('db_flat_press', 'Dumbbell Flat Press', 'compound', 'push_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells,bench}', '["dumbbells", "bench"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'push_horizontal_db', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('incline_db_curl', 'Dumbbell Incline Curl', 'isolation', 'pull_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells,bench}', '["dumbbells", "bench"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'arms', NULL, '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('db_incline_press', 'Dumbbell Incline Press', 'compound', 'push_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells,bench}', '["dumbbells", "bench"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'push_horizontal_db', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('lateral_raise', 'Dumbbell Lateral Raise', 'isolation', 'push_vertical', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells}', '["dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'shoulder_iso', NULL, '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('db_shoulder_press', 'Dumbbell Shoulder Press', 'compound', 'push_vertical', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells}', '["dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'push_vertical', NULL, '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('face_pull', 'Face Pull', 'isolation', 'pull_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{cable}', '["cable"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'shoulder_iso', NULL, '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('farmers_carry', 'Farmer Carry', 'carry', 'carry', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{dumbbells}', '["dumbbells"]', NULL, '1', NULL, '["conditioning_main", "finisher"]', 'carry', NULL, '["grip", "core"]', '["general_heat", "brace", "grip_prep"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('front_rack_carry', 'Front Rack Carry', 'carry', 'carry', '2', 'False', 'True', '2', '[]', '{}', '3', 'False', 'mixed_modal', '{barbell}', '["barbell"]', NULL, '1', NULL, '["conditioning_main"]', 'carry', NULL, '["grip", "core"]', '["general_heat", "brace", "grip_prep"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('goblet_squat', 'Goblet Squat', 'isolation', 'squat', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', NULL, '{dumbbells}', '["dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary", "conditioning_main"]', 'quad_iso_squat', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('hack_squat', 'Hack Squat Machine', 'compound', 'squat', '1', 'False', 'True', '1', '[]', '{}', '1', 'False', NULL, '{hack_squat}', '["hack_squat"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('heel_elev_goblet_squat', 'Heel-Elevated Goblet Squat', 'isolation', 'squat', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells}', '["dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'quad_iso_squat', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('incline_bench_press', 'Incline Barbell Bench Press', 'compound', 'push_horizontal', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{barbell,bench}', '["barbell", "bench"]', NULL, '0', NULL, '["strength_main"]', 'push_horizontal_barbell', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('kb_rdl', 'Kettlebell Romanian Deadlift', 'isolation', 'hinge', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{kettlebells}', '["kettlebells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'hamstring_iso', 'hinge_compound', '["hamstrings"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('kb_swing', 'Kettlebell Swing', 'compound', 'hinge', '2', 'False', 'True', '2', '[]', '{}', '3', 'False', 'mixed_modal', '{kettlebells}', '["kettlebells"]', NULL, '1', NULL, '["conditioning_main", "finisher"]', 'hinge_ballistic', NULL, '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('leg_extension', 'Leg Extension', 'isolation', 'squat', '1', 'False', 'True', '1', '[]', '{}', '1', 'False', NULL, '{leg_extension}', '["leg_extension"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'quad_iso_unilateral', NULL, '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('leg_press', 'Leg Press', 'compound', 'squat', '1', 'False', 'True', '1', '[]', '{}', '1', 'False', NULL, '{leg_press}', '["leg_press"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('lying_leg_curl', 'Lying Leg Curl', 'isolation', 'hinge', '1', 'False', 'True', '1', '[]', '{}', '1', 'False', NULL, '{leg_curl}', '["leg_curl"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'hamstring_iso', NULL, '["hamstrings"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('machine_chest_press', 'Machine Chest Press', 'compound', 'push_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{chest_press}', '["chest_press"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'push_horizontal_machine', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('machine_shoulder_press', 'Machine Shoulder Press', 'compound', 'push_vertical', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{shoulder_press}', '["shoulder_press"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'push_vertical', NULL, '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('medball_slam', 'Med Ball Slam', 'engine', 'locomotion', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', 'high_power', '{med_ball}', '["med_ball"]', NULL, '1', NULL, '["conditioning_main"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('oh_triceps', 'Overhead Cable Extension', 'isolation', 'push_vertical', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{cable}', '["cable"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'arms', NULL, '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('pec_deck', 'Pec Deck Fly', 'isolation', 'push_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{pec_deck}', '["pec_deck"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'chest_iso', NULL, '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('rear_delt_fly', 'Rear Delt Fly (Machine or DB)', 'isolation', 'pull_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells}', '["dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'shoulder_iso', NULL, '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('russian_kb_swing', 'Russian Kettlebell Swing', 'compound', 'hinge', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{kettlebells}', '["kettlebells"]', NULL, '1', NULL, '["conditioning_main", "finisher"]', 'hinge_ballistic', NULL, '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('sandbag_carry', 'Sandbag Carry', 'carry', 'carry', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{sandbag}', '["sandbag"]', NULL, '1', NULL, '["conditioning_main", "finisher"]', 'carry', NULL, '["grip", "core"]', '["general_heat", "brace", "grip_prep"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('sandbag_ground_to_shoulder', 'Sandbag Ground to Shoulder', 'compound', 'hinge', '2', 'False', 'True', '2', '[]', '{}', '3', 'False', 'mixed_modal', '{sandbag}', '["sandbag"]', NULL, '1', NULL, '["conditioning_main"]', 'hinge_ballistic', NULL, '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('cable_row', 'Seated Cable Row', 'compound', 'pull_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{cable}', '["cable"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('wall_ball', 'Wall Ball Shot', 'engine', 'locomotion', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{wall_ball}', '["wall_ball"]', NULL, '2', NULL, '["conditioning_main"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('seated_db_calf_raise', 'Seated Dumbbell Calf Raise', 'isolation', 'calf', '1', 'False', 'True', '2', '[]', '{}', '2', 'False', NULL, '{bench,dumbbells}', '["bench", "dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'calf_iso', NULL, '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('seated_leg_curl', 'Seated Leg Curl', 'isolation', 'hinge', '1', 'False', 'True', '1', '[]', '{}', '1', 'False', NULL, '{leg_curl}', '["leg_curl"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'hamstring_iso', NULL, '["hamstrings"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('db_row', 'Single-Arm Dumbbell Row', 'compound', 'pull_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells}', '["dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('single_leg_rdl', 'Single-Leg Romanian Deadlift', 'isolation', 'hinge', '1', 'False', 'True', '2', '[]', '{}', '2', 'False', NULL, '{dumbbells,kettlebells}', '["dumbbells", "kettlebells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'hamstring_iso', 'hinge_compound', '["hamstrings"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('single_leg_standing_calf_raise', 'Single-Leg Standing Calf Raise (Loaded Optional)', 'isolation', 'calf', '1', 'False', 'True', '2', '[]', '{}', '2', 'False', NULL, '{bodyweight,dumbbells}', '["bodyweight", "dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'calf_iso', NULL, '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('skullcrusher', 'Skullcrusher', 'isolation', 'push_horizontal', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{barbell,bench}', '["barbell", "bench"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'arms', NULL, '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('sled_push', 'Sled Push', 'engine', 'locomotion', '2', 'False', 'True', '1', '[]', '{}', '3', 'False', 'high_power', '{sled}', '["sled"]', NULL, '1', NULL, '["conditioning_main", "finisher"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('weighted_step_up', 'Step-Up (Weighted)', 'engine', 'locomotion', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{dumbbells,box}', '["dumbbells", "box"]', NULL, '1', NULL, '["conditioning_main", "hypertrophy_secondary"]', 'locomotion', NULL, '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'full_body'),
      ('straight_arm_pd', 'Straight-Arm Pulldown', 'compound', 'pull_vertical', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{cable}', '["cable"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'pull_vertical', NULL, '["lats", "biceps"]', '["general_heat", "shoulders", "scap_pull", "lat_engage"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'upper'),
      ('tempo_back_squat', 'Tempo Back Squat', 'compound', 'squat', '2', 'False', 'True', '2', '[]', '{}', '2', 'False', NULL, '{barbell}', '["barbell"]', NULL, '1', NULL, '["hypertrophy_secondary"]', 'squat_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('tempo_goblet_squat', 'Tempo Goblet Squat', 'isolation', 'squat', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{dumbbells}', '["dumbbells"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'quad_iso_squat', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('trap_bar_deadlift', 'Trap Bar Deadlift', 'compound', 'hinge', '2', 'False', 'True', '2', '[]', '{}', '1', 'False', NULL, '{trap_bar}', '["trap_bar"]', NULL, '0', NULL, '["strength_main"]', 'hinge_trap', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('walking_lunges', 'Walking Lunges', 'isolation', 'lunge', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', NULL, '{dumbbells}', '["dumbbells"]', NULL, '1', NULL, '["hypertrophy_secondary", "conditioning_main"]', 'quad_iso_unilateral', NULL, '["quads", "glutes"]', '["general_heat", "hips", "ankles", "lunge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('weighted_walking_lunge', 'Walking Lunges (Weighted)', 'isolation', 'lunge', '1', 'False', 'True', '1', '[]', '{}', '3', 'False', 'mixed_modal', '{dumbbells}', '["dumbbells"]', NULL, '1', NULL, '["conditioning_main", "hypertrophy_secondary"]', 'quad_iso_unilateral', NULL, '["quads", "glutes"]', '["general_heat", "hips", "ankles", "lunge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower'),
      ('standing_calf_raise', 'Standing Calf Raise', 'isolation', 'locomotion', '1', 'False', 'True', '1', '[]', '{}', '2', 'False', NULL, '{calf_machine}', '["calf_machine"]', NULL, '0', NULL, '["hypertrophy_secondary"]', 'calf_iso', NULL, '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-02-24 17:32:11.55267+00', 'lower')
  ) AS t(
    exercise_id,
    name,
    movement_class,
    movement_pattern_primary,
    min_fitness_rank,
    is_archived,
    is_loadable,
    complexity_rank,
    contraindications_json,
    contraindications_slugs,
    density_rating,
    engine_anchor,
    engine_role,
    equipment_items_slugs,
    equipment_json,
    form_cues,
    impact_level,
    lift_class,
    preferred_in_json,
    swap_group_id_1,
    swap_group_id_2,
    target_regions_json,
    warmup_hooks,
    slug,
    creator,
    created_at,
    updated_at,
    strength_primary_region
  )
)
INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank::int,
  is_archived::boolean,
  is_loadable::boolean,
  complexity_rank::int,
  contraindications_json::jsonb,
  contraindications_slugs::text[],
  density_rating::int,
  engine_anchor::boolean,
  engine_role,
  equipment_items_slugs::text[],
  equipment_json::jsonb,
  form_cues,
  impact_level::int,
  lift_class,
  preferred_in_json::jsonb,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json::jsonb,
  warmup_hooks::jsonb,
  slug,
  creator,
  COALESCE(created_at::timestamptz, now()),
  COALESCE(updated_at::timestamptz, now()),
  CASE
    WHEN exercise_id = 'barbell_back_squat' THEN 'lower'
    WHEN exercise_id = 'barbell_deadlift' THEN 'lower'
    WHEN exercise_id = 'bench_press' THEN 'upper'
    WHEN exercise_id = 'barbell_row' THEN 'upper'
    WHEN exercise_id = 'ohp' THEN 'upper'
    WHEN exercise_id = 'pull_up' THEN 'upper'
    WHEN strength_primary_region IN ('upper', 'lower') THEN strength_primary_region
    ELSE NULL
  END
FROM seed_rows
ON CONFLICT (exercise_id)
DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  updated_at = now();

-- Hyrox-specific catalogue rows and metadata.

INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  'burpee_broad_jump',
  'Burpee Broad Jump',
  'engine',
  'locomotion',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  '{}'::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station", "hyrox_engine", "hyrox_endurance"]'::jsonb,
  'burpee_jump',
  'locomotion_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_catalogue WHERE exercise_id = 'burpee_broad_jump');

INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  'farmer_carry_handles',
  'Farmer Carry (handles)',
  'engine',
  'carry',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  '{}'::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station", "hyrox_engine", "hyrox_power", "hyrox_endurance"]'::jsonb,
  'farmer_carry',
  'carry_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_catalogue WHERE exercise_id = 'farmer_carry_handles');

INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  'farmer_carry_dumbbells',
  'Farmer Carry (dumbbells)',
  'engine',
  'carry',
  1,
  false,
  true,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  '{dumbbells}'::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station", "hyrox_engine", "hyrox_power", "hyrox_endurance"]'::jsonb,
  'farmer_carry',
  'carry_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_catalogue WHERE exercise_id = 'farmer_carry_dumbbells');

INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  'farmer_carry_kettlebells',
  'Farmer Carry (kettlebells)',
  'engine',
  'carry',
  1,
  false,
  true,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  '{kettlebells}'::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station", "hyrox_engine", "hyrox_power", "hyrox_endurance"]'::jsonb,
  'farmer_carry',
  'carry_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_catalogue WHERE exercise_id = 'farmer_carry_kettlebells');

INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  'sandbag_lunge',
  'Sandbag Lunge',
  'engine',
  'lunge',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  '{sandbag}'::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station", "hyrox_engine", "hyrox_endurance"]'::jsonb,
  'sandbag_lunge',
  'lunge_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_catalogue WHERE exercise_id = 'sandbag_lunge');

INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  'wallball_9kg',
  'Wallball (9 kg)',
  'engine',
  'push_ballistic',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  '{wall_ball}'::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station", "hyrox_engine", "hyrox_endurance"]'::jsonb,
  'wallball',
  'push_ballistic_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_catalogue WHERE exercise_id = 'wallball_9kg');

INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  'wallball_6kg',
  'Wallball (6 kg)',
  'engine',
  'push_ballistic',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  '{wall_ball}'::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station", "hyrox_engine", "hyrox_endurance"]'::jsonb,
  'wallball',
  'push_ballistic_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_catalogue WHERE exercise_id = 'wallball_6kg');

INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  creator,
  created_at,
  updated_at,
  strength_primary_region
)
SELECT
  'run_interval',
  'Run (interval)',
  'engine',
  'locomotion',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  true,
  NULL,
  '{treadmill}'::text[],
  '["treadmill"]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_buy_in", "hyrox_engine", "hyrox_endurance"]'::jsonb,
  'run_interval',
  'locomotion_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  now(),
  now(),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_catalogue WHERE exercise_id = 'run_interval');

UPDATE public.exercise_catalogue
SET
  movement_class = 'engine',
  movement_pattern_primary = 'cyclical_engine',
  is_loadable = false,
  swap_group_id_1 = 'ski_erg',
  swap_group_id_2 = 'cyclical_compound',
  preferred_in_json = to_jsonb(ARRAY(
    SELECT val
    FROM (
      SELECT DISTINCT val
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(preferred_in_json, '[]'::jsonb)) AS val
        UNION ALL
        SELECT unnest(ARRAY['hyrox_station', 'hyrox_engine', 'hyrox_endurance'])
      ) x
    ) y
    ORDER BY val
  )),
  hyrox_role = 'race_station',
  hyrox_station_index = 1,
  updated_at = now()
WHERE exercise_id = 'ski_erg';

UPDATE public.exercise_catalogue
SET
  movement_class = 'engine',
  movement_pattern_primary = 'sled_push',
  is_loadable = false,
  swap_group_id_1 = 'sled_push',
  swap_group_id_2 = 'sled_compound',
  preferred_in_json = to_jsonb(ARRAY(
    SELECT val
    FROM (
      SELECT DISTINCT val
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(preferred_in_json, '[]'::jsonb)) AS val
        UNION ALL
        SELECT unnest(ARRAY['hyrox_station', 'hyrox_engine', 'hyrox_power'])
      ) x
    ) y
    ORDER BY val
  )),
  hyrox_role = 'race_station',
  hyrox_station_index = 2,
  updated_at = now()
WHERE exercise_id = 'sled_push';

UPDATE public.exercise_catalogue
SET
  movement_class = 'engine',
  movement_pattern_primary = 'sled_pull',
  is_loadable = false,
  swap_group_id_1 = 'sled_pull',
  swap_group_id_2 = 'sled_compound',
  preferred_in_json = to_jsonb(ARRAY(
    SELECT val
    FROM (
      SELECT DISTINCT val
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(preferred_in_json, '[]'::jsonb)) AS val
        UNION ALL
        SELECT unnest(ARRAY['hyrox_station', 'hyrox_engine', 'hyrox_power'])
      ) x
    ) y
    ORDER BY val
  )),
  hyrox_role = 'race_station',
  hyrox_station_index = 3,
  updated_at = now()
WHERE exercise_id = 'sled_pull';

UPDATE public.exercise_catalogue
SET
  movement_class = 'engine',
  movement_pattern_primary = 'cyclical_engine',
  is_loadable = false,
  swap_group_id_1 = 'row_erg',
  swap_group_id_2 = 'cyclical_compound',
  preferred_in_json = to_jsonb(ARRAY(
    SELECT val
    FROM (
      SELECT DISTINCT val
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(preferred_in_json, '[]'::jsonb)) AS val
        UNION ALL
        SELECT unnest(ARRAY['hyrox_station', 'hyrox_engine', 'hyrox_endurance'])
      ) x
    ) y
    ORDER BY val
  )),
  hyrox_role = 'race_station',
  hyrox_station_index = 5,
  updated_at = now()
WHERE exercise_id = 'row_erg';

UPDATE public.exercise_catalogue
SET
  hyrox_role = CASE
    WHEN exercise_id = 'burpee_broad_jump' THEN 'race_station'
    WHEN exercise_id = 'farmer_carry_handles' THEN 'race_station'
    WHEN exercise_id IN ('farmer_carry_dumbbells', 'farmer_carry_kettlebells') THEN 'carry'
    WHEN exercise_id = 'sandbag_lunge' THEN 'race_station'
    WHEN exercise_id = 'wallball_9kg' THEN 'race_station'
    WHEN exercise_id = 'wallball_6kg' THEN 'race_station'
    WHEN exercise_id = 'run_interval' THEN 'run_buy_in'
    ELSE hyrox_role
  END,
  hyrox_station_index = CASE
    WHEN exercise_id = 'burpee_broad_jump' THEN 4
    WHEN exercise_id = 'farmer_carry_handles' THEN 6
    WHEN exercise_id = 'sandbag_lunge' THEN 7
    WHEN exercise_id = 'wallball_9kg' THEN 8
    ELSE NULL
  END,
  updated_at = now()
WHERE exercise_id IN (
  'burpee_broad_jump',
  'farmer_carry_handles',
  'farmer_carry_dumbbells',
  'farmer_carry_kettlebells',
  'sandbag_lunge',
  'wallball_9kg',
  'wallball_6kg',
  'run_interval'
);

UPDATE public.exercise_catalogue
SET
  preferred_in_json = to_jsonb(ARRAY(
    SELECT val
    FROM (
      SELECT DISTINCT val
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(preferred_in_json, '[]'::jsonb)) AS val
        UNION ALL
        SELECT unnest(ARRAY['hyrox_power'])
      ) x
    ) y
    ORDER BY val
  )),
  updated_at = now()
WHERE exercise_id IN (
  'barbell_back_squat',
  'barbell_front_squat',
  'goblet_squat',
  'trap_bar_deadlift',
  'barbell_rdl',
  'barbell_deadlift',
  'weighted_walking_lunge',
  'weighted_step_up',
  'pull_up',
  'barbell_row',
  'db_row'
)
AND NOT (COALESCE(preferred_in_json, '[]'::jsonb) ? 'hyrox_power');
