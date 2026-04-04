-- Layer 1: whitelist flag on exercise_catalogue.
-- Exercises NOT in the whitelist will have any distance prescription
-- converted to the rule's time equivalent.
ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS accepts_distance_unit boolean not null default false;

-- Layer 2: coach-configured time equivalent on each rep rule.
-- Only needs to be set on rules that prescribe reps_unit = 'm'.
-- Null on non-distance rules.
ALTER TABLE program_rep_rule
  ADD COLUMN IF NOT EXISTS time_equivalent_low_sec integer null,
  ADD COLUMN IF NOT EXISTS time_equivalent_high_sec integer null;
