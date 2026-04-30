ALTER TABLE public.inventory_request_items
  ADD COLUMN source_type public.inventory_control_source NOT NULL DEFAULT 'ingredient',
  ADD COLUMN inventory_control_item_id uuid REFERENCES public.inventory_control_items(id) ON DELETE SET NULL;