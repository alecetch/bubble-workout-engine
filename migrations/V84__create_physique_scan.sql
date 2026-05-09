CREATE TABLE IF NOT EXISTS physique_scan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_s3_key TEXT NOT NULL,
  physique_score NUMERIC(5,1) NOT NULL CHECK (physique_score >= 0 AND physique_score <= 100),
  region_scores_json JSONB NOT NULL DEFAULT '{}',
  body_composition_json JSONB NOT NULL DEFAULT '{}',
  observations_json JSONB NOT NULL DEFAULT '[]',
  comparison_json JSONB NULL,
  milestones_json JSONB NOT NULL DEFAULT '[]',
  emphasis_weights_json JSONB NOT NULL DEFAULT '{}',
  streak_at_submission INT NOT NULL DEFAULT 0,
  ai_coaching_narrative TEXT NULL,
  share_card_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physique_scan_user_submitted
  ON physique_scan(user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS physique_milestone (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES physique_scan(id) ON DELETE CASCADE,
  milestone_slug TEXT NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physique_milestone_user
  ON physique_milestone(user_id, achieved_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_physique_milestone_user_slug_unique
  ON physique_milestone(user_id, milestone_slug)
  WHERE milestone_slug NOT IN ('three_week_streak', 'six_week_streak', 'twelve_week_streak', 'biggest_weekly_gain');

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS physique_scan_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS physique_score_best NUMERIC(5,1) NULL;
