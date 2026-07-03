CREATE TABLE IF NOT EXISTS hyrox_doubles_scrape_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES hyrox_doubles_scrape_jobs(id) ON DELETE CASCADE,
  job_event_id UUID REFERENCES hyrox_doubles_scrape_job_events(id) ON DELETE CASCADE,
  hyrox_event_id INTEGER,
  division_category TEXT,
  page_offset INTEGER,
  error_type TEXT,
  error_message TEXT,
  retry_number INTEGER DEFAULT 0,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doubles_errors_job
  ON hyrox_doubles_scrape_errors (job_id);
