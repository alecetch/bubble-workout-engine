-- Keep usage on the account so deleting a scan cannot reset the paid-call cap.
ALTER TABLE app_user ADD COLUMN physique_scan_attempted_at timestamptz;

-- Honour scans made in the cooldown window before this cap was deployed.
UPDATE app_user u
SET physique_scan_attempted_at = recent.submitted_at
FROM (
  SELECT user_id, max(submitted_at) AS submitted_at
  FROM physique_scan
  GROUP BY user_id
) recent
WHERE u.id = recent.user_id;
