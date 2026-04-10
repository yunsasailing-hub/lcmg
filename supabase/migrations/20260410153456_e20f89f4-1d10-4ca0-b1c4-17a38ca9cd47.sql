
-- Create enums for notification fields
CREATE TYPE public.notification_priority AS ENUM ('normal', 'high', 'critical');
CREATE TYPE public.notification_status AS ENUM ('unread', 'read', 'archived');

-- Enhance in_app_notifications table
ALTER TABLE public.in_app_notifications
ADD COLUMN sender_type TEXT NOT NULL DEFAULT 'system',
ADD COLUMN related_module TEXT NOT NULL DEFAULT 'checklist',
ADD COLUMN related_entity_type TEXT NOT NULL DEFAULT 'checklist_occurrence',
ADD COLUMN priority public.notification_priority NOT NULL DEFAULT 'normal',
ADD COLUMN status public.notification_status NOT NULL DEFAULT 'unread',
ADD COLUMN read_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;

-- Backfill status from is_read
UPDATE public.in_app_notifications SET status = 'read', read_at = updated_at WHERE is_read = true;

-- Set priority based on notification_type
UPDATE public.in_app_notifications SET priority = 'high' WHERE notification_type = 'warning';
UPDATE public.in_app_notifications SET priority = 'critical' WHERE notification_type = 'escalation';

-- Add index for status-based queries
CREATE INDEX idx_notifications_status ON public.in_app_notifications (user_id, status) WHERE status = 'unread';

-- Enhance checklist_instances table
ALTER TABLE public.checklist_instances
ADD COLUMN assigned_manager_user_id UUID,
ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;

-- Backfill completed_at from submitted_at for completed checklists
UPDATE public.checklist_instances SET completed_at = submitted_at WHERE status IN ('completed', 'verified') AND submitted_at IS NOT NULL;
