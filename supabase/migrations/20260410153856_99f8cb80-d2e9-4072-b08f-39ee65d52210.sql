
-- Enable extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add unique constraint to prevent duplicate notifications per recipient per checklist occurrence
ALTER TABLE public.in_app_notifications
  ADD CONSTRAINT unique_instance_user_notification_type
  UNIQUE (instance_id, user_id, notification_type);
