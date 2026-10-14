-- Resolve the formerly shared treadmill code using each saved equipment preset.
-- Unknown presets retain the user's choice. Guards make repeated execution safe.
UPDATE client_profile
SET equipment_items_slugs = array_replace(equipment_items_slugs, 'treadmill', 'running_space')
WHERE equipment_preset_slug IN ('minimal_equipment','decent_home_gym','crossfit_hyrox_gym','crossfit/hyrox_gym')
  AND 'treadmill' = ANY(equipment_items_slugs)
  AND NOT ('running_space' = ANY(equipment_items_slugs));

UPDATE client_profile
SET equipment_items_slugs = array_append(equipment_items_slugs, 'running_space')
WHERE equipment_preset_slug = 'commercial_gym'
  AND 'treadmill' = ANY(equipment_items_slugs)
  AND NOT ('running_space' = ANY(equipment_items_slugs));

UPDATE program_day
SET equipment_override_items_slugs = array_replace(equipment_override_items_slugs, 'treadmill', 'running_space')
WHERE equipment_override_preset_slug IN ('minimal_equipment','decent_home_gym','crossfit_hyrox_gym','crossfit/hyrox_gym')
  AND equipment_override_items_slugs IS NOT NULL
  AND 'treadmill' = ANY(equipment_override_items_slugs)
  AND NOT ('running_space' = ANY(equipment_override_items_slugs));

UPDATE program_day
SET equipment_override_items_slugs = array_append(equipment_override_items_slugs, 'running_space')
WHERE equipment_override_preset_slug = 'commercial_gym'
  AND equipment_override_items_slugs IS NOT NULL
  AND 'treadmill' = ANY(equipment_override_items_slugs)
  AND NOT ('running_space' = ANY(equipment_override_items_slugs));
