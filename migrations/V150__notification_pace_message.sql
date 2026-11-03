ALTER TABLE notification_preference
  ADD COLUMN IF NOT EXISTS last_pace_message_sent_on date NULL;
