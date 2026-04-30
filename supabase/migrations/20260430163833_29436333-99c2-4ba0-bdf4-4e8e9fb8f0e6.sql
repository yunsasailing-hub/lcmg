-- Status enum
DO $$ BEGIN
  CREATE TYPE public.maintenance_task_status AS ENUM ('Pending', 'Done', 'Overdue');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE public.maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  schedule_template_id uuid NOT NULL,
  title text NOT NULL,
  due_date date NOT NULL,
  due_time time NOT NULL DEFAULT '09:00',
  assigned_staff_id uuid,
  assigned_department public.department,
  status public.maintenance_task_status NOT NULL DEFAULT 'Pending',
  note text,
  photo_url text,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_tasks_unique_per_day UNIQUE (schedule_template_id, due_date)
);

CREATE INDEX idx_maint_tasks_due_date ON public.maintenance_tasks(due_date);
CREATE INDEX idx_maint_tasks_status ON public.maintenance_tasks(status);
CREATE INDEX idx_maint_tasks_asset ON public.maintenance_tasks(asset_id);
CREATE INDEX idx_maint_tasks_staff ON public.maintenance_tasks(assigned_staff_id);

CREATE TRIGGER trg_maint_tasks_updated_at
  BEFORE UPDATE ON public.maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;

-- Owner: full access
CREATE POLICY "Owners read all maintenance tasks"
  ON public.maintenance_tasks FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Owners insert maintenance tasks"
  ON public.maintenance_tasks FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Owners update maintenance tasks"
  ON public.maintenance_tasks FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Owners delete maintenance tasks"
  ON public.maintenance_tasks FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Manager: branch-scoped via asset
CREATE POLICY "Managers read branch maintenance tasks"
  ON public.maintenance_tasks FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_tasks.asset_id
        AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  );
CREATE POLICY "Managers insert branch maintenance tasks"
  ON public.maintenance_tasks FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_tasks.asset_id
        AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  );
CREATE POLICY "Managers update branch maintenance tasks"
  ON public.maintenance_tasks FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_tasks.asset_id
        AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.maintenance_assets a
      WHERE a.id = maintenance_tasks.asset_id
        AND a.branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  );

-- Staff: read tasks assigned to them or their department; update to complete
CREATE POLICY "Staff read own maintenance tasks"
  ON public.maintenance_tasks FOR SELECT TO authenticated
  USING (
    assigned_staff_id = auth.uid()
    OR (assigned_department IS NOT NULL AND assigned_department = current_user_department())
  );
CREATE POLICY "Staff update own maintenance tasks"
  ON public.maintenance_tasks FOR UPDATE TO authenticated
  USING (
    status <> 'Done'
    AND (
      assigned_staff_id = auth.uid()
      OR (assigned_department IS NOT NULL AND assigned_department = current_user_department())
    )
  )
  WITH CHECK (
    assigned_staff_id = auth.uid()
    OR (assigned_department IS NOT NULL AND assigned_department = current_user_department())
  );

-- Anyone authenticated can insert generated tasks (generation runs client-side on Maintenance open).
-- Restrict to insertions matching an active template so it can't be abused.
CREATE POLICY "Authenticated insert tasks from active templates"
  ON public.maintenance_tasks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maintenance_schedule_templates t
      WHERE t.id = maintenance_tasks.schedule_template_id
        AND t.status = 'active'
        AND t.asset_id = maintenance_tasks.asset_id
    )
  );
