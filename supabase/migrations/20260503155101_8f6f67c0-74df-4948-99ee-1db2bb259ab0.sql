-- 1. New columns on maintenance_repairs
ALTER TABLE public.maintenance_repairs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'Direct',
  ADD COLUMN IF NOT EXISTS source_work_to_be_done_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS department public.department,
  ADD COLUMN IF NOT EXISTS area_or_equipment text;

-- 2. asset_id can now be NULL for asset-less interventions
ALTER TABLE public.maintenance_repairs
  ALTER COLUMN asset_id DROP NOT NULL;

-- 3. Duplicate protection: one repair per WTBD job
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_repairs_source_wtbd_uidx
  ON public.maintenance_repairs (source_work_to_be_done_id)
  WHERE source_work_to_be_done_id IS NOT NULL;

-- 4. Expand manager/staff RLS to also cover asset-less rows by repairs.branch_id
DROP POLICY IF EXISTS "Managers read branch repairs" ON public.maintenance_repairs;
DROP POLICY IF EXISTS "Managers insert branch repairs" ON public.maintenance_repairs;
DROP POLICY IF EXISTS "Managers update branch repairs" ON public.maintenance_repairs;

CREATE POLICY "Managers read branch repairs"
ON public.maintenance_repairs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) AND (
    EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_repairs.asset_id
        AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
    OR (
      maintenance_repairs.asset_id IS NULL
      AND maintenance_repairs.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  )
);

CREATE POLICY "Managers insert branch repairs"
ON public.maintenance_repairs
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) AND (
    EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_repairs.asset_id
        AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
    OR (
      maintenance_repairs.asset_id IS NULL
      AND maintenance_repairs.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  )
);

CREATE POLICY "Managers update branch repairs"
ON public.maintenance_repairs
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) AND (
    EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_repairs.asset_id
        AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
    OR (
      maintenance_repairs.asset_id IS NULL
      AND maintenance_repairs.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) AND (
    EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_repairs.asset_id
        AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
    OR (
      maintenance_repairs.asset_id IS NULL
      AND maintenance_repairs.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  )
);