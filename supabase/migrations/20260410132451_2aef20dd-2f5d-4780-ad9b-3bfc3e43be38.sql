CREATE UNIQUE INDEX IF NOT EXISTS uq_instance_template_user_date
ON public.checklist_instances (template_id, assigned_to, scheduled_date)
WHERE template_id IS NOT NULL AND assigned_to IS NOT NULL;