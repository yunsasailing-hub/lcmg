-- Maintenance Schedule Templates
-- Defines recurring maintenance rules linked to equipment/assets.
-- Generation of actual tasks/notifications is intentionally NOT included here.

CREATE TYPE public.maintenance_schedule_frequency AS ENUM (
  'daily',
  'weekly',
  'monthly',
  'every_90_days',
  'custom_interval'
);

CREATE TYPE public.maintenance_schedule_status AS ENUM (
  'active',
  'inactive',
  'archived'
);

CREATE TABLE public.maintenance_schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.maintenance_assets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  frequency public.maintenance_schedule_frequency NOT NULL DEFAULT 'monthly',
  custom_interval_days INTEGER,
  due_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '09:00',
  assigned_staff_id UUID,
  assigned_department public.department,
  note_required BOOLEAN NOT NULL DEFAULT false,
  photo_required BOOLEAN NOT NULL DEFAULT false,
  status public.maintenance_schedule_status NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT mst_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT mst_custom_interval_valid CHECK (
    (frequency = 'custom_interval' AND custom_interval_days IS NOT NULL AND custom_interval_days > 0)
    OR (frequency <> 'custom_interval')
  ),
  CONSTRAINT mst_assignment_required CHECK (
    assigned_staff_id IS NOT NULL OR assigned_department IS NOT NULL
  )
);

CREATE INDEX idx_mst_asset ON public.maintenance_schedule_templates(asset_id);
CREATE INDEX idx_mst_status ON public.maintenance_schedule_templates(status);
CREATE INDEX idx_mst_assigned_staff ON public.maintenance_schedule_templates(assigned_staff_id);
CREATE INDEX idx_mst_assigned_department ON public.maintenance_schedule_templates(assigned_department);

-- Auto-update updated_at
CREATE TRIGGER trg_mst_updated_at
  BEFORE UPDATE ON public.maintenance_schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Set updated_by to current auth user
CREATE TRIGGER trg_mst_updated_by
  BEFORE UPDATE ON public.maintenance_schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();

-- Sync archived_at with status changes
CREATE OR REPLACE FUNCTION public.mst_sync_archived_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'archived' AND (OLD IS NULL OR OLD.status <> 'archived') THEN
    NEW.archived_at := COALESCE(NEW.archived_at, now());
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mst_sync_archived
  BEFORE INSERT OR UPDATE OF status ON public.maintenance_schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.mst_sync_archived_at();

-- RLS — mirror permission model used in maintenance_assets
ALTER TABLE public.maintenance_schedule_templates ENABLE ROW LEVEL SECURITY;

-- Owner: full access
CREATE POLICY "Owners read all maintenance schedules"
  ON public.maintenance_schedule_templates FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners insert maintenance schedules"
  ON public.maintenance_schedule_templates FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners update maintenance schedules"
  ON public.maintenance_schedule_templates FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Owners delete maintenance schedules"
  ON public.maintenance_schedule_templates FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Manager: scoped to assets in their branch
CREATE POLICY "Managers read branch maintenance schedules"
  ON public.maintenance_schedule_templates FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_schedule_templates.asset_id
        AND a.branch_id IN (
          SELECT p.branch_id FROM public.profiles p
          WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL
        )
    )
  );

CREATE POLICY "Managers insert branch maintenance schedules"
  ON public.maintenance_schedule_templates FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_schedule_templates.asset_id
        AND a.branch_id IN (
          SELECT p.branch_id FROM public.profiles p
          WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL
        )
    )
  );

CREATE POLICY "Managers update branch maintenance schedules"
  ON public.maintenance_schedule_templates FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_schedule_templates.asset_id
        AND a.branch_id IN (
          SELECT p.branch_id FROM public.profiles p
          WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL
        )
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_schedule_templates.asset_id
        AND a.branch_id IN (
          SELECT p.branch_id FROM public.profiles p
          WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL
        )
    )
  );

-- Staff: read-only for active schedules of active assets in their branch (so future "my upcoming" lists work)
CREATE POLICY "Staff read branch active maintenance schedules"
  ON public.maintenance_schedule_templates FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_schedule_templates.asset_id
        AND a.status = 'active'
        AND a.branch_id IN (
          SELECT p.branch_id FROM public.profiles p
          WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL
        )
    )
  );