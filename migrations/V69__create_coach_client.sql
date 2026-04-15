CREATE TABLE IF NOT EXISTS coach_client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by_user_id UUID NULL REFERENCES app_user(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_coach_client_status
    CHECK (status IN ('pending', 'active', 'revoked')),
  CONSTRAINT chk_coach_client_no_self_link
    CHECK (coach_user_id <> client_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_client_unique_pair_live
  ON coach_client (coach_user_id, client_user_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_coach_client_coach_status
  ON coach_client (coach_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_client_client_status
  ON coach_client (client_user_id, status, created_at DESC);
