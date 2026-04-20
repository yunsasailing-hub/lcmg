-- Phase 2: Add cost_adjust_pct to recipe_ingredients (line note already exists as prep_note)
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS cost_adjust_pct numeric NOT NULL DEFAULT 0;