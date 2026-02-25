-- V6__add_ownership_foreign_keys.sql
--
-- Adds three FK constraints that V1 could not define because app_user (V3) and
-- client_profile (V5) were created in later migrations.
--
-- Tables affected:
--   program.user_id              -> app_user(id)
--   program.client_profile_id    -> client_profile(id)  ON DELETE SET NULL
--   segment_exercise_log.user_id -> app_user(id)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT DIAGNOSTICS
-- Run these queries before applying in any environment where real data may exist.
-- All three should return 0 after clean bootstrap; investigate any non-zero counts.
--
--   -- 1) Programs with no owning app_user row (will be deleted below):
--   SELECT COUNT(*)
--   FROM program p
--   WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = p.user_id);
--
--   -- 2) Segment_exercise_log rows with no owning app_user row (will be deleted):
--   SELECT COUNT(*)
--   FROM segment_exercise_log l
--   WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = l.user_id);
--
--   -- 3) Programs with a dangling client_profile_id (will be set to NULL):
--   SELECT COUNT(*)
--   FROM program p
--   WHERE p.client_profile_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM client_profile c WHERE c.id = p.client_profile_id);
--
-- ─────────────────────────────────────────────────────────────────────────────
-- REMEDIATION (runs inside Flyway's implicit transaction; rolls back on failure)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Null-out program.client_profile_id where the referenced profile no
-- longer exists.  The column is nullable, so this is safe and preserves the
-- program record itself.
UPDATE program p
SET client_profile_id = NULL
WHERE p.client_profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_profile c WHERE c.id = p.client_profile_id
  );

-- Step 2: Delete programs whose user_id has no matching app_user row.
-- These are orphaned records (test data or import bugs) with no ownable user.
-- Cascades automatically delete program_week, program_day, program_calendar_day,
-- workout_segment, program_exercise, and segment_exercise_log child rows.
DELETE FROM program p
WHERE NOT EXISTS (
  SELECT 1 FROM app_user u WHERE u.id = p.user_id
);

-- Step 3: Delete any remaining segment_exercise_log rows whose user_id still
-- has no matching app_user.  The cascade in step 2 handles most cases; this
-- catches orphaned logs whose program_id references a still-valid program.
DELETE FROM segment_exercise_log l
WHERE NOT EXISTS (
  SELECT 1 FROM app_user u WHERE u.id = l.user_id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONSTRAINT ADDITIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- FK 1: program.user_id -> app_user(id)
-- No ON DELETE action: RESTRICT is the safe default for ownership columns.
-- A user row cannot be deleted while programs reference it; caller must
-- clean up programs before deleting a user (or a future migration can add
-- ON DELETE CASCADE if a full account-deletion flow is implemented).
ALTER TABLE program
  ADD CONSTRAINT fk_program_user
  FOREIGN KEY (user_id) REFERENCES app_user(id);

-- FK 2: program.client_profile_id -> client_profile(id)
-- ON DELETE SET NULL: preserves the program if the profile is deleted
-- (profile deletion cascades from app_user deletion via client_profile.user_id).
ALTER TABLE program
  ADD CONSTRAINT fk_program_client_profile
  FOREIGN KEY (client_profile_id) REFERENCES client_profile(id)
  ON DELETE SET NULL;

-- FK 3: segment_exercise_log.user_id -> app_user(id)
-- No ON DELETE action (RESTRICT) for the same reason as FK 1.
-- Note: log rows are also cascade-deleted when their program_id is deleted
-- (existing FK on segment_exercise_log.program_id), so user deletion
-- should go through program deletion first.
ALTER TABLE segment_exercise_log
  ADD CONSTRAINT fk_log_user
  FOREIGN KEY (user_id) REFERENCES app_user(id);
