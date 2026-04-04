-- First-draft exercise coaching cues seed.
-- Review/edit content exercise by exercise before production use.

-- -- squat ---------------------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you descend", "Knees track over toes", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'barbell_back_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows high throughout", "Stay more upright than a back squat", "Brace before you descend"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'barbell_front_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Use the bell as a counterbalance", "Sit between your heels", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'goblet_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Place feet slightly forward on the platform", "Let knees travel freely over toes", "Lower through the full range before driving up"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'hack_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the bell close", "Let knees travel forward", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'heel_elev_goblet_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set the pad above the ankle", "Control the lift", "Squeeze the quad at the top"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'leg_extension';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep your low back planted throughout", "Feet hip-width and flat on the platform", "Drive through the whole foot to full extension"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'leg_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you descend", "Control every inch down", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'tempo_back_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the bell close", "Control every inch down", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'tempo_goblet_squat';

-- -- hinge ---------------------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you pull", "Push the floor away", "Keep the bar close"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'barbell_deadlift';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge at the hips, not the lower back", "Keep a soft knee throughout", "Push hips back as torso descends"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'barbell_good_morning';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep the bar dragging close to the legs", "Stop when hamstrings are fully loaded"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'barbell_rdl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Tuck the ribs down", "Drive through your heels", "Lock out with glutes"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'hip_thrust';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep a soft knee", "Keep the bells close"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_rdl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hike the bell back", "Snap the hips through", "Let arms stay long"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_swing';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep hips pinned down", "Curl through the pad", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'lying_leg_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hike the bell back", "Snap the hips through", "Finish at chest height"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'russian_kb_swing';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge first to the bag", "Keep the bag close", "Finish tall at the top"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_ground_to_shoulder';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the pelvis neutral against the seat", "Curl through the pad without lifting the hips", "Control the return fully"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'seated_leg_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Square the hips", "Reach the free leg back", "Keep a soft knee"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'single_leg_rdl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you pull", "Push the floor away", "Stand tall at lockout"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'trap_bar_deadlift';

-- -- lunge ---------------------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stay tall through the torso", "Front foot stays planted", "Drop the back knee straight down"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bulgarian_split_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stay tall through the torso", "Step into each rep softly", "Push through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'walking_lunges';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stay tall through the torso", "Step into each rep softly", "Push through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'weighted_walking_lunge';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Place the whole foot on the box", "Drive through the lead leg", "Stand tall before stepping down"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'weighted_step_up';

-- -- push_horizontal -----------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders down and back", "Lower to a consistent touchpoint", "Press until elbows lock"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bench_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep a soft elbow", "Sweep arms in a wide arc", "Control the stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cable_fly';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders down and back", "Keep wrists stacked over elbows", "Press evenly on both sides"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_flat_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders down and back into the pad", "Lower to the upper chest", "Press on a slight angle toward the ceiling"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_incline_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders down and back", "Lower to upper chest", "Press until elbows lock"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'incline_bench_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders against the pad", "Lower with forearms vertical", "Press smoothly to full reach"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'machine_chest_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep a soft elbow", "Open under control", "Squeeze the handles together"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pec_deck';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows pointed up", "Lower under control", "Extend without shoulder drift"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'skullcrusher';

-- -- push_vertical -------------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lead with the elbow", "Feel tension at the bottom, do not release it", "Control the return to the start position"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cable_lateral_raise';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you press", "Press straight overhead", "Finish with biceps by ears"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_shoulder_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lead with the elbow", "Raise to shoulder height", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'lateral_raise';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you press", "Keep forearms stacked", "Finish with biceps by ears"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'machine_shoulder_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you press", "Bar clears the face then travels back over the head", "Finish with bar stacked directly overhead, arms locked"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'ohp';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows fixed", "Stretch behind the head", "Extend without rib flare"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'oh_triceps';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows pinned", "Finish with straight arms", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pushdown';

-- -- pull_horizontal -----------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace the torso first", "Row toward the lower ribs", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'barbell_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows by your sides", "Curl without shoulder swing", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows by your sides", "Curl without shoulder swing", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cable_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Sit tall before you row", "Pull elbows behind you", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cable_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stay heavy on the pad", "Pull elbows behind you", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'chest_supported_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace with the free hand", "Pull elbow toward the hip", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Pull toward the face", "Finish with elbows high", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'face_pull';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Let the arm hang long", "Keep elbows by your sides", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'incline_db_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lead with the elbows", "Open wide at the top", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'rear_delt_fly';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the body rigid", "Pull elbows behind you", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'ring_row';

-- -- pull_vertical -------------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders down first", "Pull elbows to your sides", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'lat_pulldown';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders down first", "Pull elbows to your sides", "Reach full hang between reps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pull_up';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep arms mostly straight", "Pull from the shoulders", "Finish with hands by thighs"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'straight_arm_pd';

-- -- carry ---------------------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stand tall through the torso", "Walk with short steady steps", "Keep shoulders packed down"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'farmers_carry';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows slightly forward", "Brace through the torso", "Walk with short steady steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'front_rack_carry';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hug the bag tight to the chest or shoulder", "Stand tall through the torso", "Walk with short steady steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_carry';

-- -- anti_extension / core ----------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Tuck the pelvis under", "Raise knees without swinging", "Control the lowering"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'hanging_knee_raise';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Tuck the pelvis under", "Lift with control", "Avoid swinging through the kip"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'toes_to_bar';

-- -- calf ----------------------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Press through the big toe", "Pause at the top", "Lower to full stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'barbell_standing_calf_raise';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Press through the big toe", "Pause at the top", "Lower to full stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'seated_calf_raise';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Press through the ball of the foot", "Pause at the top", "Lower to full stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'seated_db_calf_raise';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stay balanced over the foot", "Pause at the top", "Lower to full stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'single_leg_standing_calf_raise';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Press through the big toe", "Pause at the top", "Lower to full stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'standing_calf_raise_bw';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Press through the big toe", "Pause at the top", "Lower to full stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'standing_calf_raise';

-- -- cyclical_engine -----------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drive each stroke hard", "Stay tall through the torso", "Keep rhythm between efforts"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'air_bike_sprint';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Push and pull every stroke", "Stay tall through the torso", "Keep rhythm through transitions"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'assault_bike';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drive each stroke smoothly", "Stay tall through the torso", "Keep rhythm through the cycle"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bike_erg';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Run tall through the torso", "Land under your hips", "Keep quick relaxed steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'outdoor_run';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drive with the legs first", "Finish with the handle to ribs", "Recover in reverse order"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'row_erg';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drive hips and hands together", "Pull handles to the pockets", "Recover long and smooth"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'ski_erg';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Run tall through the torso", "Land under your hips", "Keep quick relaxed steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'treadmill_run';

-- -- locomotion / HYROX / mixed modal -----------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep hips low and stable throughout", "Generate power from the hips, not just the arms", "Brace the core on every stroke"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'battle_ropes';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep knees close to the floor", "Move opposite hand and foot", "Stay long through the spine"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bear_crawl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Load hips before takeoff", "Land softly on the box", "Stand tall before stepping down"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'box_jump';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drop chest to the floor", "Jump feet in under hips", "Finish tall with a clear jump"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'burpee';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge to the bells first", "Jump feet outside the hands", "Press overhead without arching"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'devils_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stay tall through the torso", "Turn the rope from the wrists", "Land softly on the balls"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'jump_rope';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Reach tall before the slam", "Brace before you throw", "Catch the bounce under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'medball_slam';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace through the torso", "Drive knees straight forward", "Keep shoulders stacked over hands"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'mountain_climber';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stay tall through the torso", "Plant and turn under control", "Accelerate out of each line"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'shuttle_run';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lean back and brace", "Drive with short powerful steps", "Keep tension on the rope"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sled_pull';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lean slightly into the sled", "Drive with short powerful steps", "Keep arms straight on the handles"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sled_push';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drive from legs first", "Throw to a consistent target", "Catch softly into the squat"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'wall_ball';

-- -- additional catalogue rows --------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Reach long in front", "Sit back to the working heel", "Keep the knee tracking over toes"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'assisted_pistol_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '[]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'atomic_push_ups';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Dip straight down before driving", "Drive with the legs first", "Finish stacked directly overhead"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_push_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '[]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_row_upright_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '[]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_row_upright_row_kb_swings';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you descend", "Keep knees tracking over toes", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_tempo_back_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Step back into a long stance", "Drop the back knee straight down", "Drive through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bodyweight_reverse_lunge';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Place the whole foot on the box", "Drive through the lead leg", "Stand tall at the top"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'box_step_up';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep most weight on the front leg", "Keep the load close to the body"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bstance_rdl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drop hands under the shoulders", "Snap the feet back in quickly", "Jump forward and land softly"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'burpee_broad_jump';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace the torso before each rep", "Drive the heel straight back", "Keep the pelvis square"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cable_glute_kickback';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows close to the ribs", "Brace in a straight line", "Press the floor away evenly"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'closegrip_pushups';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the heels elevated and planted", "Let knees travel forward", "Stay tall through the torso"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cyclist_squat_heels_elevated';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders down and back", "Keep wrists stacked over elbows", "Press evenly on both sides"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_bench_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drop straight down under control", "Keep most weight in the front leg", "Drive through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_bulgarian_split_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stand tall through the torso", "Keep shoulders down and level", "Walk with short steady steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_farmer_carry';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders down and back", "Pause lightly on the floor", "Press evenly on both sides"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_floor_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '[]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_pull_over';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep the bells close to the legs", "Stop when hamstrings are fully loaded"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_rdl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Squat first with elbows up", "Drive hard out of the legs", "Finish stacked overhead"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_thruster';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Step long enough to load the front leg", "Drop the back knee straight down", "Push through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_walking_lunges';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Press the low back into the floor", "Reach long through the moving limbs", "Move slowly without losing position"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'dead_bug';

UPDATE exercise_catalogue
SET coaching_cues_json = '[]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'dead_tread';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows high in the rack", "Brace before you descend", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'double_db_front_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stand tall through the torso", "Keep shoulders down and level", "Walk with short steady steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'farmer_carry_dumbbells';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stand tall through the torso", "Keep shoulders down and level", "Walk with short steady steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'farmer_carry_handles';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stand tall through the torso", "Keep shoulders down and level", "Walk with short steady steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'farmer_carry_kettlebells';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stand tall through the torso", "Keep shoulders down and level", "Walk with short steady steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'farmer_carry_weighted';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the body rigid throughout", "Pull the chest to the bar", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'feetelevated_inverted_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace in a straight line", "Lower the chest between the hands", "Press the floor away evenly"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'feetelevated_pushup';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep hips lifted throughout", "Walk the heels out slowly", "Pull the heels back under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'hamstring_walkouts';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Squeeze glutes and quads hard", "Pull elbows toward the toes", "Brace like taking a punch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'hardstyle_plank';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the body rigid throughout", "Pull the chest to the bar", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'inverted_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Drop straight down under control", "Keep most weight in the front leg", "Drive through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_bulgarian_split_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep the bell close to the body", "Push the floor away to stand"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_deadlift';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stand tall through the torso", "Keep shoulders down and level", "Walk with short steady steps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_farmer_carry';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you press", "Keep the wrist stacked under the bell", "Finish with the bell directly overhead"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_shoulder_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge back, do not squat it", "Snap the hips hard to drive the bell", "Let the bell float, then reload"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_swing_high';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge back, do not squat it", "Snap the hips hard to drive the bell", "Let the bell float, then reload"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_swing_low';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Squat first with elbows up", "Drive hard out of the legs", "Finish stacked overhead"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_thruster';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Step long enough to load the front leg", "Drop the back knee straight down", "Push through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_walking_lunges';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace from knees through shoulders", "Lower the chest between the hands", "Press the floor away evenly"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kneeling_pushup';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows tucked to the body", "Sit down between the hips", "Drive up and slightly forward"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'landmine_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep hips extended throughout", "Lower slowly under control", "Catch with the hands late"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'nordic_hamstring_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stack hips over the shoulders", "Lower the head between the hands", "Press back up through the shoulders"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pike_push_up';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Reach long in front", "Sit back to the working heel", "Keep the knee tracking over toes"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pistol_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace in a straight line", "Lower the chest between the hands", "Press the floor away evenly"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pushup';

UPDATE exercise_catalogue
SET coaching_cues_json = '[]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'rdl_and_bent_over_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Stay tall through the torso", "Pull hands past the hips", "Reset tall before the next stroke"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'resistance_band_ski_erg';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace in a straight line", "Keep the rings close to the body", "Press up without letting rings drift"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'ring_pushup';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lock the feet before you stand", "Pull elbows down to the ribs", "Stand tall before reaching again"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'rope_climb';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lock the feet before you stand", "Pull elbows down to the ribs", "Stand tall before reaching again"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'rope_climb_floor_to_standing';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the bag tight in the rack", "Drop the back knee straight down", "Drive through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_front_rack_lunge';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the bag tight to the body", "Drop the back knee straight down", "Drive through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_lunge';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the bag high to the chest", "Drive hard out of the legs", "Finish stacked overhead"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_thruster';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Reach long in front", "Sit back to the working heel", "Keep the knee tracking over toes"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'shrimp_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Reach long in front", "Sit back to the working heel", "Keep the knee tracking over toes"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'shrimp_squat_assisted';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep ribs down as you bridge", "Drive through the planted heel", "Hold the hips level"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'single_leg_glute_bridge';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep hips square to the floor", "Reach the trail leg long behind"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'singleleg_bodyweight_rdl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep hips square to the floor", "Keep the load close to the leg"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'singleleg_db_romanian_deadlift';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep hips square to the floor", "Keep the load close to the leg"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'singleleg_kb_romanian_deadlift';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lean back and brace hard", "Pull hand over hand to the body", "Keep feet driving through the floor"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sled_pull_rope';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep a long straight body line", "Drive through short powerful steps", "Push through the handles continuously"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sled_push_low_handle';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Dip quickly then explode up", "Swing arms through the jump", "Land softly and reload"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'squat_jump';

UPDATE exercise_catalogue
SET coaching_cues_json = '[]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'table_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Lean forward into the push", "Drive through short powerful steps", "Keep pressure on the implement"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'towel_push';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace and lean back first", "Row elbows back to the ribs", "Keep tension through the whole pull"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'towel_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace in a straight line", "Lower the chest between the hands", "Press the floor away evenly"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'weighted_pushup';

UPDATE exercise_catalogue
SET coaching_cues_json = '[]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'wheelbarrow_pull';
