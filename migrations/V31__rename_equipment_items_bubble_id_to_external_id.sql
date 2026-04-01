-- Rename the legacy Bubble platform identifier to a neutral external_id.
-- All values are preserved.
ALTER TABLE equipment_items RENAME COLUMN bubble_id TO external_id;
