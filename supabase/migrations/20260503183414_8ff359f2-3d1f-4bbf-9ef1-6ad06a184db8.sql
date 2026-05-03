DROP POLICY IF EXISTS "Authenticated read inventory control lists" ON public.inventory_control_lists;
DROP POLICY IF EXISTS "Owners/managers insert inventory control lists" ON public.inventory_control_lists;
DROP POLICY IF EXISTS "Owners/managers update inventory control lists" ON public.inventory_control_lists;
DROP POLICY IF EXISTS "Owners delete inventory control lists" ON public.inventory_control_lists;

CREATE POLICY "Authenticated can read inventory control lists"
ON public.inventory_control_lists
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Owners administrators managers can create inventory control lists"
ON public.inventory_control_lists
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'administrator'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Owners administrators managers can update inventory control lists"
ON public.inventory_control_lists
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'administrator'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'administrator'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Owners administrators can delete inventory control lists"
ON public.inventory_control_lists
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'administrator'::public.app_role)
);