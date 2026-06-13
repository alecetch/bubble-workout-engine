CREATE TABLE running_profiler_performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES running_profiler_submissions(id) ON DELETE CASCADE,
  distance TEXT NOT NULL,
  time_seconds INTEGER NOT NULL,
  approx_date TEXT,
  recency TEXT NOT NULL,
  notes TEXT
);
