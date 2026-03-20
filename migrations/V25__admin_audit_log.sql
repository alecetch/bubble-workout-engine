CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_ts
  ON admin_audit_log (ts DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON admin_audit_log (entity, entity_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action
  ON admin_audit_log (action, ts DESC);
