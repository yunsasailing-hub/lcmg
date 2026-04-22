-- 1. New table: ingredient_categories (mirrors recipe_categories shape)
CREATE TABLE public.ingredient_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_vi text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingredient_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read ingredient categories"
  ON public.ingredient_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage ingredient categories - insert"
  ON public.ingredient_categories FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage ingredient categories - update"
  ON public.ingredient_categories FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage ingredient categories - delete"
  ON public.ingredient_categories FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_ingredient_categories_updated_at
  BEFORE UPDATE ON public.ingredient_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. New column on ingredients
ALTER TABLE public.ingredients
  ADD COLUMN ingredient_category_id uuid REFERENCES public.ingredient_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_ingredients_ingredient_category_id ON public.ingredients(ingredient_category_id);

-- 3. Copy used recipe_categories into ingredient_categories and remap
WITH used AS (
  SELECT DISTINCT rc.id AS old_id, rc.name_en, rc.name_vi, rc.sort_order, rc.is_active
  FROM public.recipe_categories rc
  JOIN public.ingredients i ON i.category_id = rc.id
),
inserted AS (
  INSERT INTO public.ingredient_categories (name_en, name_vi, sort_order, is_active)
  SELECT name_en, name_vi, sort_order, is_active FROM used
  RETURNING id, name_en
)
UPDATE public.ingredients i
SET ingredient_category_id = ins.id
FROM used u
JOIN inserted ins ON ins.name_en = u.name_en
WHERE i.category_id = u.old_id;