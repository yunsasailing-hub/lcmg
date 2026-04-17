-- 1. Add manually_locked column
ALTER TABLE public.checklist_instances
ADD COLUMN IF NOT EXISTS manually_locked boolean NOT NULL DEFAULT false;

-- 2. Recreate staff UPDATE policy: allow editing while not completed and not manually locked
DROP POLICY IF EXISTS "Staff can update assigned or department instances" ON public.checklist_instances;
CREATE POLICY "Staff can update assigned or department instances"
ON public.checklist_instances
FOR UPDATE
TO authenticated
USING (
  status <> 'completed'::checklist_status
  AND status <> 'verified'::checklist_status
  AND manually_locked = false
  AND (
    assigned_to = auth.uid()
    OR (assigned_to IS NULL AND department = public.current_user_department())
    OR department = public.current_user_department()
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
)
WITH CHECK (
  assigned_to = auth.uid()
  OR (assigned_to IS NULL AND department = public.current_user_department())
  OR department = public.current_user_department()
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 3. Recreate staff completion INSERT/UPDATE policies to honor lock + status
DROP POLICY IF EXISTS "Staff can insert own or department completions" ON public.checklist_task_completions;
CREATE POLICY "Staff can insert own or department completions"
ON public.checklist_task_completions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.checklist_instances ci
    WHERE ci.id = checklist_task_completions.instance_id
      AND ci.status <> 'completed'::checklist_status
      AND ci.status <> 'verified'::checklist_status
      AND ci.manually_locked = false
      AND (
        ci.assigned_to = auth.uid()
        OR ci.department = public.current_user_department()
      )
  )
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

DROP POLICY IF EXISTS "Staff can update own or department completions" ON public.checklist_task_completions;
CREATE POLICY "Staff can update own or department completions"
ON public.checklist_task_completions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.checklist_instances ci
    WHERE ci.id = checklist_task_completions.instance_id
      AND ci.status <> 'completed'::checklist_status
      AND ci.status <> 'verified'::checklist_status
      AND ci.manually_locked = false
      AND (
        ci.assigned_to = auth.uid()
        OR ci.department = public.current_user_department()
      )
  )
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 4. Backfill: ensure all existing rows have manually_locked = false (column default already covers, but explicit)
UPDATE public.checklist_instances
SET manually_locked = false
WHERE manually_locked IS NULL;