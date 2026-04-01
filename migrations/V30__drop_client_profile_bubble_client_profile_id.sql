-- bubble_client_profile_id was a legacy Bubble platform identifier.
-- The UNIQUE (user_id) constraint (V27/V28) replaced it as the upsert target.
-- All application code references were removed before this migration was applied.
-- Step B baseline verification confirmed no new writes after the code change.
ALTER TABLE client_profile DROP COLUMN IF EXISTS bubble_client_profile_id;
