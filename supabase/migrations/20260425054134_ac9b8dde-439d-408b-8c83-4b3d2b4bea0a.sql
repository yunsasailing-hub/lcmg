-- Add unique Template Code field to checklist_templates
ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS code text;

-- Unique constraint (case-insensitive) when code is provided.
-- Existing legacy rows have NULL and won't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS checklist_templates_code_unique
  ON public.checklist_templates (lower(code))
  WHERE code IS NOT NULL;