
-- 1) New header table: inventory_control_lists
CREATE TABLE IF NOT EXISTS public.inventory_control_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  department public.department NOT NULL,
  control_list_code text NOT NULL,
  control_list_name text NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_control_lists_branch_code_unique UNIQUE (branch_id, control_list_code)
);

CREATE INDEX IF NOT EXISTS idx_inv_control_lists_branch_dept
  ON public.inventory_control_lists (branch_id, department);

ALTER TABLE public.inventory_control_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read inventory control lists"
  ON public.inventory_control_lists FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers insert inventory control lists"
  ON public.inventory_control_lists FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers update inventory control lists"
  ON public.inventory_control_lists FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners delete inventory control lists"
  ON public.inventory_control_lists FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE TRIGGER trg_inv_control_lists_updated_at
  BEFORE UPDATE ON public.inventory_control_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add control_list_id to inventory_control_items
ALTER TABLE public.inventory_control_items
  ADD COLUMN IF NOT EXISTS control_list_id uuid REFERENCES public.inventory_control_lists(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_inv_control_items_list ON public.inventory_control_items (control_list_id);

-- 3) Backfill: create a "Default" list per (branch_id, department) found in existing items
INSERT INTO public.inventory_control_lists (branch_id, department, control_list_code, control_list_name, notes)
SELECT DISTINCT
  i.branch_id,
  i.department,
  'AUTO-' || upper(i.department::text) AS control_list_code,
  'Default ' || initcap(i.department::text) AS control_list_name,
  'Auto-created from legacy items'
FROM public.inventory_control_items i
WHERE i.branch_id IS NOT NULL
  AND i.department IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_control_lists l
    WHERE l.branch_id = i.branch_id
      AND l.control_list_code = 'AUTO-' || upper(i.department::text)
  );

-- Link existing items to the matching auto list
UPDATE public.inventory_control_items i
SET control_list_id = l.id
FROM public.inventory_control_lists l
WHERE i.control_list_id IS NULL
  AND i.branch_id = l.branch_id
  AND i.department = l.department
  AND l.control_list_code = 'AUTO-' || upper(i.department::text);

-- 4) Add control_list_id to inventory_request_items (for review reporting)
ALTER TABLE public.inventory_request_items
  ADD COLUMN IF NOT EXISTS control_list_id uuid REFERENCES public.inventory_control_lists(id) ON DELETE SET NULL;

UPDATE public.inventory_request_items ri
SET control_list_id = ci.control_list_id
FROM public.inventory_control_items ci
WHERE ri.control_list_id IS NULL
  AND ri.inventory_control_item_id = ci.id;

-- 5) Duplicate-prevention trigger: same branch can't have same item_code active across multiple lists
CREATE OR REPLACE FUNCTION public.enforce_inventory_control_item_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_conflict_id uuid;
BEGIN
  IF NEW.item_code IS NULL OR btrim(NEW.item_code) = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.source_type IS DISTINCT FROM 'ingredient' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.control_list_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch_id INTO v_branch_id FROM public.inventory_control_lists WHERE id = NEW.control_list_id;
  IF v_branch_id IS NULL THEN RETURN NEW; END IF;

  SELECT i.id INTO v_conflict_id
  FROM public.inventory_control_items i
  JOIN public.inventory_control_lists l ON l.id = i.control_list_id
  WHERE i.id <> NEW.id
    AND i.is_active = true
    AND i.source_type = 'ingredient'
    AND lower(btrim(i.item_code)) = lower(btrim(NEW.item_code))
    AND l.branch_id = v_branch_id
    AND i.control_list_id <> NEW.control_list_id
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'This item already exists in another active Control List for this branch.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_inv_control_item_unique_code ON public.inventory_control_items;
CREATE TRIGGER trg_enforce_inv_control_item_unique_code
  BEFORE INSERT OR UPDATE ON public.inventory_control_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_control_item_unique_code();
