-- Store injury flags only as the seven canonical codes (see api/src/utils/injuryFlags.js).
-- Production was backfilled with api/scripts/backfillInjuryFlags.mjs and audited clean on 2026-11-07.
-- The UPDATE below applies the same normalisation (lower-case, non-alphanumerics to "_", trim "_",
-- de-duplicate in first-seen order, drop no_known_issues when a real flag is present) so that
-- development databases holding legacy labels migrate cleanly. Any value that still isn't a
-- canonical code makes the constraint fail, which stops the migration rather than losing data.

UPDATE client_profile cp
SET injury_flags = fixed.codes
FROM (
  SELECT id,
         CASE WHEN cardinality(codes) > 1 THEN array_remove(codes, 'no_known_issues') ELSE codes END AS codes
  FROM (
    SELECT src.id,
           ARRAY(
             SELECT d.code
             FROM (
               SELECT regexp_replace(regexp_replace(lower(trim(f.flag)), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g') AS code,
                      min(f.pos) AS pos
               FROM unnest(src.injury_flags) WITH ORDINALITY AS f(flag, pos)
               GROUP BY 1
             ) d
             ORDER BY d.pos
           ) AS codes
    FROM client_profile src
  ) raw
) fixed
WHERE fixed.id = cp.id
  AND cp.injury_flags IS DISTINCT FROM fixed.codes;

ALTER TABLE client_profile
  ADD CONSTRAINT chk_client_profile_injury_flags_codes
  CHECK (injury_flags <@ ARRAY[
    'shoulder_issues',
    'knee_issues',
    'lower_back_spine',
    'ankle_foot',
    'wrist_elbow',
    'cardiovascular_limitations',
    'no_known_issues'
  ]::text[]);
