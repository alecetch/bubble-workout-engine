-- V34__cascade_delete_user_programs.sql
--
-- Upgrade the program and segment_exercise_log user FK constraints from
-- RESTRICT to ON DELETE CASCADE so that deleting an app_user row automatically
-- removes all their programs and exercise logs.
--
-- Previously (V6) these were RESTRICT with the note that a future migration
-- would add cascade when an account-deletion flow was implemented.

-- FK 1: program.user_id -> app_user(id)  (was RESTRICT, now CASCADE)
ALTER TABLE program
  DROP CONSTRAINT IF EXISTS fk_program_user;

ALTER TABLE program
  ADD CONSTRAINT fk_program_user
  FOREIGN KEY (user_id) REFERENCES app_user(id)
  ON DELETE CASCADE;

-- FK 2: segment_exercise_log.user_id -> app_user(id)  (was RESTRICT, now CASCADE)
ALTER TABLE segment_exercise_log
  DROP CONSTRAINT IF EXISTS fk_log_user;

ALTER TABLE segment_exercise_log
  ADD CONSTRAINT fk_log_user
  FOREIGN KEY (user_id) REFERENCES app_user(id)
  ON DELETE CASCADE;
