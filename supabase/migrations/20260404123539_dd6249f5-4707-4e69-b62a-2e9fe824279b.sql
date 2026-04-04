-- Allow staff to update their own assigned checklist instances (for submission)
CREATE POLICY "Staff can update own instances"
ON public.checklist_instances
FOR UPDATE
TO authenticated
USING (assigned_to = auth.uid())
WITH CHECK (assigned_to = auth.uid());
