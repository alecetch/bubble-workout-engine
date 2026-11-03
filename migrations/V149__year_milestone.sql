CREATE TABLE IF NOT EXISTS year_milestone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  year int NOT NULL,
  slug text NOT NULL,
  threshold int NOT NULL,
  reached_on date NOT NULL,
  claimed_at timestamptz NULL,
  seen_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, slug)
);
-- A durable claim prevents two devices opening the same celebration before dismissal.
CREATE INDEX IF NOT EXISTS idx_year_milestone_user_unseen
  ON year_milestone(user_id) WHERE seen_at IS NULL;
