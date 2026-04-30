-- Inventory: manual purchase requests (header + lines)
-- Status enum
CREATE TYPE public.inventory_request_status AS ENUM ('Draft', 'Submitted', 'Owner Confirmed', 'Rejected');

-- Header table
CREATE TABLE public.inventory_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT,
  department public.department NOT NULL,
  status public.inventory_request_status NOT NULL DEFAULT 'Draft',
  staff_user_id uuid,
  staff_name text,
  notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Line items
CREATE TABLE public.inventory_request_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.inventory_requests(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE SET NULL,
  item_code text,
  item_name text NOT NULL,
  unit text,
  actual_stock numeric,
  requested_qty numeric,
  approved_qty numeric,
  note text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_requests_status ON public.inventory_requests(status);
CREATE INDEX idx_inventory_requests_date ON public.inventory_requests(request_date DESC);
CREATE INDEX idx_inventory_request_items_request_id ON public.inventory_request_items(request_id);

-- Updated_at triggers
CREATE TRIGGER trg_inventory_requests_updated_at BEFORE UPDATE ON public.inventory_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_inventory_request_items_updated_at BEFORE UPDATE ON public.inventory_request_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.inventory_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_request_items ENABLE ROW LEVEL SECURITY;

-- Policies: requests
-- Owners and managers can read all; staff can read what they created
CREATE POLICY "Owners/managers read all inventory requests"
  ON public.inventory_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff read own inventory requests"
  ON public.inventory_requests FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR staff_user_id = auth.uid());

-- Staff and managers can create
CREATE POLICY "Staff/managers insert inventory requests"
  ON public.inventory_requests FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Creators can update their own drafts; managers/owners can update any
CREATE POLICY "Creators update own draft requests"
  ON public.inventory_requests FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status IN ('Draft','Submitted'))
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners/managers update any inventory request"
  ON public.inventory_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

-- Owners can delete
CREATE POLICY "Owners delete inventory requests"
  ON public.inventory_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

-- Policies: items (mirror parent)
CREATE POLICY "Read items via parent visibility"
  ON public.inventory_request_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_requests r
    WHERE r.id = inventory_request_items.request_id
      AND (
        public.has_role(auth.uid(),'owner'::app_role)
        OR public.has_role(auth.uid(),'manager'::app_role)
        OR r.created_by = auth.uid()
        OR r.staff_user_id = auth.uid()
      )
  ));

CREATE POLICY "Insert items when request is editable"
  ON public.inventory_request_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_requests r
    WHERE r.id = inventory_request_items.request_id
      AND (
        public.has_role(auth.uid(),'owner'::app_role)
        OR public.has_role(auth.uid(),'manager'::app_role)
        OR (r.created_by = auth.uid() AND r.status IN ('Draft','Submitted'))
      )
  ));

CREATE POLICY "Update items when request is editable"
  ON public.inventory_request_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_requests r
    WHERE r.id = inventory_request_items.request_id
      AND (
        public.has_role(auth.uid(),'owner'::app_role)
        OR public.has_role(auth.uid(),'manager'::app_role)
        OR (r.created_by = auth.uid() AND r.status IN ('Draft','Submitted'))
      )
  ));

CREATE POLICY "Delete items when request is editable"
  ON public.inventory_request_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_requests r
    WHERE r.id = inventory_request_items.request_id
      AND (
        public.has_role(auth.uid(),'owner'::app_role)
        OR public.has_role(auth.uid(),'manager'::app_role)
        OR (r.created_by = auth.uid() AND r.status IN ('Draft','Submitted'))
      )
  ));