ALTER TABLE public.checklist_instances
ADD COLUMN IF NOT EXISTS archive_hidden_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS archive_hidden_by uuid;

CREATE INDEX IF NOT EXISTS idx_checklist_instances_archive_hidden_at
  ON public.checklist_instances(archive_hidden_at);