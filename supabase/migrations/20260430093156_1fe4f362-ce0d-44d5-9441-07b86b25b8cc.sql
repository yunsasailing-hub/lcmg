-- =========================================================
-- Maintenance module — Phase 1
-- =========================================================

-- Status enum
DO $$ BEGIN
  CREATE TYPE public.maintenance_asset_status AS ENUM ('active', 'inactive', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- Asset Types lookup
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_asset_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_vi text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_asset_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read maintenance asset types"
  ON public.maintenance_asset_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers insert maintenance asset types"
  ON public.maintenance_asset_types FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "Owners/managers update maintenance asset types"
  ON public.maintenance_asset_types FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "Owners/managers delete maintenance asset types"
  ON public.maintenance_asset_types FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER trg_maintenance_asset_types_updated_at
  BEFORE UPDATE ON public.maintenance_asset_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default types
INSERT INTO public.maintenance_asset_types (code, name_en, name_vi, sort_order) VALUES
  ('machine',            'Machine',              'Máy móc',                10),
  ('equipment',          'Equipment',            'Thiết bị',               20),
  ('room_area',          'Room / Area',          'Phòng / Khu vực',        30),
  ('filter',             'Filter',               'Bộ lọc',                 40),
  ('electrical',         'Electrical',           'Hệ thống điện',          50),
  ('plumbing',           'Plumbing',             'Hệ thống nước',          60),
  ('air_conditioning',   'Air Conditioning',     'Điều hòa không khí',     70),
  ('refrigeration',      'Refrigeration',        'Hệ thống làm lạnh',      80),
  ('building_structure', 'Building / Structure', 'Kết cấu công trình',     90),
  ('other',              'Other',                'Khác',                  100)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------
-- Maintenance Assets
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  branch_id uuid NOT NULL,
  department public.department NOT NULL,
  asset_type_id uuid NOT NULL REFERENCES public.maintenance_asset_types(id) ON DELETE RESTRICT,
  status public.maintenance_asset_status NOT NULL DEFAULT 'active',
  location text,
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  installation_date date,
  warranty_expiry_date date,
  supplier_vendor text,
  technician_contact text,
  notes text,
  photo_url text,
  photo_storage_path text,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_assets_branch ON public.maintenance_assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_assets_department ON public.maintenance_assets(department);
CREATE INDEX IF NOT EXISTS idx_maintenance_assets_type ON public.maintenance_assets(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_assets_status ON public.maintenance_assets(status);

ALTER TABLE public.maintenance_assets ENABLE ROW LEVEL SECURITY;

-- Owner: full access on every branch
CREATE POLICY "Owners read all maintenance assets"
  ON public.maintenance_assets FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'owner'::app_role));

CREATE POLICY "Owners insert maintenance assets"
  ON public.maintenance_assets FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'owner'::app_role));

CREATE POLICY "Owners update maintenance assets"
  ON public.maintenance_assets FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'owner'::app_role))
  WITH CHECK (has_role(auth.uid(),'owner'::app_role));

CREATE POLICY "Owners delete maintenance assets"
  ON public.maintenance_assets FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'owner'::app_role));

-- Manager: scoped to their assigned branch
CREATE POLICY "Managers read branch maintenance assets"
  ON public.maintenance_assets FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'manager'::app_role)
    AND branch_id IN (SELECT branch_id FROM public.profiles WHERE user_id = auth.uid() AND branch_id IS NOT NULL)
  );

CREATE POLICY "Managers insert branch maintenance assets"
  ON public.maintenance_assets FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'manager'::app_role)
    AND branch_id IN (SELECT branch_id FROM public.profiles WHERE user_id = auth.uid() AND branch_id IS NOT NULL)
  );

CREATE POLICY "Managers update branch maintenance assets"
  ON public.maintenance_assets FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'manager'::app_role)
    AND branch_id IN (SELECT branch_id FROM public.profiles WHERE user_id = auth.uid() AND branch_id IS NOT NULL)
  )
  WITH CHECK (
    has_role(auth.uid(),'manager'::app_role)
    AND branch_id IN (SELECT branch_id FROM public.profiles WHERE user_id = auth.uid() AND branch_id IS NOT NULL)
  );

-- Staff: read-only, branch-scoped, active assets only
CREATE POLICY "Staff read branch active maintenance assets"
  ON public.maintenance_assets FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND branch_id IN (SELECT branch_id FROM public.profiles WHERE user_id = auth.uid() AND branch_id IS NOT NULL)
  );

CREATE TRIGGER trg_maintenance_assets_updated_at
  BEFORE UPDATE ON public.maintenance_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_maintenance_assets_set_updated_by
  BEFORE UPDATE ON public.maintenance_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();
