CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS equipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bubble_id TEXT NOT NULL UNIQUE,
  category TEXT,
  name TEXT NOT NULL,
  exercise_slug TEXT NOT NULL,
  slug TEXT,
  creator TEXT,
  commercial_gym BOOLEAN NOT NULL DEFAULT false,
  crossfit_hyrox_gym BOOLEAN NOT NULL DEFAULT false,
  decent_home_gym BOOLEAN NOT NULL DEFAULT false,
  minimal_equipment BOOLEAN NOT NULL DEFAULT false,
  no_equipment BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  raw_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_equipment_items_exercise_slug ON equipment_items(exercise_slug);
CREATE INDEX IF NOT EXISTS idx_equipment_items_category ON equipment_items(category);
