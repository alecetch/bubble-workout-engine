-- Promotes the index created in V27 to a named constraint.
-- This is a fast metadata operation; no table scan occurs.
ALTER TABLE client_profile
  ADD CONSTRAINT uq_client_profile_user_id
  UNIQUE USING INDEX uq_client_profile_user_id;
