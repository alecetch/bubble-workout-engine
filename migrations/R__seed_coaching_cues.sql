-- First-draft exercise coaching cues seed.
-- Review/edit content exercise by exercise before production use.

-- -- squat ---------------------------------------------------------------

UPDATE exercise_catalogue
SET technique_cue = 'Knees out, chest up',
    technique_setup = 'Set your stance so the whole foot stays planted and brace before you unlock the knees. Keep the bar stacked over the mid-foot and stay tight through the torso so the descent is controlled.',
    technique_execution_json = '["Break at hips and knees together while keeping the chest proud","Descend until you reach your best stable depth with the whole foot planted","Drive up through the floor and finish with hips and knees locked"]'::jsonb,
    technique_mistakes_json = '["Losing pressure through the mid-foot and drifting onto the toes","Letting the chest collapse as you come out of the hole"]'::jsonb,
    coaching_cues_json = '["Brace before you descend", "Knees track over toes", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_back_squat';

UPDATE exercise_catalogue
SET technique_cue = 'Elbows high, chest up',
    technique_setup = 'Build the front rack before you unrack the bar so it sits securely on the shoulders. Stand tall, keep the upper back lifted, and take a breath that fills your trunk before the descent.',
    technique_execution_json = '["Sit down between the hips while driving the elbows up","Keep the torso tall and the bar balanced over the middle of the foot","Stand straight up by pushing through the floor and keeping the rack position"]'::jsonb,
    technique_mistakes_json = '["Dropping the elbows and letting the bar roll forward","Turning the rep into a hip hinge instead of a squat"]'::jsonb,
    coaching_cues_json = '["Keep elbows high throughout", "Stay more upright than a back squat", "Brace before you descend"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_front_squat';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Use the bell as a counterbalance", "Sit between your heels", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'goblet_squat';

UPDATE exercise_catalogue
SET technique_cue = 'Feet forward, knees free',
    technique_setup = 'Set the shoulders and hips firmly into the machine before you unlock the sled. Choose a foot position that lets the knees travel and the pelvis stay stable through the deepest part of the rep.',
    technique_execution_json = '["Lower under control while keeping the full foot planted","Let the knees travel freely as you reach your best stable depth","Drive the platform away without bouncing off the bottom"]'::jsonb,
    technique_mistakes_json = '["Placing the feet so high that the movement turns into a short hinge","Cutting depth to chase heavier loading"]'::jsonb,
    coaching_cues_json = '["Place feet slightly forward on the platform", "Let knees travel freely over toes", "Lower through the full range before driving up"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'hack_squat_machine';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the bell close", "Let knees travel forward", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'heelelevated_goblet_squat';

UPDATE exercise_catalogue
SET technique_cue = 'Heels high, torso tall',
    technique_setup = 'Use a heel-elevated setup that lets you stay tall through the torso while the knees can travel freely. Keep the bell close to the chest so the counterbalance helps you sit between the heels.',
    technique_execution_json = '["Descend straight down with the heels elevated and fully planted","Let the knees travel forward while staying tall through the torso","Drive through the whole foot to stand without losing the rack position"]'::jsonb,
    technique_mistakes_json = '["Letting the heels shift or roll under load","Dumping the chest forward instead of sitting between the hips"]'::jsonb,
    coaching_cues_json = '["Keep the bell close", "Let knees travel forward", "Drive through the whole foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'heelelevated_goblet_squat';

UPDATE exercise_catalogue
SET technique_cue = 'Squeeze at the top',
    technique_setup = 'Align the knee joint with the machine pivot and set the pad just above the ankle. Stay pinned into the seat so the quads do the work instead of the hips rocking around.',
    technique_execution_json = '["Extend the knee smoothly until you reach the top without snapping into lockout","Pause and squeeze the quad hard","Lower under control until the stack is just short of resting"]'::jsonb,
    technique_mistakes_json = '["Kicking the load up with momentum","Lifting the hips off the seat to finish the rep"]'::jsonb,
    coaching_cues_json = '["Set the pad above the ankle", "Control the lift", "Squeeze the quad at the top"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'leg_extension';

UPDATE exercise_catalogue
SET technique_cue = 'Full foot on the platform',
    technique_setup = 'Sit with the hips and low back supported and place the full foot on the sled. Use a stance that lets you lower deeply without the pelvis rolling off the pad.',
    technique_execution_json = '["Lower the sled under control until you hit your best stable depth","Drive evenly through the whole foot to press the platform away","Finish without locking out violently or losing tension"]'::jsonb,
    technique_mistakes_json = '["Letting the heels lift as the sled comes down","Shortening the range to chase more load"]'::jsonb,
    coaching_cues_json = '["Keep your low back planted throughout", "Feet hip-width and flat on the platform", "Drive through the whole foot to full extension"]'::jsonb,
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
SET technique_cue = 'Push the floor away',
    technique_setup = 'Set the feet under the bar so the bar starts over the mid-foot, then lock in the brace before you pull. Pull the slack out of the bar and keep the lats on so the bar stays close.',
    technique_execution_json = '["Drive through the floor while keeping the chest and hips rising together","Drag the bar up the legs until you stand fully tall","Return with control by hinging first and guiding the bar back down"]'::jsonb,
    technique_mistakes_json = '["Jerking the bar off the floor without getting tight first","Letting the bar drift away from the body mid-pull"]'::jsonb,
    coaching_cues_json = '["Brace before you pull", "Push the floor away", "Keep the bar close"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_deadlift';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge at the hips, not the lower back", "Keep a soft knee throughout", "Push hips back as torso descends"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_good_morning';

UPDATE exercise_catalogue
SET technique_cue = 'Hinge long, brace hard',
    technique_setup = 'Set the bar securely on the upper back and unlock the knees just enough to keep them soft. Brace before you move so the hinge loads the posterior chain instead of folding through the low back.',
    technique_execution_json = '["Push the hips back while keeping the torso long and braced","Lower only as far as you can keep the back position solid","Drive the hips through to stand tall under control"]'::jsonb,
    technique_mistakes_json = '["Rounding through the lower back to chase extra range","Turning the rep into a squat with too much knee bend"]'::jsonb,
    coaching_cues_json = '["Hinge at the hips, not the lower back", "Keep a soft knee throughout", "Push hips back as torso descends"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_good_morning';

UPDATE exercise_catalogue
SET technique_cue = 'Hinge, not squat it',
    technique_setup = 'Start tall with the bar resting on the thighs and a soft bend in the knees. Brace the trunk and think about sending the hips back while keeping the bar close to the legs.',
    technique_execution_json = '["Push the hips back and let the torso tip forward without changing the knee angle much","Lower until the hamstrings are loaded and your back position is still solid","Drive the hips through to stand tall with the bar staying close"]'::jsonb,
    technique_mistakes_json = '["Turning the movement into a squat with too much knee bend","Letting the bar drift away from the thighs"]'::jsonb,
    coaching_cues_json = '["Hinge from the hips", "Keep the bar dragging close to the legs", "Stop when hamstrings are fully loaded"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_romanian_deadlift';

UPDATE exercise_catalogue
SET technique_cue = 'Ribs down throughout',
    technique_setup = 'Set the upper back against the bench and plant the feet so the shins can stack near vertical at the top. Brace the torso before you move so the lockout comes from the glutes rather than the lower back.',
    technique_execution_json = '["Drive through the feet to raise the hips while keeping the ribs down","Pause at lockout with glutes squeezed and pelvis neutral","Lower under control until the hips are loaded again"]'::jsonb,
    technique_mistakes_json = '["Hyperextending the low back to chase extra height","Feet too far away so the movement turns into mostly hamstrings"]'::jsonb,
    coaching_cues_json = '["Tuck the ribs down", "Drive through your heels", "Lock out with glutes"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'hip_thrust';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge from the hips", "Keep a soft knee", "Keep the bells close"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_romanian_deadlift';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hike the bell back", "Snap the hips through", "Let arms stay long"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_swing';

UPDATE exercise_catalogue
SET technique_cue = 'Hips pinned down',
    technique_setup = 'Set the machine so the knee joint lines up cleanly and press the hips into the pad. Stay long through the torso so the hamstrings have to produce the movement instead of the hips lifting.',
    technique_execution_json = '["Curl the pad in by driving the heels toward the glutes","Pause briefly in the shortened position without cramping up","Lower under control until the hamstrings are stretched again"]'::jsonb,
    technique_mistakes_json = '["Letting the hips pop off the pad to finish the rep","Dropping the weight stack on the way down"]'::jsonb,
    coaching_cues_json = '["Keep hips pinned down", "Curl through the pad", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'lying_leg_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hike the bell back", "Snap the hips through", "Finish at chest height"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'kb_swing_high';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Hinge first to the bag", "Keep the bag close", "Finish tall at the top"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_ground_to_shoulder';

UPDATE exercise_catalogue
SET technique_cue = 'Bag close, stand tall',
    technique_setup = 'Set the feet around the bag and wedge yourself into a strong hinge before the pickup. Keep the bag close to the body so the transition to the shoulder stays smooth and repeatable.',
    technique_execution_json = '["Hinge down and lock the torso in before gripping the bag","Drive through the floor and keep the bag sliding close up the body","Finish tall with the bag secured before resetting it under control"]'::jsonb,
    technique_mistakes_json = '["Trying to curl the bag away from the floor with the arms","Letting the bag swing far from the torso during the transition"]'::jsonb,
    coaching_cues_json = '["Hinge first to the bag", "Keep the bag close", "Finish tall at the top"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_ground_to_shoulder';

UPDATE exercise_catalogue
SET technique_cue = 'Pelvis neutral throughout',
    technique_setup = 'Set the back pad and leg roller so you can stay firmly locked into the seat. Keep the pelvis neutral and the torso still so the hamstrings move the load cleanly.',
    technique_execution_json = '["Curl the pad down while keeping the hips and torso quiet","Squeeze briefly in the shortened position","Return slowly to the stretched position without losing seat contact"]'::jsonb,
    technique_mistakes_json = '["Leaning back hard to cheat the last part of the curl","Rushing the eccentric and losing tension"]'::jsonb,
    coaching_cues_json = '["Keep the pelvis neutral against the seat", "Curl through the pad without lifting the hips", "Control the return fully"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'seated_leg_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Square the hips", "Reach the free leg back", "Keep a soft knee"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'single_leg_rdl';

UPDATE exercise_catalogue
SET technique_cue = 'Push the floor away',
    technique_setup = 'Stand centered in the trap bar with the handles balanced in the hands before you create tension. Brace, pack the shoulders, and keep the chest tall so the bar rises straight.',
    technique_execution_json = '["Drive through the floor and stand up with the handles staying level","Finish tall with hips and knees locked without leaning back","Lower with control by hinging and bending the knees together"]'::jsonb,
    technique_mistakes_json = '["Yanking the handles before taking the slack out","Letting the chest tip forward and the knees cave in"]'::jsonb,
    coaching_cues_json = '["Brace before you pull", "Push the floor away", "Stand tall at lockout"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'trap_bar_deadlift';

-- -- lunge ---------------------------------------------------------------

UPDATE exercise_catalogue
SET technique_cue = 'Drop, do not lean',
    technique_setup = 'Set up long enough that the front leg can work through a full range without the torso collapsing forward. Stay stacked over the hips and keep the front foot planted from heel to toe.',
    technique_execution_json = '["Lower straight down until the back knee nearly touches","Keep the chest tall and pressure through the full front foot","Drive through the front leg to return to the top"]'::jsonb,
    technique_mistakes_json = '["Falling forward and turning it into a hinge","Pushing mainly off the back foot"]'::jsonb,
    coaching_cues_json = '["Stay tall through the torso", "Front foot stays planted", "Drop the back knee straight down"]'::jsonb,
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
WHERE exercise_id = 'stepup_weighted';

-- -- push_horizontal -----------------------------------------------------

UPDATE exercise_catalogue
SET technique_cue = 'Shoulders down and back',
    technique_setup = 'Build the upper-back position before you unrack the bar and keep the feet set so leg drive has somewhere to go. The touch point and bar path should be repeatable from rep to rep.',
    technique_execution_json = '["Lower the bar under control to the same touch point on the chest","Press back and up while keeping the shoulders packed","Finish with locked elbows and the bar balanced over the shoulders"]'::jsonb,
    technique_mistakes_json = '["Losing upper-back tension and letting the shoulders roll forward","Bouncing the bar off the chest to create momentum"]'::jsonb,
    coaching_cues_json = '["Set shoulders down and back", "Lower to a consistent touchpoint", "Press until elbows lock"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_bench_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep a soft elbow", "Sweep arms in a wide arc", "Control the stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cable_fly';

UPDATE exercise_catalogue
SET technique_cue = 'Wrists over elbows',
    technique_setup = 'Set the shoulders down into the bench and keep the feet planted so the torso stays stable. Start with the dumbbells stacked over the elbows so the press path is balanced from side to side.',
    technique_execution_json = '["Lower the dumbbells under control until you reach a comfortable stretch","Press back up while keeping the wrists stacked over the elbows","Finish with both bells balanced evenly over the shoulders"]'::jsonb,
    technique_mistakes_json = '["Letting one dumbbell drift forward of the other","Shoulders rolling up off the bench at the bottom"]'::jsonb,
    coaching_cues_json = '["Set shoulders down and back", "Keep wrists stacked over elbows", "Press evenly on both sides"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_flat_press';

UPDATE exercise_catalogue
SET technique_cue = 'Shoulders into the pad',
    technique_setup = 'Set the bench angle and pin the upper back into the pad before the first rep. Keep the wrists stacked and lower toward the upper chest so the press line matches the bench angle.',
    technique_execution_json = '["Lower the dumbbells under control until you feel a solid stretch","Press up and slightly in while keeping the shoulders pinned back","Finish with the dumbbells stacked over the shoulders"]'::jsonb,
    technique_mistakes_json = '["Letting the shoulders roll forward off the bench","Pressing straight up instead of following the incline angle"]'::jsonb,
    coaching_cues_json = '["Set shoulders down and back into the pad", "Lower to the upper chest", "Press on a slight angle toward the ceiling"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_incline_press';

UPDATE exercise_catalogue
SET technique_cue = 'Shoulders down and back',
    technique_setup = 'Set the incline so you can keep the upper back tight and the chest proud. Unrack with control and lower to the upper chest with the wrists stacked over the forearms.',
    technique_execution_json = '["Lower the bar to the upper chest with a steady tempo","Press back and up while staying glued to the bench","Finish with the bar stacked over the shoulders"]'::jsonb,
    technique_mistakes_json = '["Touching too low and turning the rep into a flat bench path","Losing the upper-back arch and shoulder position"]'::jsonb,
    coaching_cues_json = '["Set shoulders down and back", "Lower to upper chest", "Press until elbows lock"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'incline_bb_bench_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Set shoulders against the pad", "Lower with forearms vertical", "Press smoothly to full reach"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'machine_chest_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep a soft elbow", "Open under control", "Squeeze the handles together"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pec_deck_fly';

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
SET technique_cue = 'Lead with elbow, stay stacked',
    technique_setup = 'Stand tall with a small bend in the knees and the cable set so tension starts immediately. Keep the ribcage stacked over the hips so the raise comes from the shoulder, not a side bend.',
    technique_execution_json = '["Lead the movement by sweeping the elbow out and up","Raise only as high as the shoulder can control without shrugging","Lower slowly while keeping tension on the cable"]'::jsonb,
    technique_mistakes_json = '["Leaning the torso to cheat the last few inches","Shrugging and turning the movement into upper-trap work"]'::jsonb,
    coaching_cues_json = '["Lead with the elbow", "Feel tension at the bottom, do not release it", "Control the return to the start position"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cable_lateral_raise';

UPDATE exercise_catalogue
SET technique_cue = 'Press straight overhead',
    technique_setup = 'Start with the dumbbells stacked over the shoulders and the ribs pulled down. Sit or stand tall before the first rep so the press can finish directly over the base.',
    technique_execution_json = '["Press the dumbbells straight up while keeping the torso stacked","Finish with the biceps near the ears and wrists over elbows","Lower under control back to the start position"]'::jsonb,
    technique_mistakes_json = '["Arching hard through the low back to finish the rep","Letting the dumbbells drift too far forward"]'::jsonb,
    coaching_cues_json = '["Brace before you press", "Press straight overhead", "Finish with biceps by ears"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_shoulder_press';

UPDATE exercise_catalogue
SET technique_cue = 'Lead with the elbow',
    technique_setup = 'Stand tall with a soft bend at the elbow and the shoulders set down before you start. Keep tension on the dumbbells from the first inch so the delts do the work.',
    technique_execution_json = '["Sweep the elbows out and up until the upper arm reaches about shoulder height","Pause briefly without shrugging the shoulders","Lower with control while keeping tension through the range"]'::jsonb,
    technique_mistakes_json = '["Shrugging and turning it into an upper-trap raise","Swinging the torso to throw the bells up"]'::jsonb,
    coaching_cues_json = '["Lead with the elbow", "Raise to shoulder height", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_lateral_raise';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Brace before you press", "Keep forearms stacked", "Finish with biceps by ears"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'machine_shoulder_press';

UPDATE exercise_catalogue
SET technique_cue = 'Bar over the base',
    technique_setup = 'Start with the bar resting high on the shoulders and the glutes, abs, and quads lightly braced. Keep the ribs down so the press finishes over the middle of the foot rather than in front of you.',
    technique_execution_json = '["Press up and move the head back just enough for the bar to clear","Bring the bar back over the middle of the foot as it passes the forehead","Finish with locked elbows and the body stacked underneath the bar"]'::jsonb,
    technique_mistakes_json = '["Leaning back to turn the rep into an incline press","Letting the bar drift forward instead of finishing stacked"]'::jsonb,
    coaching_cues_json = '["Brace before you press", "Bar clears the face then travels back over the head", "Finish with bar stacked directly overhead, arms locked"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_overhead_press';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows fixed", "Stretch behind the head", "Extend without rib flare"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'overhead_cable_extension';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows pinned", "Finish with straight arms", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pushdown';

-- -- pull_horizontal -----------------------------------------------------

UPDATE exercise_catalogue
SET technique_cue = 'Brace the torso first',
    technique_setup = 'Set the hinge and brace before the first rep so the torso angle stays stable. Let the arms hang long from the shoulders and keep the bar balanced over the mid-foot.',
    technique_execution_json = '["Row the bar toward the lower ribs or upper waist without changing the torso angle","Pause briefly with the elbows behind the body","Lower under control until the arms are long again"]'::jsonb,
    technique_mistakes_json = '["Standing up to finish the rep instead of rowing from the set hinge","Yanking the bar with the lower back and hips"]'::jsonb,
    coaching_cues_json = '["Brace the torso first", "Row toward the lower ribs", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_bentover_row';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows by your sides", "Curl without shoulder swing", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_curl';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep elbows by your sides", "Curl without shoulder swing", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'cable_curl';

UPDATE exercise_catalogue
SET technique_cue = 'Sit tall before you row',
    technique_setup = 'Set the feet and chest so you start from a tall, stable torso rather than a rounded reach. Let the shoulders stretch forward at the start without losing your stacked position.',
    technique_execution_json = '["Initiate by setting the shoulders down and back","Row the handle to the torso while driving the elbows behind you","Control the return to a full reach without collapsing"]'::jsonb,
    technique_mistakes_json = '["Rocking the torso back to create momentum","Shrugging the shoulders instead of rowing through the elbows"]'::jsonb,
    coaching_cues_json = '["Sit tall before you row", "Pull elbows behind you", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'seated_cable_row';

UPDATE exercise_catalogue
SET technique_cue = 'Pull elbows behind you',
    technique_setup = 'Press the chest firmly into the support and let the shoulders reach long at the bottom. Keep the torso glued to the pad so the row comes from the upper back, not momentum.',
    technique_execution_json = '["Set the shoulders and pull the elbows back in line with the torso","Squeeze the upper back without lifting off the pad","Lower under control to a full stretch"]'::jsonb,
    technique_mistakes_json = '["Peeling the chest off the pad to finish the rep","Curling the handles instead of driving with the elbows"]'::jsonb,
    coaching_cues_json = '["Stay heavy on the pad", "Pull elbows behind you", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'chestsupported_row_machine';

UPDATE exercise_catalogue
SET technique_cue = 'Pull elbow to the hip',
    technique_setup = 'Brace with the free hand or knee so the torso stays stable throughout the set. Let the working arm hang long and keep the shoulder packed before you start pulling.',
    technique_execution_json = '["Drive the elbow up and back toward the hip without twisting the torso","Pause briefly when the upper arm reaches the body","Lower the dumbbell under control to a full reach"]'::jsonb,
    technique_mistakes_json = '["Rotating the torso open to create extra range","Yanking with the biceps instead of leading from the elbow"]'::jsonb,
    coaching_cues_json = '["Brace with the free hand", "Pull elbow toward the hip", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'singlearm_db_row';

UPDATE exercise_catalogue
SET technique_cue = 'Pull to the face',
    technique_setup = 'Set the cable height so the line of pull meets the upper face and stay tall through the torso. Let the shoulders reach at the start, but do not lose the ribs and brace.',
    technique_execution_json = '["Lead by pulling the hands toward the face with elbows high and wide","Finish with the shoulders externally rotated and upper back engaged","Return under control to the stretched start position"]'::jsonb,
    technique_mistakes_json = '["Turning it into a low row by dropping the elbows","Shrugging and losing upper-back control"]'::jsonb,
    coaching_cues_json = '["Pull toward the face", "Finish with elbows high", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'face_pull';

UPDATE exercise_catalogue
SET technique_cue = 'Let the arm hang long',
    technique_setup = 'Set the bench so the shoulders can stay open and the upper arm can hang vertically at the bottom. Keep the elbows slightly in front of the torso rather than pinned behind you.',
    technique_execution_json = '["Curl smoothly while keeping the upper arm quiet","Squeeze the biceps near the top without rolling the shoulders forward","Lower slowly until the arm is fully long again"]'::jsonb,
    technique_mistakes_json = '["Swinging the shoulder forward to finish the rep","Cutting the bottom range short and losing the stretch"]'::jsonb,
    coaching_cues_json = '["Let the arm hang long", "Keep elbows by your sides", "Lower under control"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'db_incline_curl';

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
SET technique_cue = 'Shoulders down first',
    technique_setup = 'Start each rep from a full reach with the chest tall and the ribs stacked. Set the shoulders before the elbows bend so the lats own the start of the movement.',
    technique_execution_json = '["Depress the shoulders first to create tension","Pull the elbows down toward the ribs while staying upright","Control the handle back to a full stretch"]'::jsonb,
    technique_mistakes_json = '["Shrugging up and pulling with the arms first","Leaning back excessively to finish the rep"]'::jsonb,
    coaching_cues_json = '["Set shoulders down first", "Pull elbows to your sides", "Control the return"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'lat_pulldown';

UPDATE exercise_catalogue
SET technique_cue = 'Shoulders down first',
    technique_setup = 'Start from a full hang with the ribs down and the legs quiet so the rep begins from the upper back. Create tension through the grip and shoulders before you pull.',
    technique_execution_json = '["Set the shoulders down and back before bending the elbows","Pull until the chin clears the bar while staying stacked","Lower to a full hang under control before the next rep"]'::jsonb,
    technique_mistakes_json = '["Yanking from a dead hang without setting the shoulders","Cutting the bottom range and never returning to full hang"]'::jsonb,
    coaching_cues_json = '["Set shoulders down first", "Pull elbows to your sides", "Reach full hang between reps"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'pullup';

UPDATE exercise_catalogue
SET technique_cue = 'Arms mostly straight',
    technique_setup = 'Stand tall with a slight hinge and let the shoulders elevate at the top without losing the brace. Keep the elbows softly unlocked so the lats rather than the triceps move the handle.',
    technique_execution_json = '["Pull the bar down in an arc by driving from the shoulders","Finish with the hands near the thighs while keeping the ribs stacked","Return slowly to the stretched start position"]'::jsonb,
    technique_mistakes_json = '["Turning it into a triceps pressdown with bent elbows","Leaning the torso way back to chase more load"]'::jsonb,
    coaching_cues_json = '["Keep arms mostly straight", "Pull from the shoulders", "Finish with hands by thighs"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'straightarm_pulldown';

-- -- carry ---------------------------------------------------------------

UPDATE exercise_catalogue
SET technique_cue = 'Stand tall, short steps',
    technique_setup = 'Pick the implements up into a strong, stacked posture before you move. Keep the ribs down, shoulders packed, and eyes forward so the carry is deliberate rather than frantic.',
    technique_execution_json = '["Stand tall and let the arms hang long at your sides","Walk with short controlled steps while keeping the torso quiet","Finish without leaning or dropping one side harder than the other"]'::jsonb,
    technique_mistakes_json = '["Shrugging the shoulders up as the carry gets heavy","Taking long unstable strides that swing the load"]'::jsonb,
    coaching_cues_json = '["Stand tall through the torso", "Walk with short steady steps", "Keep shoulders packed down"]'::jsonb,
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

UPDATE exercise_catalogue
SET technique_cue = 'Bag close, tall posture',
    technique_setup = 'Secure the sandbag high enough that it stays tight to the torso before you start moving. Brace the trunk and stand tall so each step stays short and controlled rather than wobbling side to side.',
    technique_execution_json = '["Pick the bag into a secure chest or shoulder position","Walk with short balanced steps while staying tall through the torso","Keep the bag pinned close until the carry is complete"]'::jsonb,
    technique_mistakes_json = '["Letting the bag hang away from the body and pull you forward","Overstriding and losing balance under fatigue"]'::jsonb,
    coaching_cues_json = '["Hug the bag tight to the chest or shoulder", "Stand tall through the torso", "Walk with short steady steps"]'::jsonb,
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
WHERE exercise_id = 'toestobar';

-- -- calf ----------------------------------------------------------------

UPDATE exercise_catalogue
SET coaching_cues_json = '["Press through the big toe", "Pause at the top", "Lower to full stretch"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'bb_standing_calf_raise';

UPDATE exercise_catalogue
SET technique_cue = 'Pause at the top',
    technique_setup = 'Set the machine so the balls of the feet are secure on the platform and the knees are comfortably fixed. Let the ankles move through a full range instead of bouncing off the bottom.',
    technique_execution_json = '["Drive up through the forefoot until you reach your highest stable position","Pause and squeeze the calves at the top","Lower slowly into a full stretch before the next rep"]'::jsonb,
    technique_mistakes_json = '["Bouncing through the bottom without control","Rolling out to the little toe instead of staying balanced"]'::jsonb,
    coaching_cues_json = '["Press through the big toe", "Pause at the top", "Lower to full stretch"]'::jsonb,
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
WHERE exercise_id = 'standing_calf_raise_bodyweight';

UPDATE exercise_catalogue
SET technique_cue = 'Pause at the top',
    technique_setup = 'Set the pad and foot position so the ankle can move freely without the knees unlocking. Stay balanced over the forefoot and keep the body upright throughout the set.',
    technique_execution_json = '["Rise onto the forefoot as high as you can under control","Pause briefly at the top instead of bouncing through it","Lower to a full stretch before the next rep"]'::jsonb,
    technique_mistakes_json = '["Using body English to bounce through the rep","Cutting off the stretch at the bottom"]'::jsonb,
    coaching_cues_json = '["Press through the big toe", "Pause at the top", "Lower to full stretch"]'::jsonb,
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
SET technique_cue = 'Drive hips and hands together',
    technique_setup = 'Start tall with the arms long and the torso braced so the stroke begins from a connected body position. Let the machine load smoothly rather than yanking the handles down.',
    technique_execution_json = '["Drive through the hips and lats together to accelerate the handles down","Finish with hands near the pockets and the trunk still stacked","Return long and smooth to the start without losing rhythm"]'::jsonb,
    technique_mistakes_json = '["Pulling mostly with the arms and skipping the hip drive","Letting the torso fold over at the finish"]'::jsonb,
    coaching_cues_json = '["Drive hips and hands together", "Pull handles to the pockets", "Recover long and smooth"]'::jsonb,
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
SET technique_cue = 'Drop fast, jump clean',
    technique_setup = 'Start tall with enough space in front of you that the jump can be projected forward cleanly. Think about smooth transitions instead of treating the floor contact and jump as separate events.',
    technique_execution_json = '["Drop the chest to the floor without pausing","Snap the feet back underneath the hips","Jump forward and land softly ready for the next rep"]'::jsonb,
    technique_mistakes_json = '["Stepping the feet in slowly and breaking the rhythm","Landing stiff and needing multiple reset steps"]'::jsonb,
    coaching_cues_json = '["Drop chest to the floor", "Jump feet in under hips", "Finish tall with a clear jump"]'::jsonb,
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
WHERE exercise_id = 'shuttle_runs';

UPDATE exercise_catalogue
SET technique_cue = 'Plant low, re-accelerate',
    technique_setup = 'Approach each turn under control so you can drop the center of mass before the line rather than overrunning it. Stay tall through the trunk and keep the arms active to help the re-acceleration.',
    technique_execution_json = '["Run tall into the line while preparing to lower into the plant","Hit the turn under control and change direction without drifting wide","Explode out of the cut with quick powerful first steps"]'::jsonb,
    technique_mistakes_json = '["Standing upright through the turn and losing traction","Taking extra stutter steps before re-accelerating"]'::jsonb,
    coaching_cues_json = '["Stay tall through the torso", "Plant and turn under control", "Accelerate out of each line"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'shuttle_runs';

UPDATE exercise_catalogue
SET technique_cue = 'Lean back, drive the floor',
    technique_setup = 'Set the feet and body angle before the first pull so you can keep tension through the whole rope path. Stay braced and use the legs to move the sled rather than trying to arm-pull it alone.',
    technique_execution_json = '["Lean back into a strong stance and take the slack out of the rope","Pull hand over hand while driving through the floor","Keep moving continuously until you finish the length"]'::jsonb,
    technique_mistakes_json = '["Standing too upright and losing leverage","Letting the rope go slack between pulls"]'::jsonb,
    coaching_cues_json = '["Lean back and brace", "Drive with short powerful steps", "Keep tension on the rope"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sled_pull';

UPDATE exercise_catalogue
SET technique_cue = 'Lean in, short steps',
    technique_setup = 'Create a straight line from ankles through shoulders before the sled moves and keep the hands fixed on the handles. Think about constant pressure rather than one huge step followed by a stall.',
    technique_execution_json = '["Lean into the sled and drive through quick powerful steps","Keep the arms straight and torso rigid as the sled moves","Maintain pressure until you clear the distance"]'::jsonb,
    technique_mistakes_json = '["Standing up too tall and losing drive angle","Taking long choppy steps that break momentum"]'::jsonb,
    coaching_cues_json = '["Lean slightly into the sled", "Drive with short powerful steps", "Keep arms straight on the handles"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sled_push';

UPDATE exercise_catalogue
SET technique_cue = 'Drive from legs to target',
    technique_setup = 'Hold the ball close to the chest with the elbows under it and set up at a distance from the wall that lets you throw vertically rather than looping the ball out. Stay tall into the catch so each rep flows back into the next squat.',
    technique_execution_json = '["Squat with the torso tall and the ball pinned to the chest","Drive through the legs and release to a repeatable wall target","Catch softly and ride straight into the next squat"]'::jsonb,
    technique_mistakes_json = '["Trying to throw mostly with the arms instead of the legs","Standing too close or too far from the wall and losing the target line"]'::jsonb,
    coaching_cues_json = '["Drive from legs first", "Throw to a consistent target", "Catch softly into the squat"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'wallball';

UPDATE exercise_catalogue
SET technique_cue = 'Drive from legs, hit target',
    technique_setup = 'Hold the ball close to the chest and stand at a distance from the wall that lets you throw vertically rather than away from you. Stay tall on the catch so the next squat starts in control.',
    technique_execution_json = '["Squat smoothly with the elbows under the ball","Drive through the legs to launch the ball to the target","Catch softly and flow straight into the next rep"]'::jsonb,
    technique_mistakes_json = '["Throwing mostly with the arms and losing leg drive","Standing at the wrong distance and chasing the rebound"]'::jsonb,
    coaching_cues_json = '["Drive from legs first", "Throw to a consistent target", "Catch softly into the squat"]'::jsonb,
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
SET technique_cue = 'Dip then drive',
    technique_setup = 'Start with the bar resting securely on the shoulders and the feet rooted under the hips. Keep the torso vertical during the dip so the leg drive can travel straight into the bar.',
    technique_execution_json = '["Dip straight down a few inches without softening the torso","Drive hard through the floor to send the bar overhead","Finish stacked under the bar before returning it to the rack"]'::jsonb,
    technique_mistakes_json = '["Turning the dip into a forward hinge","Pressing too early instead of letting the legs launch the bar"]'::jsonb,
    coaching_cues_json = '["Dip straight down before driving", "Drive with the legs first", "Finish stacked directly overhead"]'::jsonb,
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
SET technique_cue = 'Drop fast, jump far',
    technique_setup = 'Set up tall before the first rep so you can hit the floor quickly without collapsing. Think about smooth transitions between chest-to-floor, feet-in, and broad jump rather than pausing at each phase.',
    technique_execution_json = '["Drop to the floor quickly and bring the chest fully down","Snap the feet back underneath the hips","Explode into the broad jump and land softly ready for the next rep"]'::jsonb,
    technique_mistakes_json = '["Stepping the feet in and out so the rep loses rhythm","Landing stiff and needing multiple resets before the next burpee"]'::jsonb,
    coaching_cues_json = '["Drop hands under the shoulders", "Snap the feet back in quickly", "Jump forward and land softly"]'::jsonb,
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
SET technique_cue = 'Bag high, drop straight down',
    technique_setup = 'Get the bag locked high in the front rack before taking the first step so it does not slide during the lunge. Keep the torso stacked and step long enough that the front leg can own the rep.',
    technique_execution_json = '["Step into a long stable stance with the bag fixed high on the chest","Lower the back knee straight down while staying tall","Drive through the front foot to stand and reset"]'::jsonb,
    technique_mistakes_json = '["Letting the bag sag and fold the torso forward","Taking short choppy steps that jam the front knee"]'::jsonb,
    coaching_cues_json = '["Keep the bag tight in the rack", "Drop the back knee straight down", "Drive through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_frontrack_lunge';

UPDATE exercise_catalogue
SET technique_cue = 'Bag close, back knee down',
    technique_setup = 'Keep the sandbag hugged high and tight so it does not swing away from the torso. Stand tall before each step so the lunge stays balanced and repeatable under fatigue.',
    technique_execution_json = '["Step into a long enough stride to load the front leg","Drop the back knee straight down while keeping the bag close","Drive through the front foot to stand and reset"]'::jsonb,
    technique_mistakes_json = '["Letting the bag drift away and pull the torso forward","Taking tiny steps that make the front knee jam forward"]'::jsonb,
    coaching_cues_json = '["Keep the bag tight to the body", "Drop the back knee straight down", "Drive through the front foot"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_lunge';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep the bag high to the chest", "Drive hard out of the legs", "Finish stacked overhead"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sandbag_thruster';

UPDATE exercise_catalogue
SET technique_cue = 'Squat, then punch overhead',
    technique_setup = 'Set the bag high on the chest and brace before the squat so the torso stays stacked. Let the legs launch the bag, then finish the press only after the hips and knees extend.',
    technique_execution_json = '["Squat with the bag fixed high and elbows up","Drive hard through the floor to stand explosively","Use that leg drive to finish the bag overhead in a stacked position"]'::jsonb,
    technique_mistakes_json = '["Pressing early and losing the transfer from the legs","Letting the bag pull the chest down in the squat"]'::jsonb,
    coaching_cues_json = '["Keep the bag high to the chest", "Drive hard out of the legs", "Finish stacked overhead"]'::jsonb,
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
SET technique_cue = 'Lean back, keep rope tight',
    technique_setup = 'Set your body angle before the first pull so you can keep the rope taut from start to finish. Use the legs to support the pull instead of standing upright and arm-yanking the implement.',
    technique_execution_json = '["Take the slack out and lean back into a stable stance","Pull hand over hand while the feet keep driving into the floor","Keep tension on the rope until the sled reaches you"]'::jsonb,
    technique_mistakes_json = '["Standing too tall and losing leverage","Letting the rope go slack between pulls"]'::jsonb,
    coaching_cues_json = '["Lean back and brace hard", "Pull hand over hand to the body", "Keep feet driving through the floor"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sled_pull_rope';

UPDATE exercise_catalogue
SET coaching_cues_json = '["Keep a long straight body line", "Drive through short powerful steps", "Push through the handles continuously"]'::jsonb,
    updated_at = now()
WHERE exercise_id = 'sled_push_low_handle';

UPDATE exercise_catalogue
SET technique_cue = 'Long line, constant pressure',
    technique_setup = 'Set the body into one long line from ankles through shoulders before you move the sled. Keep the low handles fixed and think about uninterrupted pressure rather than one big shove.',
    technique_execution_json = '["Lean into the handles and create full-body tension","Drive through short powerful steps while keeping the arms straight","Maintain pressure all the way through the lane"]'::jsonb,
    technique_mistakes_json = '["Standing up between steps and stalling the sled","Bending the arms and collapsing the torso onto the handles"]'::jsonb,
    coaching_cues_json = '["Keep a long straight body line", "Drive through short powerful steps", "Push through the handles continuously"]'::jsonb,
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
