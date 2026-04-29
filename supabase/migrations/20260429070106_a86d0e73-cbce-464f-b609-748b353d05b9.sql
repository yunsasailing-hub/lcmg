ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS conversion_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conversion_qty numeric NULL,
  ADD COLUMN IF NOT EXISTS conversion_unit_id uuid NULL;