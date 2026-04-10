-- Allow only owners to delete checklist instance records
CREATE POLICY "Owners can delete instances"
ON public.checklist_instances
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role));