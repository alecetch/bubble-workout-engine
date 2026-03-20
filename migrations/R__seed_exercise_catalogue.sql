-- Generated from exercise_catalogue_review_and_expansion.csv on 2026-03-16
-- Safe repeatable seed replacement for Flyway.
-- This file should replace R__seed_exercise_catalogue.sql because exercise catalogue
-- data is owned by a repeatable migration in the current architecture.

INSERT INTO exercise_catalogue (
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
  strength_primary_region,
  hyrox_role,
  hyrox_station_index
)
VALUES
  ('air_bike_sprint', 'Air Bike Sprint', 'engine', 'cyclical_engine', 2, FALSE, FALSE, 1, '[]', '{}', 3, TRUE, 'high_power', '{assault_bike}', '["assault_bike"]', NULL, 0, NULL, '["conditioning_main", "finisher"]', 'engine', 'cyclical_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('assault_bike', 'Assault Bike', 'engine', 'cyclical_engine', 1, FALSE, FALSE, 1, '[]', '{}', 3, TRUE, 'sustainable', '{assault_bike}', '["assault_bike"]', NULL, 0, NULL, '["conditioning_main"]', 'engine', 'cyclical_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('battle_ropes', 'Battle Ropes', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{battle_rope}', '["battle_rope"]', NULL, 1, NULL, '["conditioning_main", "finisher"]', 'locomotion', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('bear_crawl', 'Bear Crawl', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{}', '[]', NULL, 1, NULL, '["conditioning_main"]', 'locomotion', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('bike_erg', 'Bike Erg', 'engine', 'cyclical_engine', 1, FALSE, FALSE, 1, '[]', '{}', 3, TRUE, 'sustainable', '{bike_erg}', '["bike_erg"]', NULL, 0, NULL, '["conditioning_main"]', 'engine', 'cyclical_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('box_jump', 'Box Jump', 'engine', 'locomotion', 2, FALSE, FALSE, 2, '[]', '{}', 3, FALSE, 'high_power', '{box}', '["box"]', NULL, 3, NULL, '["conditioning_main"]', 'locomotion', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('burpee', 'Burpee', 'engine', 'locomotion', 2, FALSE, FALSE, 2, '[]', '{}', 3, FALSE, 'mixed_modal', '{}', '[]', NULL, 3, NULL, '["conditioning_main", "finisher"]', 'locomotion', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('bench_press', 'Barbell Bench Press', 'compound', 'push_horizontal', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell,bench}', '["barbell", "bench"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'push_horizontal_barbell', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('bb_curl', 'Barbell Curl', 'isolation', 'pull_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'arms', 'arms_accessory', '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('barbell_good_morning', 'Barbell Good Morning', 'compound', 'hinge', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'hinge_barbell', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('hip_thrust', 'Barbell Hip Thrust', 'isolation', 'hinge', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{barbell,bench}', '["barbell", "bench"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'glute_iso', 'glute_accessory', '["glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('chest_supported_row', 'Chest-Supported Row Machine', 'compound', 'pull_horizontal', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{row_machine}', '["row_machine"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('hanging_knee_raise', 'Hanging Knee Raise', 'core', 'anti_extension', 1, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{pullup_bar}', '["pullup_bar"]', NULL, 0, NULL, '["hypertrophy_secondary", "conditioning_main"]', 'core', 'core_accessory', '["core"]', '["general_heat", "brace"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('jump_rope', 'Jump Rope', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{jump_rope}', '["jump_rope"]', NULL, 2, NULL, '["conditioning_main", "finisher"]', 'locomotion', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('cable_curl', 'Cable Curl', 'isolation', 'pull_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'arms', 'arms_accessory', '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('cable_fly', 'Cable Fly', 'isolation', 'push_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'chest_iso', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('mountain_climber', 'Mountain Climbers', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{}', '[]', NULL, 2, NULL, '["conditioning_main"]', 'locomotion', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('outdoor_run', 'Outdoor Run', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 3, TRUE, 'sustainable', '{}', '[]', NULL, 2, NULL, '["conditioning_main", "finisher", "hyrox_buy_in"]', 'run_interval', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('ring_row', 'Ring Row', 'compound', 'pull_horizontal', 1, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, NULL, '{rings}', '["rings"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "conditioning_main"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('lat_pulldown', 'Lat Pulldown', 'compound', 'pull_vertical', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{lat_pulldown}', '["lat_pulldown"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'pull_vertical', 'pull_vertical_compound', '["lats", "biceps"]', '["general_heat", "shoulders", "scap_pull", "lat_engage"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('farmers_carry', 'Farmer Carry', 'carry', 'carry', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{dumbbells}', '["dumbbells"]', NULL, 1, NULL, '["conditioning_main", "finisher", "hyrox_station", "hyrox_power"]', 'carry', 'carry_compound', '["grip", "core"]', '["general_heat", "brace", "grip_prep"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('kb_rdl', 'Kettlebell Romanian Deadlift', 'isolation', 'hinge', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{kettlebells}', '["kettlebells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'hamstring_iso', 'hinge_compound', '["hamstrings"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('kb_swing', 'Kettlebell Swing', 'compound', 'hinge', 2, FALSE, TRUE, 2, '[]', '{}', 3, FALSE, 'mixed_modal', '{kettlebells}', '["kettlebells"]', NULL, 1, NULL, '["conditioning_main", "finisher"]', 'hinge_ballistic', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('leg_extension', 'Leg Extension', 'isolation', 'squat', 1, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{leg_extension}', '["leg_extension"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'quad_iso_squat', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('medball_slam', 'Med Ball Slam', 'engine', 'cyclical_engine', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, 'high_power', '{med_ball}', '["med_ball"]', NULL, 1, NULL, '["conditioning_main", "hyrox_station"]', 'ski_erg', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('shuttle_run', 'Shuttle Runs', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, 'high_power', '{}', '[]', NULL, 2, NULL, '["conditioning_main", "finisher"]', 'locomotion', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('standing_calf_raise_bw', 'Standing Calf Raise (Bodyweight)', 'isolation', 'calf', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{bodyweight}', '["bodyweight"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'calf_iso', 'calf_accessory', '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('toes_to_bar', 'Toes-to-Bar', 'core', 'anti_extension', 3, FALSE, FALSE, 3, '[]', '{}', 2, FALSE, 'mixed_modal', '{pullup_bar}', '["pullup_bar"]', NULL, 1, NULL, '["hypertrophy_secondary", "conditioning_main"]', 'core', 'core_accessory', '["core"]', '["general_heat", "brace"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('treadmill_run', 'Treadmill Run', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 3, TRUE, 'sustainable', '{treadmill}', '["treadmill"]', NULL, 1, NULL, '["conditioning_main", "finisher", "hyrox_buy_in"]', 'run_interval', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('rear_delt_fly', 'Rear Delt Fly (Machine or DB)', 'isolation', 'pull_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'shoulder_iso', 'rear_delt_accessory', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('russian_kb_swing', 'Russian Kettlebell Swing', 'compound', 'hinge', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{kettlebells}', '["kettlebells"]', NULL, 1, NULL, '["conditioning_main", "finisher"]', 'hinge_ballistic', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('sandbag_carry', 'Sandbag Carry', 'carry', 'carry', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{sandbag}', '["sandbag"]', NULL, 1, NULL, '["conditioning_main", "finisher"]', 'carry', 'carry_compound', '["grip", "core"]', '["general_heat", "brace", "grip_prep"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('sandbag_ground_to_shoulder', 'Sandbag Ground to Shoulder', 'compound', 'hinge', 2, FALSE, TRUE, 2, '[]', '{}', 3, FALSE, 'mixed_modal', '{sandbag}', '["sandbag"]', NULL, 1, NULL, '["conditioning_main"]', 'hinge_ballistic', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('cable_row', 'Seated Cable Row', 'compound', 'pull_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('wall_ball', 'Wall Ball Shot', 'engine', 'push_ballistic', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{wall_ball}', '["wall_ball"]', NULL, 2, NULL, '["conditioning_main", "finisher", "hyrox_station"]', 'wallball', 'push_ballistic_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('seated_db_calf_raise', 'Seated Dumbbell Calf Raise', 'isolation', 'calf', 1, FALSE, TRUE, 2, '[]', '{}', 2, FALSE, NULL, '{bench,dumbbells}', '["bench", "dumbbells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'calf_iso', 'calf_accessory', '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('seated_leg_curl', 'Seated Leg Curl', 'isolation', 'hinge', 1, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{leg_curl}', '["leg_curl"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'hamstring_iso', 'hinge_compound', '["hamstrings"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('seated_calf_raise', 'Seated Calf Raise', 'isolation', 'calf', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{calf_machine}', '["calf_machine"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'calf_iso', 'calf_accessory', '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('ski_erg', 'Ski Erg', 'engine', 'cyclical_engine', 1, FALSE, FALSE, 1, '[]', '{}', 3, TRUE, 'sustainable', '{ski_erg}', '["ski_erg"]', NULL, 0, NULL, '["conditioning_main", "hyrox_station", "ski_erg"]', 'ski_erg', 'cyclical_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', 1),
  ('single_leg_rdl', 'Single-Leg Romanian Deadlift', 'isolation', 'hinge', 1, FALSE, TRUE, 2, '[]', '{}', 2, FALSE, NULL, '{dumbbells,kettlebells}', '["dumbbells", "kettlebells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'hamstring_iso', 'hinge_compound', '["hamstrings"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('single_leg_standing_calf_raise', 'Single-Leg Standing Calf Raise (Loaded Optional)', 'isolation', 'calf', 1, FALSE, TRUE, 2, '[]', '{}', 2, FALSE, NULL, '{bodyweight,dumbbells}', '["bodyweight", "dumbbells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'calf_iso', 'calf_accessory', '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('skullcrusher', 'Skullcrusher', 'isolation', 'push_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{barbell,bench}', '["barbell", "bench"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'arms', 'arms_accessory', '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('straight_arm_pd', 'Straight-Arm Pulldown', 'compound', 'pull_vertical', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'pull_vertical', 'pull_vertical_compound', '["lats", "biceps"]', '["general_heat", "shoulders", "scap_pull", "lat_engage"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('tempo_back_squat', 'Tempo Back Squat', 'compound', 'squat', 2, FALSE, TRUE, 2, '[]', '{}', 2, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 1, NULL, '["hypertrophy_secondary"]', 'squat_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('tempo_goblet_squat', 'Tempo Goblet Squat', 'isolation', 'squat', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'quad_iso_squat', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('sled_push', 'Sled Push', 'engine', 'sled_push', 2, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, 'high_power', '{sled}', '["sled"]', NULL, 1, NULL, '["conditioning_main", "finisher", "hyrox_station", "hyrox_power"]', 'sled_push', 'sled_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', 2),
  ('walking_lunges', 'Walking Lunges', 'isolation', 'lunge', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 1, NULL, '["hypertrophy_secondary", "conditioning_main"]', 'quad_iso_unilateral', 'lunge_compound', '["quads", "glutes"]', '["general_heat", "hips", "ankles", "lunge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('ohp', 'Barbell Overhead Press', 'compound', 'push_vertical', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'push_vertical', 'push_vertical_compound', '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('barbell_standing_calf_raise', 'Barbell Standing Calf Raise', 'isolation', 'calf', 2, FALSE, TRUE, 2, '[]', '{}', 2, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'calf_iso', 'calf_accessory', '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('bulgarian_split_squat', 'Bulgarian Split Squat', 'isolation', 'lunge', 2, FALSE, TRUE, 2, '[]', '{}', 2, FALSE, NULL, '{dumbbells,bench}', '["dumbbells", "bench"]', NULL, 1, NULL, '["hypertrophy_secondary", "conditioning_main"]', 'quad_iso_unilateral', 'lunge_compound', '["quads", "glutes"]', '["general_heat", "hips", "ankles", "lunge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('cable_lateral_raise', 'Cable Lateral Raise', 'isolation', 'push_vertical', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'shoulder_iso', 'shoulder_accessory', '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('pushdown', 'Cable Triceps Pushdown', 'isolation', 'push_vertical', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'arms', 'push_vertical_compound', '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('devils_press', 'Devils Press', 'engine', 'locomotion', 3, FALSE, TRUE, 3, '[]', '{}', 3, FALSE, 'high_power', '{dumbbells}', '["dumbbells"]', NULL, 2, NULL, '["conditioning_main", "finisher"]', 'mixed_modal', 'locomotion_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('db_flat_press', 'Dumbbell Flat Press', 'compound', 'push_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells,bench}', '["dumbbells", "bench"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'push_horizontal_db', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('incline_db_curl', 'Dumbbell Incline Curl', 'isolation', 'pull_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells,bench}', '["dumbbells", "bench"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'arms', 'arms_accessory', '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('db_incline_press', 'Dumbbell Incline Press', 'compound', 'push_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells,bench}', '["dumbbells", "bench"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'push_horizontal_db', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('lateral_raise', 'Dumbbell Lateral Raise', 'isolation', 'push_vertical', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'shoulder_iso', 'shoulder_accessory', '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('db_shoulder_press', 'Dumbbell Shoulder Press', 'compound', 'push_vertical', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'push_vertical', 'push_vertical_compound', '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('face_pull', 'Face Pull', 'isolation', 'pull_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'shoulder_iso', 'rear_delt_accessory', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('front_rack_carry', 'Front Rack Carry', 'carry', 'carry', 2, FALSE, TRUE, 2, '[]', '{}', 3, FALSE, 'mixed_modal', '{barbell}', '["barbell"]', NULL, 1, NULL, '["conditioning_main", "finisher"]', 'carry', 'carry_compound', '["grip", "core"]', '["general_heat", "brace", "grip_prep"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('hack_squat', 'Hack Squat Machine', 'compound', 'squat', 1, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{hack_squat}', '["hack_squat"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('heel_elev_goblet_squat', 'Heel-Elevated Goblet Squat', 'isolation', 'squat', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'quad_iso_squat', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('incline_bench_press', 'Incline Barbell Bench Press', 'compound', 'push_horizontal', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell,bench}', '["barbell", "bench"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'push_horizontal_barbell', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('leg_press', 'Leg Press', 'compound', 'squat', 1, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{leg_press}', '["leg_press"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('lying_leg_curl', 'Lying Leg Curl', 'isolation', 'hinge', 1, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{leg_curl}', '["leg_curl"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'hamstring_iso', 'hinge_compound', '["hamstrings"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('machine_chest_press', 'Machine Chest Press', 'compound', 'push_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{chest_press}', '["chest_press"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'push_horizontal_machine', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('machine_shoulder_press', 'Machine Shoulder Press', 'compound', 'push_vertical', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{shoulder_press}', '["shoulder_press"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'push_vertical', 'push_vertical_compound', '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "scap_up"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('oh_triceps', 'Overhead Cable Extension', 'isolation', 'push_vertical', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'arms', 'push_vertical_compound', '["arms"]', '["general_heat", "elbows_wrists", "pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('pec_deck', 'Pec Deck Fly', 'isolation', 'push_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{pec_deck}', '["pec_deck"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'chest_iso', 'push_horizontal_compound', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('standing_calf_raise', 'Standing Calf Raise', 'isolation', 'calf', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{calf_machine}', '["calf_machine"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'calf_iso', 'calf_accessory', '["calves"]', '["general_heat", "ankles", "calf_pump"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('sled_pull', 'Sled Pull', 'engine', 'sled_pull', 2, FALSE, FALSE, 1, '[]', '{}', 3, FALSE, 'high_power', '{sled}', '["sled"]', NULL, 1, NULL, '["conditioning_main", "finisher", "hyrox_station", "hyrox_power"]', 'sled_pull', 'sled_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', 3),
  ('row_erg', 'Row Erg', 'engine', 'cyclical_engine', 1, FALSE, FALSE, 1, '[]', '{}', 3, TRUE, 'sustainable', '{row_erg}', '["row_erg"]', NULL, 0, NULL, '["conditioning_main", "hyrox_station"]', 'row_erg', 'cyclical_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', 5),
  ('burpee_broad_jump', 'Burpee Broad Jump', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{}', '[]', NULL, 2, NULL, '["hyrox_station"]', 'burpee_jump', 'locomotion_compound', '[]', '[]', NULL, '(App admin)', '2026-03-14 09:02:03.23553+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', 4),
  ('farmer_carry_handles', 'Farmer Carry (handles)', 'engine', 'carry', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{}', '[]', NULL, 2, NULL, '["conditioning_main", "finisher", "hyrox_station", "hyrox_power"]', 'farmer_carry', 'carry_compound', '[]', '[]', NULL, '(App admin)', '2026-03-14 09:02:03.23553+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', 6),
  ('farmer_carry_dumbbells', 'Farmer Carry (dumbbells)', 'engine', 'carry', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells}', '[]', NULL, 2, NULL, '["conditioning_main", "finisher", "hyrox_station", "hyrox_power"]', 'farmer_carry', 'carry_compound', '[]', '[]', NULL, '(App admin)', '2026-03-14 09:02:03.23553+00', '2026-03-14 11:03:11.800912+00', NULL, 'carry', NULL),
  ('farmer_carry_kettlebells', 'Farmer Carry (kettlebells)', 'engine', 'carry', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{kettlebells}', '[]', NULL, 2, NULL, '["conditioning_main", "finisher", "hyrox_station", "hyrox_power"]', 'farmer_carry', 'carry_compound', '[]', '[]', NULL, '(App admin)', '2026-03-14 09:02:03.23553+00', '2026-03-14 11:03:11.800912+00', NULL, 'carry', NULL),
  ('sandbag_lunge', 'Sandbag Lunge', 'engine', 'lunge', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{sandbag}', '[]', NULL, 2, NULL, '["hyrox_station"]', 'sandbag_lunge', 'lunge_compound', '[]', '[]', NULL, '(App admin)', '2026-03-14 09:02:03.23553+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', 7),
  ('wallball_9kg', 'Wallball (9 kg)', 'engine', 'push_ballistic', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{wall_ball}', '[]', NULL, 2, NULL, '["hyrox_station"]', 'wallball', 'push_ballistic_compound', '[]', '[]', NULL, '(App admin)', '2026-03-14 09:02:03.23553+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', 8),
  ('wallball_6kg', 'Wallball (6 kg)', 'engine', 'push_ballistic', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{wall_ball}', '[]', NULL, 2, NULL, '["hyrox_station"]', 'wallball', 'push_ballistic_compound', '[]', '[]', NULL, '(App admin)', '2026-03-14 09:02:03.23553+00', '2026-03-14 11:03:11.800912+00', NULL, 'race_station', NULL),
  ('run_interval', 'Run (interval)', 'engine', 'locomotion', 1, FALSE, FALSE, 1, '[]', '{}', 2, TRUE, NULL, '{}', '[]', NULL, 2, NULL, '["conditioning_main", "finisher", "hyrox_buy_in"]', 'run_interval', 'locomotion_compound', '[]', '[]', NULL, '(App admin)', '2026-03-14 09:02:03.23553+00', '2026-03-14 11:03:11.800912+00', NULL, 'run_buy_in', NULL),
  ('barbell_deadlift', 'Barbell Deadlift', 'compound', 'hinge', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["strength_main", "hyrox_power"]', 'hinge_barbell', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('barbell_front_squat', 'Barbell Front Squat', 'compound', 'squat', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 1, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('barbell_rdl', 'Barbell Romanian Deadlift', 'compound', 'hinge', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'hinge_barbell', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('pull_up', 'Pull-Up', 'compound', 'pull_vertical', 2, FALSE, FALSE, 2, '[]', '{}', 2, FALSE, NULL, '{pullup_bar}', '["pullup_bar"]', NULL, 1, NULL, '["hypertrophy_secondary", "hyrox_power"]', 'pull_vertical', 'pull_vertical_compound', '["lats", "biceps"]', '["general_heat", "shoulders", "scap_pull", "lat_engage"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('barbell_row', 'Barbell Bent-Over Row', 'compound', 'pull_horizontal', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('goblet_squat', 'Goblet Squat', 'isolation', 'squat', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "conditioning_main", "hyrox_power"]', 'quad_iso_squat', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('db_row', 'Single-Arm Dumbbell Row', 'compound', 'pull_horizontal', 1, FALSE, TRUE, 1, '[]', '{}', 2, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'pull_horizontal', 'pull_horizontal_compound', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'upper', NULL, NULL),
  ('weighted_step_up', 'Step-Up (Weighted)', 'engine', 'lunge', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{dumbbells,box}', '["dumbbells", "box"]', NULL, 1, NULL, '["hypertrophy_secondary", "conditioning_main", "hyrox_power"]', 'quad_iso_unilateral', 'lunge_compound', '["cardio"]', '["general_heat"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', NULL, NULL, NULL),
  ('trap_bar_deadlift', 'Trap Bar Deadlift', 'compound', 'hinge', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{trap_bar}', '["trap_bar"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'hinge_trap', 'hinge_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('barbell_back_squat', 'Barbell Back Squat', 'compound', 'squat', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 1, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "t_spine", "squat_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('weighted_walking_lunge', 'Walking Lunges (Weighted)', 'isolation', 'lunge', 1, FALSE, TRUE, 1, '[]', '{}', 3, FALSE, 'mixed_modal', '{dumbbells}', '["dumbbells"]', NULL, 1, NULL, '["hypertrophy_secondary", "conditioning_main", "hyrox_power"]', 'quad_iso_unilateral', 'lunge_compound', '["quads", "glutes"]', '["general_heat", "hips", "ankles", "lunge_pattern"]', NULL, '(App admin)', '2026-02-24 17:32:11.55267+00', '2026-03-14 11:03:11.800912+00', 'lower', NULL, NULL),
  ('hardstyle_plank', 'Hardstyle Plank', 'core', 'anti_extension', 0, FALSE, FALSE, 0, '[]', '{}', 1, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'core', 'core_accessory', '["core"]', '["general_heat", "brace"]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', NULL, NULL, NULL),
  ('dead_bug', 'Dead Bug', 'core', 'anti_extension', 0, FALSE, FALSE, 0, '[]', '{}', 1, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'core', 'core_accessory', '["core"]', '["general_heat", "brace"]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', NULL, NULL, NULL),
  ('single_leg_glute_bridge', 'Single-Leg Glute Bridge', 'isolation', 'hinge', 0, FALSE, FALSE, 0, '[]', '{}', 1, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'glute_iso', 'glute_accessory', '["glutes"]', '["general_heat", "hips", "glutes", "brace"]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', 'lower', NULL, NULL),
  ('cable_glute_kickback', 'Cable Glute Kickback', 'isolation', 'hinge', 0, FALSE, TRUE, 0, '[]', '{}', 1, FALSE, NULL, '{cable}', '["cable"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'glute_iso', 'glute_accessory', '["glutes"]', '["general_heat", "hips", "glutes"]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', 'lower', NULL, NULL),
  ('bodyweight_reverse_lunge', 'Reverse Lunge (Bodyweight)', 'isolation', 'lunge', 0, FALSE, FALSE, 0, '[]', '{}', 1, FALSE, NULL, '{}', '[]', NULL, 1, NULL, '["hypertrophy_secondary", "conditioning_main"]', 'quad_iso_unilateral', 'lunge_compound', '["quads", "glutes"]', '["general_heat", "hips", "ankles"]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', 'lower', NULL, NULL),
  ('double_db_front_squat', 'Double Dumbbell Front Squat', 'compound', 'squat', 1, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'quad_compound', 'squat_compound', '["quads", "glutes"]', '["general_heat", "hips", "ankles", "brace", "squat_pattern"]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', 'lower', NULL, NULL),
  ('push_press', 'Barbell Push Press', 'compound', 'push_vertical', 2, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary", "hyrox_power"]', 'push_vertical', 'push_vertical_compound', '["shoulders", "triceps"]', '["general_heat", "t_spine", "shoulders", "brace"]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', 'upper', NULL, NULL),
  ('outdoor_run_interval', 'Outdoor Run Intervals', 'engine', 'locomotion', 0, FALSE, FALSE, 0, '[]', '{}', 2, TRUE, NULL, '{}', '[]', NULL, 2, NULL, '["conditioning_main", "finisher", "hyrox_buy_in"]', 'run_interval', 'locomotion_compound', '[]', '[]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', NULL, 'run_buy_in', NULL),
  ('treadmill_run_interval', 'Treadmill Run Intervals', 'engine', 'locomotion', 0, FALSE, FALSE, 0, '[]', '{}', 2, TRUE, NULL, '{treadmill}', '["treadmill"]', NULL, 2, NULL, '["conditioning_main", "finisher", "hyrox_buy_in"]', 'run_interval', 'locomotion_compound', '[]', '[]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', NULL, 'run_buy_in', NULL),
  ('sled_push_low_handle', 'Sled Push (Low Handle)', 'engine', 'sled_push', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{sled}', '["sled"]', NULL, 1, NULL, '["conditioning_main", "finisher", "hyrox_station", "hyrox_power"]', 'sled_push', 'sled_compound', '[]', '[]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', NULL, 'race_station', 2),
  ('sled_pull_rope', 'Sled Pull (Rope)', 'engine', 'sled_pull', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{sled}', '["sled"]', NULL, 1, NULL, '["conditioning_main", "finisher", "hyrox_station", "hyrox_power"]', 'sled_pull', 'sled_compound', '[]', '[]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', NULL, 'race_station', 3),
  ('sandbag_front_rack_lunge', 'Sandbag Front-Rack Lunge', 'engine', 'lunge', 1, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{sandbag}', '["sandbag"]', NULL, 2, NULL, '["hyrox_station"]', 'sandbag_lunge', 'lunge_compound', '[]', '[]', NULL, '(App admin)', '2026-03-16 00:00:00+00', '2026-03-16 00:00:00+00', NULL, 'race_station', 7)
ON CONFLICT (exercise_id) DO UPDATE
SET
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
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at,
  strength_primary_region = EXCLUDED.strength_primary_region,
  hyrox_role = EXCLUDED.hyrox_role,
  hyrox_station_index = EXCLUDED.hyrox_station_index
;

-- Equipment-aware selection support ------------------------------------------
-- Start from the column default, then explicitly tag qualifying exercises.
UPDATE public.exercise_catalogue
SET strength_equivalent = FALSE
WHERE strength_equivalent IS DISTINCT FROM FALSE;

-- Existing exercise corrections / reclassification.
UPDATE public.exercise_catalogue
SET
  min_fitness_rank = 0,
  strength_equivalent = TRUE
WHERE exercise_id = 'goblet_squat';

UPDATE public.exercise_catalogue
SET
  swap_group_id_1 = 'squat_pattern',
  swap_group_id_2 = 'squat_pattern_compound',
  strength_equivalent = TRUE
WHERE exercise_id = 'double_db_front_squat';

UPDATE public.exercise_catalogue
SET
  swap_group_id_1 = 'hinge_pattern',
  swap_group_id_2 = 'hinge_pattern_compound'
WHERE exercise_id = 'kb_rdl';

UPDATE public.exercise_catalogue
SET
  swap_group_id_1 = 'hinge_pattern',
  swap_group_id_2 = 'hinge_pattern_compound'
WHERE exercise_id = 'single_leg_rdl';

UPDATE public.exercise_catalogue
SET
  swap_group_id_1 = 'push_horizontal_pattern',
  swap_group_id_2 = 'push_horizontal_any'
WHERE exercise_id IN ('db_flat_press', 'db_incline_press');

UPDATE public.exercise_catalogue
SET
  swap_group_id_1 = 'pull_horizontal_pattern',
  swap_group_id_2 = 'pull_horizontal_any'
WHERE exercise_id = 'db_row';

UPDATE public.exercise_catalogue
SET
  swap_group_id_1 = 'pull_horizontal_pattern',
  swap_group_id_2 = 'pull_horizontal_any',
  strength_equivalent = TRUE
WHERE exercise_id = 'ring_row';

UPDATE public.exercise_catalogue
SET swap_group_id_1 = 'push_vertical_pattern'
WHERE exercise_id = 'db_shoulder_press';

UPDATE public.exercise_catalogue
SET swap_group_id_1 = 'lunge_pattern'
WHERE exercise_id IN ('walking_lunges', 'bodyweight_reverse_lunge');

UPDATE public.exercise_catalogue
SET strength_equivalent = TRUE
WHERE exercise_id IN (
  'barbell_back_squat',
  'barbell_front_squat',
  'barbell_deadlift',
  'barbell_rdl',
  'trap_bar_deadlift',
  'hack_squat',
  'leg_press',
  'double_db_front_squat',
  'goblet_squat',
  'ring_row'
);

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
  strength_equivalent,
  strength_primary_region,
  hyrox_role,
  hyrox_station_index
)
VALUES
  ('pistol_squat', 'Pistol Squat', 'compound', 'squat', 2, FALSE, FALSE, 3, '[]', '{}', 2, FALSE, NULL, '{}', '[]', NULL, 1, NULL, '["hypertrophy_secondary"]', 'squat_pattern', 'squat_pattern_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "brace", "squat_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'lower', NULL, NULL),
  ('assisted_pistol_squat', 'Assisted Pistol Squat', 'compound', 'squat', 1, FALSE, FALSE, 2, '[]', '{}', 1, FALSE, NULL, '{}', '[]', NULL, 1, NULL, '["hypertrophy_secondary"]', 'squat_pattern', 'squat_pattern_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "brace", "squat_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'lower', NULL, NULL),
  ('shrimp_squat', 'Shrimp Squat', 'compound', 'squat', 2, FALSE, FALSE, 2, '[]', '{}', 1, FALSE, NULL, '{}', '[]', NULL, 1, NULL, '["hypertrophy_secondary"]', 'squat_pattern', 'squat_pattern_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "brace", "squat_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'lower', NULL, NULL),
  ('cyclist_squat', 'Cyclist Squat (Heels Elevated)', 'isolation', 'squat', 0, FALSE, FALSE, 1, '[]', '{}', 1, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'squat_pattern', 'squat_pattern_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "squat_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', FALSE, 'lower', NULL, NULL),
  ('landmine_squat', 'Landmine Squat', 'compound', 'squat', 1, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{barbell}', '["barbell"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'squat_pattern', 'squat_pattern_compound', '["quads", "glutes"]', '["general_heat", "ankles", "hips", "brace", "squat_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'lower', NULL, NULL),
  ('kb_deadlift', 'Kettlebell Deadlift', 'compound', 'hinge', 0, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{kettlebells}', '["kettlebells"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'hinge_pattern', 'hinge_pattern_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'lower', NULL, NULL),
  ('db_rdl', 'Dumbbell RDL', 'compound', 'hinge', 1, FALSE, TRUE, 1, '[]', '{}', 1, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'hinge_pattern', 'hinge_pattern_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'lower', NULL, NULL),
  ('bstance_rdl', 'B-Stance RDL', 'compound', 'hinge', 1, FALSE, TRUE, 2, '[]', '{}', 1, FALSE, NULL, '{dumbbells}', '["dumbbells"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'hinge_pattern', 'hinge_pattern_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'lower', NULL, NULL),
  ('bw_rdl', 'Single-Leg Bodyweight RDL', 'isolation', 'hinge', 0, FALSE, FALSE, 1, '[]', '{}', 1, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'hinge_pattern', 'hinge_pattern_compound', '["hamstrings", "glutes"]', '["general_heat", "hips", "hamstrings", "brace", "hinge_pattern"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', FALSE, 'lower', NULL, NULL),
  ('weighted_pushup', 'Weighted Push-Up', 'compound', 'push_horizontal', 0, FALSE, TRUE, 2, '[]', '{}', 2, FALSE, NULL, '{bodyweight}', '["bodyweight"]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'push_horizontal_pattern', 'push_horizontal_any', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'upper', NULL, NULL),
  ('feet_elevated_pushup', 'Feet-Elevated Push-Up', 'compound', 'push_horizontal', 0, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'push_horizontal_pattern', 'push_horizontal_any', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', FALSE, 'upper', NULL, NULL),
  ('ring_pushup', 'Ring Push-Up', 'compound', 'push_horizontal', 1, FALSE, FALSE, 2, '[]', '{}', 2, FALSE, NULL, '{rings}', '["rings"]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'push_horizontal_pattern', 'push_horizontal_any', '["chest", "triceps", "shoulders"]', '["general_heat", "t_spine", "shoulders", "scap_push"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'upper', NULL, NULL),
  ('inverted_row', 'Inverted Row', 'compound', 'pull_horizontal', 0, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'pull_horizontal_pattern', 'pull_horizontal_any', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'upper', NULL, NULL),
  ('feet_elevated_inverted_row', 'Feet-Elevated Inverted Row', 'compound', 'pull_horizontal', 1, FALSE, FALSE, 2, '[]', '{}', 2, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["strength_main", "hypertrophy_secondary"]', 'pull_horizontal_pattern', 'pull_horizontal_any', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', TRUE, 'upper', NULL, NULL),
  ('towel_row', 'Towel Row', 'compound', 'pull_horizontal', 0, FALSE, FALSE, 1, '[]', '{}', 2, FALSE, NULL, '{}', '[]', NULL, 0, NULL, '["hypertrophy_secondary"]', 'pull_horizontal_pattern', 'pull_horizontal_any', '["upper_back", "biceps"]', '["general_heat", "t_spine", "scap_pull"]', NULL, '(App admin)', '2026-03-17 00:00:00+00', '2026-03-17 00:00:00+00', FALSE, 'upper', NULL, NULL)
ON CONFLICT (exercise_id) DO UPDATE
SET
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
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at,
  strength_equivalent = EXCLUDED.strength_equivalent,
  strength_primary_region = EXCLUDED.strength_primary_region,
  hyrox_role = EXCLUDED.hyrox_role,
  hyrox_station_index = EXCLUDED.hyrox_station_index
;
