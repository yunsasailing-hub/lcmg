-- Part 1: Add show_in_kitchen_production to recipes
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS show_in_kitchen_production boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recipes_show_in_kitchen_production
  ON public.recipes (show_in_kitchen_production)
  WHERE show_in_kitchen_production = true;

-- Part 2: Kitchen production logs
CREATE TABLE IF NOT EXISTS public.kitchen_production_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_date date NOT NULL DEFAULT CURRENT_DATE,
  branch_id uuid,
  department public.department,
  item_code text NOT NULL,
  item_name text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('MENU_ITEM', 'BATCH_RECIPE')),
  linked_recipe_id uuid,
  linked_recipe_code text,
  quantity_produced numeric NOT NULL CHECK (quantity_produced > 0),
  unit text,
  staff_user_id uuid,
  staff_name text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpl_production_date ON public.kitchen_production_logs (production_date DESC);
CREATE INDEX IF NOT EXISTS idx_kpl_branch ON public.kitchen_production_logs (branch_id);
CREATE INDEX IF NOT EXISTS idx_kpl_department ON public.kitchen_production_logs (department);
CREATE INDEX IF NOT EXISTS idx_kpl_item_code ON public.kitchen_production_logs (item_code);
CREATE INDEX IF NOT EXISTS idx_kpl_created_by ON public.kitchen_production_logs (created_by);

-- Trigger: auto-set item_type from item_code prefix
CREATE OR REPLACE FUNCTION public.kitchen_production_set_item_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.item_code IS NULL OR length(NEW.item_code) < 4 THEN
    RAISE EXCEPTION 'item_code is required and must be at least 4 characters';
  END IF;

  IF left(NEW.item_code, 4) = '1013' THEN
    NEW.item_type := 'MENU_ITEM';
  ELSIF left(NEW.item_code, 4) = '1012' THEN
    NEW.item_type := 'BATCH_RECIPE';
  ELSE
    RAISE EXCEPTION 'item_code must start with 1012 (BATCH_RECIPE) or 1013 (MENU_ITEM)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpl_set_item_type ON public.kitchen_production_logs;
CREATE TRIGGER trg_kpl_set_item_type
  BEFORE INSERT OR UPDATE OF item_code ON public.kitchen_production_logs
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_production_set_item_type();

-- Trigger: updated_at
DROP TRIGGER IF EXISTS trg_kpl_updated_at ON public.kitchen_production_logs;
CREATE TRIGGER trg_kpl_updated_at
  BEFORE UPDATE ON public.kitchen_production_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.kitchen_production_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: owner/manager all; staff only own
CREATE POLICY "Owners/managers read all production logs"
  ON public.kitchen_production_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff read own production logs"
  ON public.kitchen_production_logs
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- INSERT: any authenticated may insert their own row (created_by must be self)
CREATE POLICY "Authenticated insert own production logs"
  ON public.kitchen_production_logs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- UPDATE: owner/manager only
CREATE POLICY "Owners/managers update production logs"
  ON public.kitchen_production_logs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

-- DELETE: owner/manager only
CREATE POLICY "Owners/managers delete production logs"
  ON public.kitchen_production_logs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));