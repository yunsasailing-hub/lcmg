ALTER TABLE public.inventory_control_items
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS min_stock numeric,
  ADD COLUMN IF NOT EXISTS recommended_order numeric;