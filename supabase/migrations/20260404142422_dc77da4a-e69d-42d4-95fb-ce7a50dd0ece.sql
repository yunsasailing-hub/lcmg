
-- Create frequency enum
CREATE TYPE public.checklist_frequency AS ENUM ('daily', 'weekly', 'monthly', 'determinate_date');

-- Add frequency columns to checklist_templates
ALTER TABLE public.checklist_templates
  ADD COLUMN frequency public.checklist_frequency NOT NULL DEFAULT 'daily',
  ADD COLUMN default_assigned_to uuid DEFAULT NULL,
  ADD COLUMN specific_date date DEFAULT NULL,
  ADD COLUMN last_generated_date date DEFAULT NULL;
