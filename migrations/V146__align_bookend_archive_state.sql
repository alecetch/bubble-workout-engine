-- Bring production's warm-up/cool-down archive state in line with local, where these were changed
-- through the admin UI (which only affects the environment it runs in).
--
-- Archive three warm-ups that have no video and only a placeholder still (archived locally 2026-10-10).
-- They stay active in production otherwise and can be picked for programs there.
-- Archive, never delete: program history references these ids.
UPDATE warmup_exercise
SET is_archived = true,
    updated_at = now()
WHERE is_archived = false
  AND warmup_exercise_id IN (
    'warmup-farmers-carry-prep',
    'warmup-fist-clench-spread',
    'warmup-push-up-plus'
  );

-- Restore Seated Glute Stretch (restored locally 2026-10-12, already removed from the archive list in
-- R__seed_cooldown_exercises.sql). Production has its real still and video, so restoring it shows no
-- placeholder.
UPDATE cooldown_exercise
SET is_archived = false,
    updated_at = now()
WHERE is_archived = true
  AND cooldown_exercise_id = 'cooldown-seated-glute-stretch';
