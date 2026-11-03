ALTER TABLE training_session ADD COLUMN IF NOT EXISTS activity_type text NULL;
ALTER TABLE training_session ADD COLUMN IF NOT EXISTS duration_min int NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_session_manual_per_day
  ON training_session(user_id, local_date) WHERE source = 'manual';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'training_session'::regclass
                 AND conname = 'chk_training_session_manual_fields') THEN
    ALTER TABLE training_session ADD CONSTRAINT chk_training_session_manual_fields
      CHECK (source <> 'manual' OR (activity_type IS NOT NULL
        AND activity_type IN ('run','cycle','swim','class','hyrox','sport','strength_elsewhere','other')
        AND duration_min IS NOT NULL AND duration_min BETWEEN 20 AND 300));
  END IF;
END $$;
