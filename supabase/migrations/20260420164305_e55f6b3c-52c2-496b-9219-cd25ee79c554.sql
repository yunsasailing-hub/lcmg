-- Phase 1: Recipe Master schema additions

-- 1) Add 'bakery' to the department enum
ALTER TYPE public.department ADD VALUE IF NOT EXISTS 'bakery';

-- 2) New managed list: recipe_types
CREATE TABLE IF NOT EXISTS public.recipe_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_vi text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read recipe types"
  ON public.recipe_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage recipe types - insert"
  ON public.recipe_types FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage recipe types - update"
  ON public.recipe_types FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage recipe types - delete"
  ON public.recipe_types FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_recipe_types_updated_at
  BEFORE UPDATE ON public.recipe_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed recipe types (idempotent on name)
INSERT INTO public.recipe_types (name_en, sort_order) VALUES
  ('Final Dish', 10),
  ('Prep Item',  20),
  ('Sauce',      30),
  ('Dough',      40),
  ('Drink',      50),
  ('Garnish',    60)
ON CONFLICT DO NOTHING;

-- 3) Seed recipe_categories from spec (idempotent on name_en)
DO $$
DECLARE
  cats text[] := ARRAY[
    'Breakfast','Appetizer','Salad','Pasta','Pizza','Panini',
    'Main Course','Dessert','Gelato','Cocktail','Mocktail',
    'Coffee','Prep Item','Sauce','Dough','Other'
  ];
  c text;
  i int := 10;
BEGIN
  FOREACH c IN ARRAY cats LOOP
    IF NOT EXISTS (SELECT 1 FROM public.recipe_categories WHERE lower(name_en) = lower(c)) THEN
      INSERT INTO public.recipe_categories (name_en, sort_order) VALUES (c, i);
    END IF;
    i := i + 10;
  END LOOP;
END $$;

-- 4) Seed branches (idempotent on name)
DO $$
DECLARE
  br text;
BEGIN
  FOREACH br IN ARRAY ARRAY['La Cala','La Cala Mare','B26'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE lower(name) = lower(br)) THEN
      INSERT INTO public.branches (name) VALUES (br);
    END IF;
  END LOOP;
END $$;

-- 5) Add Recipe Master columns
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS recipe_type_id   uuid REFERENCES public.recipe_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id      uuid REFERENCES public.recipe_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selling_price    numeric,
  ADD COLUMN IF NOT EXISTS currency         currency_code NOT NULL DEFAULT 'VND',
  ADD COLUMN IF NOT EXISTS portion_quantity numeric,
  ADD COLUMN IF NOT EXISTS portion_unit     text,
  ADD COLUMN IF NOT EXISTS shelf_life       text,
  ADD COLUMN IF NOT EXISTS internal_memo    text,
  ADD COLUMN IF NOT EXISTS updated_by       uuid;

-- 6) Unique recipe code (case-insensitive) when present
CREATE UNIQUE INDEX IF NOT EXISTS recipes_code_unique_ci
  ON public.recipes (lower(code))
  WHERE code IS NOT NULL;

-- 7) updated_at + updated_by triggers on recipes
DROP TRIGGER IF EXISTS update_recipes_updated_at ON public.recipes;
CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_recipes_updated_by ON public.recipes;
CREATE TRIGGER set_recipes_updated_by
  BEFORE INSERT OR UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();
