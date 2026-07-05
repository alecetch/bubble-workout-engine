ALTER TABLE hyrox_doubles_scrape_jobs
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hyrox_doubles_scrape_jobs_cooldown_until
  ON hyrox_doubles_scrape_jobs (cooldown_until)
  WHERE status = 'paused';
