-- Enums for repair log
CREATE TYPE public.maintenance_repair_status AS ENUM ('Reported', 'In Progress', 'Resolved', 'Cancelled');
CREATE TYPE public.maintenance_repair_severity AS ENUM ('Low', 'Medium', 'High', 'Critical');

-- Repair log table
CREATE TABLE public.maintenance_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  -- Core
  title text NOT NULL,
  issue_description text,
  action_taken text,
  status public.maintenance_repair_status NOT NULL DEFAULT 'Reported',
  severity public.maintenance_repair_severity NOT NULL DEFAULT 'Medium',
  reported_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  -- Assignment + technician
  assigned_to uuid,
  technician_name text,
  technician_contact text,
  -- Cost + parts
  cost_amount numeric(12,2),
  currency text NOT NULL DEFAULT 'VND',
  parts_replaced text,
  -- Photos + downtime
  before_photo_url text,
  after_photo_url text,
  downtime_hours numeric(8,2),
  -- Audit
  reported_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_repairs_asset ON public.maintenance_repairs (asset_id);
CREATE INDEX idx_maintenance_repairs_status ON public.maintenance_repairs (status);
CREATE INDEX idx_maintenance_repairs_reported_at ON public.maintenance_repairs (reported_at DESC);

CREATE TRIGGER trg_maintenance_repairs_updated_at
BEFORE UPDATE ON public.maintenance_repairs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.maintenance_repairs ENABLE ROW LEVEL SECURITY;

-- Owner: full access
CREATE POLICY "Owners read all repairs"
ON public.maintenance_repairs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners insert repairs"
ON public.maintenance_repairs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners update repairs"
ON public.maintenance_repairs FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners delete repairs"
ON public.maintenance_repairs FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role));

-- Manager: scoped to their branch (via asset)
CREATE POLICY "Managers read branch repairs"
ON public.maintenance_repairs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
    SELECT 1 FROM public.maintenance_assets a
    WHERE a.id = maintenance_repairs.asset_id
      AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  )
);

CREATE POLICY "Managers insert branch repairs"
ON public.maintenance_repairs FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
    SELECT 1 FROM public.maintenance_assets a
    WHERE a.id = maintenance_repairs.asset_id
      AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  )
);

CREATE POLICY "Managers update branch repairs"
ON public.maintenance_repairs FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
    SELECT 1 FROM public.maintenance_assets a
    WHERE a.id = maintenance_repairs.asset_id
      AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
    SELECT 1 FROM public.maintenance_assets a
    WHERE a.id = maintenance_repairs.asset_id
      AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  )
);

-- Staff: can report (insert) on assets in their branch, and read repairs on assets in their branch
CREATE POLICY "Staff read branch repairs"
ON public.maintenance_repairs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.maintenance_assets a
    WHERE a.id = maintenance_repairs.asset_id
      AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  )
);

CREATE POLICY "Staff report branch repairs"
ON public.maintenance_repairs FOR INSERT TO authenticated
WITH CHECK (
  reported_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.maintenance_assets a
    WHERE a.id = maintenance_repairs.asset_id
      AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  )
);
