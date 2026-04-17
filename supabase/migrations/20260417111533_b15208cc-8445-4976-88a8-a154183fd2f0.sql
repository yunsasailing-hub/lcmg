-- Helper: get current user's department from profiles
CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS public.department
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- ─── checklist_instances ───
DROP POLICY IF EXISTS "Staff can update own instances" ON public.checklist_instances;
CREATE POLICY "Staff can update assigned or department instances"
ON public.checklist_instances
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid()
  OR (assigned_to IS NULL AND department = public.current_user_department())
  OR department = public.current_user_department()
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  assigned_to = auth.uid()
  OR (assigned_to IS NULL AND department = public.current_user_department())
  OR department = public.current_user_department()
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

DROP POLICY IF EXISTS "Staff can read own instances" ON public.checklist_instances;
CREATE POLICY "Staff can read assigned or department instances"
ON public.checklist_instances
FOR SELECT
TO authenticated
USING (
  assigned_to = auth.uid()
  OR department = public.current_user_department()
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- ─── checklist_task_completions ───
DROP POLICY IF EXISTS "Staff can insert own completions" ON public.checklist_task_completions;
CREATE POLICY "Staff can insert own or department completions"
ON public.checklist_task_completions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.checklist_instances ci
    WHERE ci.id = checklist_task_completions.instance_id
      AND (
        ci.assigned_to = auth.uid()
        OR ci.department = public.current_user_department()
      )
  )
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

DROP POLICY IF EXISTS "Staff can update own completions" ON public.checklist_task_completions;
CREATE POLICY "Staff can update own or department completions"
ON public.checklist_task_completions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.checklist_instances ci
    WHERE ci.id = checklist_task_completions.instance_id
      AND (
        ci.assigned_to = auth.uid()
        OR ci.department = public.current_user_department()
      )
  )
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

DROP POLICY IF EXISTS "Staff can read own completions" ON public.checklist_task_completions;
CREATE POLICY "Staff can read own or department completions"
ON public.checklist_task_completions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.checklist_instances ci
    WHERE ci.id = checklist_task_completions.instance_id
      AND (
        ci.assigned_to = auth.uid()
        OR ci.department = public.current_user_department()
      )
  )
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);