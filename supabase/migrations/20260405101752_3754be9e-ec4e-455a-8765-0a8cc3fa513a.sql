
-- Create enum for assignment periodicity
CREATE TYPE public.assignment_periodicity AS ENUM ('once', 'daily', 'weekly', 'biweekly', 'monthly');

-- Create enum for assignment status
CREATE TYPE public.assignment_status AS ENUM ('active', 'paused', 'ended');

-- Create the checklist_assignments table
CREATE TABLE public.checklist_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  periodicity public.assignment_periodicity NOT NULL DEFAULT 'once',
  status public.assignment_status NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  last_generated_date DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.checklist_assignments ENABLE ROW LEVEL SECURITY;

-- Owners and managers can do everything
CREATE POLICY "Owners/managers can read assignments"
  ON public.checklist_assignments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owners/managers can insert assignments"
  ON public.checklist_assignments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owners/managers can update assignments"
  ON public.checklist_assignments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owners/managers can delete assignments"
  ON public.checklist_assignments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

-- Staff can see their own assignments
CREATE POLICY "Staff can read own assignments"
  ON public.checklist_assignments FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());
