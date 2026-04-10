
-- Notification settings singleton table
CREATE TABLE public.notification_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- In-app checklist notifications
  checklist_notices_enabled boolean NOT NULL DEFAULT true,
  checklist_warnings_enabled boolean NOT NULL DEFAULT true,
  notice_delay_hours integer NOT NULL DEFAULT 2,
  warning_delay_hours integer NOT NULL DEFAULT 4,
  -- Future channels (not yet implemented)
  push_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Ensure only one row ever exists
CREATE UNIQUE INDEX notification_settings_singleton ON public.notification_settings ((true));

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read settings
CREATE POLICY "Authenticated can read notification settings"
  ON public.notification_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only owners can update
CREATE POLICY "Owners can update notification settings"
  ON public.notification_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Trigger for updated_at
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the default row
INSERT INTO public.notification_settings (checklist_notices_enabled, checklist_warnings_enabled, notice_delay_hours, warning_delay_hours)
VALUES (true, true, 2, 4);
