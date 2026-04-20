-- ============================================
-- RECIPES MODULE — FOUNDATION
-- ============================================

-- Enums
CREATE TYPE public.unit_type AS ENUM ('weight', 'volume', 'count', 'other');
CREATE TYPE public.storage_type AS ENUM ('dry', 'chilled', 'frozen', 'ambient');
CREATE TYPE public.recipe_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE public.recipe_kind AS ENUM ('dish', 'prep', 'batch', 'sub_recipe');

-- ============================================
-- REFERENCE: CATEGORIES
-- ============================================
CREATE TABLE public.recipe_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_vi text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX recipe_categories_name_en_uniq ON public.recipe_categories (lower(name_en));

ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read categories"
ON public.recipe_categories FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Owners/managers manage categories - insert"
ON public.recipe_categories FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage categories - update"
ON public.recipe_categories FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage categories - delete"
ON public.recipe_categories FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_recipe_categories_updated
BEFORE UPDATE ON public.recipe_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- REFERENCE: UNITS
-- ============================================
CREATE TABLE public.recipe_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_en text NOT NULL,
  name_vi text,
  unit_type public.unit_type NOT NULL DEFAULT 'other',
  base_unit_code text,
  factor_to_base numeric(18,6) NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX recipe_units_code_uniq ON public.recipe_units (lower(code));

ALTER TABLE public.recipe_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read units"
ON public.recipe_units FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage units - insert"
ON public.recipe_units FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage units - update"
ON public.recipe_units FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage units - delete"
ON public.recipe_units FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_recipe_units_updated
BEFORE UPDATE ON public.recipe_units
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- INGREDIENTS (master)
-- ============================================
CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name_en text NOT NULL,
  name_vi text,
  category_id uuid REFERENCES public.recipe_categories(id) ON DELETE SET NULL,
  base_unit_id uuid REFERENCES public.recipe_units(id) ON DELETE RESTRICT,
  purchase_unit_id uuid REFERENCES public.recipe_units(id) ON DELETE SET NULL,
  purchase_to_base_factor numeric(18,6) NOT NULL DEFAULT 1,
  last_purchase_price numeric(18,4),
  supplier text,
  allergens text[],
  storage_type public.storage_type NOT NULL DEFAULT 'dry',
  yield_percent numeric(5,2) NOT NULL DEFAULT 100,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingredients_category_idx ON public.ingredients (category_id);
CREATE INDEX ingredients_active_idx ON public.ingredients (is_active);
CREATE UNIQUE INDEX ingredients_code_uniq ON public.ingredients (lower(code)) WHERE code IS NOT NULL;
CREATE INDEX ingredients_name_en_idx ON public.ingredients (lower(name_en));

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read ingredients"
ON public.ingredients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage ingredients - insert"
ON public.ingredients FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage ingredients - update"
ON public.ingredients FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage ingredients - delete"
ON public.ingredients FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_ingredients_updated
BEFORE UPDATE ON public.ingredients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RECIPES (placeholder structure)
-- ============================================
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name_en text NOT NULL,
  name_vi text,
  kind public.recipe_kind NOT NULL DEFAULT 'dish',
  status public.recipe_status NOT NULL DEFAULT 'draft',
  department public.department,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  yield_quantity numeric(18,4),
  yield_unit_id uuid REFERENCES public.recipe_units(id) ON DELETE SET NULL,
  description text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipes_status_idx ON public.recipes (status);
CREATE INDEX recipes_department_idx ON public.recipes (department);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read recipes"
ON public.recipes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage recipes - insert"
ON public.recipes FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage recipes - update"
ON public.recipes FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage recipes - delete"
ON public.recipes FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_recipes_updated
BEFORE UPDATE ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RECIPE INGREDIENT LINES (placeholder)
-- ============================================
CREATE TABLE public.recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  sub_recipe_id uuid REFERENCES public.recipes(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  unit_id uuid REFERENCES public.recipe_units(id) ON DELETE SET NULL,
  prep_note text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_ingredients_one_ref CHECK (
    (ingredient_id IS NOT NULL AND sub_recipe_id IS NULL) OR
    (ingredient_id IS NULL AND sub_recipe_id IS NOT NULL)
  )
);
CREATE INDEX recipe_ingredients_recipe_idx ON public.recipe_ingredients (recipe_id);

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read recipe lines"
ON public.recipe_ingredients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage recipe lines - insert"
ON public.recipe_ingredients FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage recipe lines - update"
ON public.recipe_ingredients FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage recipe lines - delete"
ON public.recipe_ingredients FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- ============================================
-- RECIPE PROCEDURES (placeholder)
-- ============================================
CREATE TABLE public.recipe_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  step_number int NOT NULL,
  instruction_en text NOT NULL,
  instruction_vi text,
  duration_minutes int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipe_procedures_recipe_idx ON public.recipe_procedures (recipe_id);

ALTER TABLE public.recipe_procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read procedures"
ON public.recipe_procedures FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage procedures - insert"
ON public.recipe_procedures FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage procedures - update"
ON public.recipe_procedures FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage procedures - delete"
ON public.recipe_procedures FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- ============================================
-- RECIPE COSTS (placeholder snapshot)
-- ============================================
CREATE TABLE public.recipe_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  total_cost numeric(18,4) NOT NULL DEFAULT 0,
  cost_per_yield_unit numeric(18,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'VND',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  details jsonb
);
CREATE INDEX recipe_costs_recipe_idx ON public.recipe_costs (recipe_id);

ALTER TABLE public.recipe_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read costs"
ON public.recipe_costs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage costs - insert"
ON public.recipe_costs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage costs - update"
ON public.recipe_costs FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage costs - delete"
ON public.recipe_costs FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- ============================================
-- IMPORT / EXPORT LOGS
-- ============================================
CREATE TABLE public.recipe_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  entity text NOT NULL,
  performed_by uuid,
  total_rows int NOT NULL DEFAULT 0,
  success_rows int NOT NULL DEFAULT 0,
  error_rows int NOT NULL DEFAULT 0,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/managers can read logs"
ON public.recipe_import_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers can insert logs"
ON public.recipe_import_logs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- ============================================
-- SEED DATA
-- ============================================
INSERT INTO public.recipe_categories (name_en, name_vi, sort_order) VALUES
  ('Produce', 'Rau củ', 10),
  ('Dairy', 'Sữa & Bơ', 20),
  ('Meat', 'Thịt', 30),
  ('Seafood', 'Hải sản', 40),
  ('Dry Goods', 'Hàng khô', 50),
  ('Beverages', 'Đồ uống', 60),
  ('Spices & Herbs', 'Gia vị', 70),
  ('Bakery', 'Bánh', 80),
  ('Oils & Vinegars', 'Dầu & Giấm', 90),
  ('Frozen', 'Hàng đông', 100);

INSERT INTO public.recipe_units (code, name_en, name_vi, unit_type, base_unit_code, factor_to_base, sort_order) VALUES
  ('kg',  'Kilogram',  'Kg',         'weight', 'g',  1000, 10),
  ('g',   'Gram',      'Gam',        'weight', 'g',  1,    20),
  ('L',   'Liter',     'Lít',        'volume', 'ml', 1000, 30),
  ('ml',  'Milliliter','Mililít',    'volume', 'ml', 1,    40),
  ('pcs', 'Pieces',    'Cái',        'count',  'pcs',1,    50),
  ('box', 'Box',       'Hộp',        'count',  'pcs',1,    60),
  ('btl', 'Bottle',    'Chai',       'count',  'pcs',1,    70),
  ('pack','Pack',      'Gói',        'count',  'pcs',1,    80),
  ('tsp', 'Teaspoon',  'Thìa cà phê','volume', 'ml', 5,    90),
  ('tbsp','Tablespoon','Thìa canh',  'volume', 'ml', 15,   100);