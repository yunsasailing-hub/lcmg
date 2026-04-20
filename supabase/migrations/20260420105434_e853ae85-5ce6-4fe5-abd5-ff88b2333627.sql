-- 1. Ingredient type enum
CREATE TYPE public.ingredient_type AS ENUM ('batch_recipe', 'bottled_drink', 'ingredient', 'other');

-- 2. Currency enum
CREATE TYPE public.currency_code AS ENUM ('VND', 'USD', 'EUR');

-- 3. Storehouses lookup table (editable)
CREATE TABLE public.storehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read storehouses"
  ON public.storehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners/managers manage storehouses - insert"
  ON public.storehouses FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Owners/managers manage storehouses - update"
  ON public.storehouses FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Owners/managers manage storehouses - delete"
  ON public.storehouses FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_storehouses_updated_at
  BEFORE UPDATE ON public.storehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed standard storehouses
INSERT INTO public.storehouses (name, sort_order) VALUES
  ('Main Kitchen', 10),
  ('Bar', 20),
  ('Pizza', 30),
  ('Bakery', 40),
  ('Dry Store', 50),
  ('Cold Store', 60),
  ('Freezer', 70);

-- 4. Add new columns to ingredients
ALTER TABLE public.ingredients
  ADD COLUMN ingredient_type public.ingredient_type NOT NULL DEFAULT 'ingredient',
  ADD COLUMN storehouse_id uuid REFERENCES public.storehouses(id) ON DELETE SET NULL,
  ADD COLUMN price numeric,
  ADD COLUMN currency public.currency_code NOT NULL DEFAULT 'VND',
  ADD COLUMN updated_by uuid;

-- 5. Enforce unique code (case-insensitive) when present — code is now the user-facing ID
CREATE UNIQUE INDEX ingredients_code_unique_ci
  ON public.ingredients (LOWER(code))
  WHERE code IS NOT NULL;

-- 6. Trigger to set updated_by on update
CREATE OR REPLACE FUNCTION public.set_updated_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ingredients_updated_by
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();

CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();