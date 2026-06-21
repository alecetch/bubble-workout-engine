ALTER TABLE cs_race_events
  ADD COLUMN IF NOT EXISTS scrape_meta_json JSONB;
