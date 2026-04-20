-- Procedure type enum
DO $$ BEGIN
  CREATE TYPE public.procedure_type AS ENUM ('prep','cook','assemble','bake','mix','finish','service_prep','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Extend recipe_procedures with phase 3 fields
ALTER TABLE public.recipe_procedures
  ADD COLUMN IF NOT EXISTS procedure_type public.procedure_type NOT NULL DEFAULT 'prep',
  ADD COLUMN IF NOT EXISTS warning text,
  ADD COLUMN IF NOT EXISTS tool text,
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS idx_recipe_procedures_recipe ON public.recipe_procedures(recipe_id, step_number);