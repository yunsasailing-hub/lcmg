-- 1) checklist_instances: make template_id nullable, change FK to SET NULL
ALTER TABLE public.checklist_instances ALTER COLUMN template_id DROP NOT NULL;

ALTER TABLE public.checklist_instances
  DROP CONSTRAINT checklist_instances_template_id_fkey,
  ADD CONSTRAINT checklist_instances_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.checklist_templates(id) ON DELETE SET NULL;

-- 2) checklist_assignments: make template_id nullable, change FK to SET NULL
ALTER TABLE public.checklist_assignments ALTER COLUMN template_id DROP NOT NULL;

ALTER TABLE public.checklist_assignments
  DROP CONSTRAINT checklist_assignments_template_id_fkey,
  ADD CONSTRAINT checklist_assignments_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.checklist_templates(id) ON DELETE SET NULL;

-- 3) End all active assignments when their template is deleted (handled via trigger)
CREATE OR REPLACE FUNCTION public.end_assignments_on_template_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.checklist_assignments
  SET status = 'ended', updated_at = now()
  WHERE template_id IS NULL AND status IN ('active', 'paused');
  RETURN NULL;
END;
$$;

-- Fire after SET NULL has taken effect
CREATE TRIGGER trg_end_assignments_after_template_delete
  AFTER DELETE ON public.checklist_templates
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.end_assignments_on_template_delete();