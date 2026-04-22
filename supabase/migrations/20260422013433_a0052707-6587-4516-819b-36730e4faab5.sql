-- Add warning_recipient_user_ids array to templates and assignments
ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS warning_recipient_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.checklist_assignments
  ADD COLUMN IF NOT EXISTS warning_recipient_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.checklist_instances
  ADD COLUMN IF NOT EXISTS warning_recipient_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];