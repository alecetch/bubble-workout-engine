ALTER TABLE client_anchor_lift
  ADD COLUMN IF NOT EXISTS source_detail_json JSONB NOT NULL DEFAULT '{}'::jsonb;
