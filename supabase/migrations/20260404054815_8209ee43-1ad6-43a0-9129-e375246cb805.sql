
-- Fix security definer view by recreating with security_invoker
DROP VIEW IF EXISTS public.team_directory;
CREATE VIEW public.team_directory WITH (security_invoker = true) AS
SELECT id, user_id, full_name, position, department, branch_id, avatar_url, is_active
FROM public.profiles
WHERE is_active = true;

-- Add explicit restrictive policy on user_roles to satisfy linter
-- No one can read directly; has_role() bypasses RLS via SECURITY DEFINER
CREATE POLICY "No direct access to user_roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (false);
