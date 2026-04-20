-- 1. New editable ingredient_types table
CREATE TABLE IF NOT EXISTS public.ingredient_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_vi text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ingredient_types_name_en_unique
  ON public.ingredient_types (lower(name_en));

ALTER TABLE public.ingredient_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read ingredient types"
  ON public.ingredient_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage ingredient types - insert"
  ON public.ingredient_types FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage ingredient types - update"
  ON public.ingredient_types FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage ingredient types - delete"
  ON public.ingredient_types FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_ingredient_types_updated_at
  BEFORE UPDATE ON public.ingredient_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Link ingredients to the new types table (keep legacy enum column for compatibility)
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS ingredient_type_id uuid REFERENCES public.ingredient_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ingredients_ingredient_type_id_idx
  ON public.ingredients (ingredient_type_id);

-- 3. Seed Ingredient Types
INSERT INTO public.ingredient_types (name_en, sort_order)
SELECT v.name, v.sort_order FROM (VALUES
  ('Batch recipe', 10),
  ('Bottled drinks', 20),
  ('Ingredient', 30),
  ('Other items', 40)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ingredient_types t WHERE lower(t.name_en) = lower(v.name)
);

-- 4. Seed Recipe Categories (skip duplicates)
INSERT INTO public.recipe_categories (name_en, sort_order)
SELECT v.name, v.sort_order FROM (VALUES
  ('Meat', 10),
  ('Seafood', 20),
  ('Vegetable', 30),
  ('Dairy', 40),
  ('Dry Goods', 50),
  ('Beverages', 60),
  ('Spices', 70),
  ('Bakery', 80),
  ('Frozen', 90),
  ('Cleaning', 100)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.recipe_categories c WHERE lower(c.name_en) = lower(v.name)
);

-- 5. Seed Recipe Units (skip duplicates by code)
INSERT INTO public.recipe_units (code, name_en, name_vi, unit_type, sort_order)
SELECT v.code, v.name_en, v.name_vi, v.unit_type::unit_type, v.sort_order FROM (VALUES
  ('set',     'Set',     NULL,     'count',  10),
  ('bottle',  'Bottle',  'Chai',   'count',  20),
  ('pcs',     'Pieces',  'Cái',    'count',  30),
  ('box',     'Box',     'Hộp',    'count',  40),
  ('l',       'Liter',   'Lít',    'volume', 50),
  ('kg',      'Kilogram',NULL,     'weight', 60),
  ('pkg',     'Package', NULL,     'count',  70),
  ('portion', 'Portion', 'Phần',   'count',  80)
) AS v(code, name_en, name_vi, unit_type, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.recipe_units u WHERE lower(u.code) = lower(v.code)
);

-- 6. Seed Storehouse: KITCHEN STORE
INSERT INTO public.storehouses (name, sort_order)
SELECT 'KITCHEN STORE', 5
WHERE NOT EXISTS (
  SELECT 1 FROM public.storehouses s WHERE lower(s.name) = lower('KITCHEN STORE')
);