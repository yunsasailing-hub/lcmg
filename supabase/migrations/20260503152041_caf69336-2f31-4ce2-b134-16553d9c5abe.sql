-- Enums
CREATE TYPE public.wtbd_priority AS ENUM ('Low','Medium','High','Urgent');
CREATE TYPE public.wtbd_status AS ENUM ('Open','Postponed','In Progress','Completed','Cancelled');
CREATE TYPE public.wtbd_target_occasion AS ENUM (
  'Next technician visit',
  'Next quiet day',
  'Next renovation',
  'Before inspection',
  'Waiting for spare parts',
  'Waiting for supplier',
  'No fixed date',
  'Other'
);

CREATE TABLE public.maintenance_work_to_be_done (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  branch_id uuid NOT NULL,
  department public.department NOT NULL,
  area_or_equipment text,
  priority public.wtbd_priority NOT NULL DEFAULT 'Medium',
  status public.wtbd_status NOT NULL DEFAULT 'Open',
  target_occasion public.wtbd_target_occasion NOT NULL DEFAULT 'No fixed date',
  due_date date,
  assigned_to uuid,
  photos text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  final_note text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wtbd_branch ON public.maintenance_work_to_be_done(branch_id);
CREATE INDEX idx_wtbd_department ON public.maintenance_work_to_be_done(department);
CREATE INDEX idx_wtbd_status ON public.maintenance_work_to_be_done(status);
CREATE INDEX idx_wtbd_assigned ON public.maintenance_work_to_be_done(assigned_to);

CREATE TRIGGER trg_wtbd_updated_at
BEFORE UPDATE ON public.maintenance_work_to_be_done
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.maintenance_work_to_be_done ENABLE ROW LEVEL SECURITY;

-- Owners: full access
CREATE POLICY "Owners read wtbd" ON public.maintenance_work_to_be_done
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Owners insert wtbd" ON public.maintenance_work_to_be_done
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Owners update wtbd" ON public.maintenance_work_to_be_done
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "Owners delete wtbd" ON public.maintenance_work_to_be_done
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'::app_role));

-- Managers: scoped to their branch
CREATE POLICY "Managers read branch wtbd" ON public.maintenance_work_to_be_done
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  );
CREATE POLICY "Managers insert branch wtbd" ON public.maintenance_work_to_be_done
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  );
CREATE POLICY "Managers update branch wtbd" ON public.maintenance_work_to_be_done
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  ) WITH CHECK (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
  );

-- Staff: read assigned-to-self, OR same branch+department
CREATE POLICY "Staff read scoped wtbd" ON public.maintenance_work_to_be_done
  FOR SELECT TO authenticated USING (
    assigned_to = auth.uid()
    OR (
      department = public.current_user_department()
      AND branch_id IN (SELECT p.branch_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.branch_id IS NOT NULL)
    )
  );

-- Staff: update only when assigned to them and not completed/cancelled
CREATE POLICY "Staff update assigned wtbd" ON public.maintenance_work_to_be_done
  FOR UPDATE TO authenticated USING (
    assigned_to = auth.uid()
    AND status NOT IN ('Completed','Cancelled')
  ) WITH CHECK (
    assigned_to = auth.uid()
  );
