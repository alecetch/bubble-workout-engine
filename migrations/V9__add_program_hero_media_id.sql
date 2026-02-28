-- V9: add optional hero media reference to program
-- Safe, additive migration: nullable UUID, no default, no backfill.

ALTER TABLE program
  ADD COLUMN IF NOT EXISTS hero_media_id uuid;
