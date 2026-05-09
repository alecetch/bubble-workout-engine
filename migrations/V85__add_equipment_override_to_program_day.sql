ALTER TABLE program_day
  ADD COLUMN IF NOT EXISTS equipment_override_preset_slug TEXT NULL,
  ADD COLUMN IF NOT EXISTS equipment_override_items_slugs TEXT[] NULL;

COMMENT ON COLUMN program_day.equipment_override_preset_slug
  IS 'When set, overrides client_profile.equipment_preset_slug for exercise re-selection on this day.';

COMMENT ON COLUMN program_day.equipment_override_items_slugs
  IS 'When set, overrides client_profile.equipment_items_slugs for exercise re-selection on this day.';
