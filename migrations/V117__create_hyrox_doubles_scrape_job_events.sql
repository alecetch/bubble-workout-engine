CREATE TABLE IF NOT EXISTS hyrox_doubles_scrape_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES hyrox_doubles_scrape_jobs(id) ON DELETE CASCADE,
  hyrox_event_id INTEGER NOT NULL REFERENCES hyrox_events(id),
  division_category TEXT NOT NULL CHECK (division_category IN ('doubles_male','doubles_female','doubles_mixed')),
  contest_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','skipped')),
  records_found INTEGER DEFAULT 0,
  records_saved INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  pages_scraped INTEGER DEFAULT 0,
  last_page_offset INTEGER DEFAULT 0,
  split_coverage_pct NUMERIC(5,2),
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  UNIQUE (job_id, hyrox_event_id, division_category)
);

CREATE INDEX IF NOT EXISTS idx_doubles_job_events_job
  ON hyrox_doubles_scrape_job_events (job_id, status);
