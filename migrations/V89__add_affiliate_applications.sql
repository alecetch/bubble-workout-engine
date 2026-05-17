CREATE TABLE affiliate_applications (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  platform      TEXT NOT NULL,
  audience_size TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON affiliate_applications (created_at DESC);
