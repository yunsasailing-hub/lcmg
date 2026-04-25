-- Add note requirement and per-task active flag to checklist_template_tasks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'note_requirement') THEN
    CREATE TYPE public.note_requirement AS ENUM ('none', 'optional', 'mandatory');
  END IF;
END $$;

ALTER TABLE public.checklist_template_tasks
  ADD COLUMN IF NOT EXISTS note_requirement public.note_requirement NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;