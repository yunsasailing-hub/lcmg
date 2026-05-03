CREATE TABLE IF NOT EXISTS public.admin_email_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  member_name text,
  old_email text,
  new_email text NOT NULL,
  changed_by_user_id uuid NOT NULL,
  changed_by_name text,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_admin_email_change_log_changed_at
  ON public.admin_email_change_log (changed_at DESC);

ALTER TABLE public.admin_email_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administrators can read email change log"
  ON public.admin_email_change_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "Administrators can insert email change log"
  ON public.admin_email_change_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));