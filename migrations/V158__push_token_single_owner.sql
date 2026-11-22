-- One device push token belongs to only one account at a time.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY device_push_token
    ORDER BY device_push_token_updated_at DESC NULLS LAST, created_at DESC, id DESC
  ) AS owner_rank
  FROM app_user
  WHERE device_push_token IS NOT NULL
)
UPDATE app_user AS users
SET device_push_token = NULL, device_push_token_updated_at = now()
FROM ranked
WHERE users.id = ranked.id AND ranked.owner_rank > 1;

CREATE UNIQUE INDEX app_user_device_push_token_uniq
  ON app_user (device_push_token) WHERE device_push_token IS NOT NULL;
