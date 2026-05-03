
CREATE TABLE IF NOT EXISTS public.inventory_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  branch_id uuid,
  control_list_id uuid,
  item_code text,
  item_name text NOT NULL,
  stock numeric,
  min_stock numeric,
  recommended_order numeric,
  order_qty numeric,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_records_date ON public.inventory_records(date);
CREATE INDEX IF NOT EXISTS idx_inventory_records_branch ON public.inventory_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_records_control_list ON public.inventory_records(control_list_id);
CREATE INDEX IF NOT EXISTS idx_inventory_records_item_code ON public.inventory_records(item_code);

ALTER TABLE public.inventory_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/managers read all inventory records"
ON public.inventory_records FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Users read own inventory records"
ON public.inventory_records FOR SELECT TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "Authenticated insert inventory records"
ON public.inventory_records FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners delete inventory records"
ON public.inventory_records FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role));
