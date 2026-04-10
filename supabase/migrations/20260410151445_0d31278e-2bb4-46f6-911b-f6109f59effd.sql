
-- Create notification type enum
CREATE TYPE public.notification_type AS ENUM ('notice', 'warning');

-- Create notifications table
CREATE TABLE public.in_app_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID REFERENCES public.checklist_instances(id) ON DELETE CASCADE,
  notification_type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_notifications_user_unread ON public.in_app_notifications (user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_instance ON public.in_app_notifications (instance_id);

-- Prevent duplicate notifications per instance+user+type
CREATE UNIQUE INDEX idx_notifications_unique ON public.in_app_notifications (instance_id, user_id, notification_type);

-- Enable RLS
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
ON public.in_app_notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications"
ON public.in_app_notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Timestamp trigger
CREATE TRIGGER update_notifications_updated_at
BEFORE UPDATE ON public.in_app_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
