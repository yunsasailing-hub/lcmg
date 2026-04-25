-- Allow owners and managers to read all checklist templates including archived (is_active = false).
-- Existing policy "Authenticated can read active templates" only exposes active ones.
-- This additional permissive policy lets management see archived templates so they can restore them.

CREATE POLICY "Owners and managers can read all templates"
ON public.checklist_templates
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

-- Allow owners/managers to read template tasks even for archived templates.
-- The existing "Authenticated can read template tasks" policy already returns true,
-- so no change is needed there. Documenting only.