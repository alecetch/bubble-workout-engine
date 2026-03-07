-- V10: Support recovery (rest) days in program_calendar_day
--
-- Previously, every row required program_week_id and program_day_id (NOT NULL
-- FK references).  Recovery rows have no corresponding program_day or
-- program_week, so both columns must become nullable.
--
-- Decisions:
--   program_week_id  → nullable (recovery rows get NULL; FK still enforced for
--                       non-NULL values)
--   program_day_id   → nullable (recovery rows get NULL; FK still enforced for
--                       non-NULL values)
--   program_day_key  → stays NOT NULL; recovery rows use a deterministic key:
--                       'recovery:<program_id>:<scheduled_date>'
--
-- The existing UNIQUE(program_id, scheduled_date) constraint (added in V1)
-- is the idempotency anchor for ensureProgramCalendarCoverage's
-- ON CONFLICT DO NOTHING.  No new unique constraint is needed.

ALTER TABLE program_calendar_day
  ALTER COLUMN program_week_id DROP NOT NULL;

ALTER TABLE program_calendar_day
  ALTER COLUMN program_day_id DROP NOT NULL;
