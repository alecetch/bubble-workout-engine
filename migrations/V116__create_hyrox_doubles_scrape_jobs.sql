CREATE TABLE IF NOT EXISTS hyrox_doubles_scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','paused','completed','failed','cancelled','retrying')),
  selected_event_ids INTEGER[] NOT NULL,
  selected_divisions TEXT[] NOT NULL,
  target_record_count INTEGER DEFAULT 15000,
  enrich_splits BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  total_events INTEGER DEFAULT 0,
  events_completed INTEGER DEFAULT 0,
  total_records_found INTEGER DEFAULT 0,
  total_records_saved INTEGER DEFAULT 0,
  total_duplicates_skipped INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  current_event_id INTEGER REFERENCES hyrox_events(id),
  current_division TEXT,
  current_page_offset INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hyrox_doubles_scraped_results
  ADD CONSTRAINT fk_doubles_results_job
  FOREIGN KEY (scrape_job_id) REFERENCES hyrox_doubles_scrape_jobs(id);

CREATE INDEX IF NOT EXISTS idx_doubles_jobs_status
  ON hyrox_doubles_scrape_jobs (status);
