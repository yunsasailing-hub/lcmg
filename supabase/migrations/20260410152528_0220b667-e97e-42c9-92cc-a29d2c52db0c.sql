
-- Add new status values
ALTER TYPE public.checklist_status ADD VALUE IF NOT EXISTS 'late';
ALTER TYPE public.checklist_status ADD VALUE IF NOT EXISTS 'escalated';

-- Add notification tracking fields
ALTER TABLE public.checklist_instances
ADD COLUMN notice_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN warning_sent_at TIMESTAMP WITH TIME ZONE;
