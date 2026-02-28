-- Undo V9: remove optional hero media reference from program

ALTER TABLE program
  DROP COLUMN IF EXISTS hero_media_id;
