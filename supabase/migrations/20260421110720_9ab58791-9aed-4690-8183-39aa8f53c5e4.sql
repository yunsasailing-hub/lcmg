ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS use_as_ingredient boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recipes_use_as_ingredient
  ON public.recipes (use_as_ingredient)
  WHERE use_as_ingredient = true AND is_active = true;