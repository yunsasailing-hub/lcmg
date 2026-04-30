CREATE TYPE public.inventory_control_source AS ENUM ('ingredient', 'manual');

CREATE TABLE public.inventory_control_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE SET NULL,
  item_code text,
  item_name text NOT NULL,
  unit text,
  source_type public.inventory_control_source NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  department public.department,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_control_items_active ON public.inventory_control_items(is_active);
CREATE INDEX idx_inventory_control_items_branch_dept ON public.inventory_control_items(branch_id, department);
CREATE UNIQUE INDEX uq_inventory_control_items_ingredient ON public.inventory_control_items(ingredient_id) WHERE ingredient_id IS NOT NULL;

CREATE TRIGGER trg_inventory_control_items_updated_at BEFORE UPDATE ON public.inventory_control_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.inventory_control_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read inventory control items"
  ON public.inventory_control_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Owners/managers insert inventory control items"
  ON public.inventory_control_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers update inventory control items"
  ON public.inventory_control_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners delete inventory control items"
  ON public.inventory_control_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));