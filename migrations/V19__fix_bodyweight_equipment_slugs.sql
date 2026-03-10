-- V19: Fix bodyweight exercises that incorrectly list 'bodyweight' as required equipment.
-- Bodyweight-only exercises need no equipment, so equipment_items_slugs should be empty.
-- Without this fix, users without 'bodyweight' in their equipment profile cannot be assigned
-- these exercises, causing C:calves slot fills to fail and inflating adjacent block set counts.

UPDATE exercise_catalogue
SET equipment_items_slugs = '{}'::text[],
    equipment_json        = '[]'::jsonb,
    updated_at            = now()
WHERE exercise_id = 'standing_calf_raise_bw';

-- single_leg_standing_calf_raise is "loaded optional" — bodyweight is the base,
-- dumbbell is the optional load. Remove the bodyweight requirement so it is available
-- to any user who has dumbbells (or no equipment at all once bodyweight gate is removed).
UPDATE exercise_catalogue
SET equipment_items_slugs = '{dumbbells}'::text[],
    equipment_json        = '["dumbbells"]'::jsonb,
    updated_at            = now()
WHERE exercise_id = 'single_leg_standing_calf_raise';
