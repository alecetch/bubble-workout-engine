CREATE TABLE IF NOT EXISTS notification_preference (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reminder_enabled             BOOLEAN     NOT NULL DEFAULT TRUE,
  reminder_time_local_hhmm     TEXT        NOT NULL DEFAULT '08:00',
  reminder_timezone            TEXT        NOT NULL DEFAULT 'UTC',
  pr_notification_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  deload_notification_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  last_reminder_sent_date      DATE        NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
