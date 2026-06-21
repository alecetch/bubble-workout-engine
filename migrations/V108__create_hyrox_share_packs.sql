CREATE TABLE hyrox_share_packs (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id  UUID        NOT NULL REFERENCES hyrox_submissions(id) ON DELETE CASCADE,
  share_token    VARCHAR(64) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  zip_key        TEXT,
  caption        TEXT,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hyrox_share_packs_submission ON hyrox_share_packs(submission_id);
CREATE INDEX idx_hyrox_share_packs_token      ON hyrox_share_packs(share_token);
