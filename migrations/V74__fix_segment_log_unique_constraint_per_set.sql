ALTER TABLE segment_exercise_log
  DROP CONSTRAINT IF EXISTS uq_sel_user_segment_exercise;

ALTER TABLE segment_exercise_log
  ADD CONSTRAINT uq_sel_user_segment_exercise
  UNIQUE (user_id, workout_segment_id, program_exercise_id, order_index);
