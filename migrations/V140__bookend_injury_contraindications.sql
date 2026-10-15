-- Existing rows remain eligible until explicitly reviewed and tagged by the seeds/admin.
ALTER TABLE warmup_exercise ADD COLUMN contraindications_slugs text[] NOT NULL DEFAULT '{}';
ALTER TABLE cooldown_exercise ADD COLUMN contraindications_slugs text[] NOT NULL DEFAULT '{}';
