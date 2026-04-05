
-- Add assignment_id to link instances to assignment rules
ALTER TABLE public.checklist_instances
  ADD COLUMN assignment_id UUID REFERENCES public.checklist_assignments(id) ON DELETE SET NULL;

-- Prevent duplicate instances: same template + user + date
CREATE UNIQUE INDEX idx_unique_instance_per_user_template_date
  ON public.checklist_instances (template_id, assigned_to, scheduled_date);
