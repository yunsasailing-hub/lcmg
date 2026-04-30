-- Restrict maintenance_asset_types management to Owners only
DROP POLICY IF EXISTS "Owners/managers insert maintenance asset types" ON public.maintenance_asset_types;
DROP POLICY IF EXISTS "Owners/managers update maintenance asset types" ON public.maintenance_asset_types;
DROP POLICY IF EXISTS "Owners/managers delete maintenance asset types" ON public.maintenance_asset_types;

CREATE POLICY "Owners insert maintenance asset types"
ON public.maintenance_asset_types FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners update maintenance asset types"
ON public.maintenance_asset_types FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners delete maintenance asset types"
ON public.maintenance_asset_types FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role));

-- Helper function: count assets using a given type (used for delete-guard UX)
CREATE OR REPLACE FUNCTION public.maintenance_asset_type_usage_count(_type_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.maintenance_assets WHERE asset_type_id = _type_id
$$;