-- Restore once; the repeatable seed must not undo future admin archiving.
UPDATE cooldown_exercise
SET is_archived = false, updated_at = now()
WHERE cooldown_exercise_id IN (
  'cooldown-doorway-pec-stretch',
  'cooldown-cross-chest-triceps-stretch',
  'cooldown-supine-twist-hold',
  'cooldown-straight-knee-calf-stretch',
  'cooldown-standing-biceps-stretch',
  'cooldown-standing-quad-stretch',
  'cooldown-side-lying-rear-shoulder-stretch'
);
