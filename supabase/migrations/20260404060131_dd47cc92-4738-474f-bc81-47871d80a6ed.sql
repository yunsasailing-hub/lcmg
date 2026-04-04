
-- Enums
CREATE TYPE public.checklist_type AS ENUM ('opening', 'afternoon', 'closing');
CREATE TYPE public.checklist_status AS ENUM ('pending', 'completed', 'verified', 'rejected');
CREATE TYPE public.photo_requirement AS ENUM ('none', 'optional', 'mandatory');

-- checklist_templates
CREATE TABLE public.checklist_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  checklist_type public.checklist_type NOT NULL,
  department public.department NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  created_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- checklist_template_tasks
CREATE TABLE public.checklist_template_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  photo_requirement public.photo_requirement NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_template_tasks ENABLE ROW LEVEL SECURITY;

-- checklist_instances
CREATE TABLE public.checklist_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id),
  branch_id UUID REFERENCES public.branches(id),
  department public.department NOT NULL,
  checklist_type public.checklist_type NOT NULL,
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assigned_to UUID REFERENCES auth.users(id),
  status public.checklist_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  rejection_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_instances ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_checklist_instances_updated_at
  BEFORE UPDATE ON public.checklist_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- checklist_task_completions
CREATE TABLE public.checklist_task_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES public.checklist_instances(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.checklist_template_tasks(id),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  comment TEXT,
  photo_url TEXT,
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(instance_id, task_id)
);
ALTER TABLE public.checklist_task_completions ENABLE ROW LEVEL SECURITY;

-- Storage bucket for checklist photos
INSERT INTO storage.buckets (id, name, public) VALUES ('checklist-photos', 'checklist-photos', true);

-- =====================
-- RLS POLICIES
-- =====================

-- checklist_templates: authenticated read active, owners/managers insert/update
CREATE POLICY "Authenticated can read active templates"
  ON public.checklist_templates FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Owners/managers can insert templates"
  ON public.checklist_templates FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Owners/managers can update templates"
  ON public.checklist_templates FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
  );

-- checklist_template_tasks: authenticated read, owners/managers insert/update/delete
CREATE POLICY "Authenticated can read template tasks"
  ON public.checklist_template_tasks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Owners/managers can insert template tasks"
  ON public.checklist_template_tasks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Owners/managers can update template tasks"
  ON public.checklist_template_tasks FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Owners/managers can delete template tasks"
  ON public.checklist_template_tasks FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
  );

-- checklist_instances: staff read own, managers/owners read all, managers/owners insert/update
CREATE POLICY "Staff can read own instances"
  ON public.checklist_instances FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Owners/managers can insert instances"
  ON public.checklist_instances FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Owners/managers can update instances"
  ON public.checklist_instances FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
  );

-- checklist_task_completions: staff read/upsert own instance tasks, managers/owners read all
CREATE POLICY "Staff can read own completions"
  ON public.checklist_task_completions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklist_instances ci
      WHERE ci.id = instance_id AND ci.assigned_to = auth.uid()
    )
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Staff can insert own completions"
  ON public.checklist_task_completions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklist_instances ci
      WHERE ci.id = instance_id AND ci.assigned_to = auth.uid()
    )
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Staff can update own completions"
  ON public.checklist_task_completions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklist_instances ci
      WHERE ci.id = instance_id AND ci.assigned_to = auth.uid()
    )
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'manager')
  );

-- Storage policies for checklist-photos
CREATE POLICY "Public can read checklist photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'checklist-photos');

CREATE POLICY "Authenticated can upload checklist photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-photos');
