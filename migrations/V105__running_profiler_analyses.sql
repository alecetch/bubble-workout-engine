CREATE TABLE running_profiler_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES running_profiler_submissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confidence TEXT NOT NULL,
  overall_performance_score INTEGER NOT NULL,
  running_capacity_score INTEGER NOT NULL,
  analysis_json JSONB NOT NULL
);
