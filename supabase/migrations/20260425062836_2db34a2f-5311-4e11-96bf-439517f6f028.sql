CREATE TABLE IF NOT EXISTS public.checklist_instance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.checklist_instances(id) ON DELETE CASCADE,
  template_task_id uuid REFERENCES public.checklist_template_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  instruction text,
  sort_order integer NOT NULL DEFAULT 0,
  photo_required boolean NOT NULL DEFAULT false,
  note_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (instance_id, template_task_id)
);

ALTER TABLE public.checklist_instance_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read assigned checklist tasks"
ON public.checklist_instance_tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.checklist_instances ci
    WHERE ci.id = checklist_instance_tasks.instance_id
      AND (
        ci.assigned_to = auth.uid()
        OR ci.department = public.current_user_department()
        OR public.has_role(auth.uid(), 'owner'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role)
      )
  )
);

CREATE POLICY "Owners and managers can insert assigned checklist tasks"
ON public.checklist_instance_tasks
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners and managers can update assigned checklist tasks"
ON public.checklist_instance_tasks
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners and managers can delete assigned checklist tasks"
ON public.checklist_instance_tasks
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE INDEX IF NOT EXISTS idx_checklist_instance_tasks_instance_id
ON public.checklist_instance_tasks(instance_id);

CREATE INDEX IF NOT EXISTS idx_checklist_instance_tasks_template_task_id
ON public.checklist_instance_tasks(template_task_id);

CREATE TRIGGER update_checklist_instance_tasks_updated_at
BEFORE UPDATE ON public.checklist_instance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.checklist_instance_tasks (
  instance_id,
  template_task_id,
  title,
  instruction,
  sort_order,
  photo_required,
  note_required,
  is_active
)
SELECT
  ci.id,
  ctt.id,
  split_part(ctt.title, E'\n', 1),
  NULLIF(array_to_string((string_to_array(ctt.title, E'\n'))[2:array_length(string_to_array(ctt.title, E'\n'), 1)], E'\n'), ''),
  ctt.sort_order,
  ctt.photo_requirement = 'mandatory'::photo_requirement,
  ctt.note_requirement = 'mandatory'::note_requirement,
  ctt.is_active
FROM public.checklist_instances ci
JOIN public.checklist_template_tasks ctt ON ctt.template_id = ci.template_id
ON CONFLICT (instance_id, template_task_id) DO UPDATE SET
  title = EXCLUDED.title,
  instruction = EXCLUDED.instruction,
  sort_order = EXCLUDED.sort_order,
  photo_required = EXCLUDED.photo_required,
  note_required = EXCLUDED.note_required,
  is_active = EXCLUDED.is_active;

CREATE OR REPLACE FUNCTION public.create_checklist_instance_tasks(_instance_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _template_id uuid;
BEGIN
  SELECT template_id INTO _template_id
  FROM public.checklist_instances
  WHERE id = _instance_id;

  IF _template_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.checklist_instance_tasks (
    instance_id,
    template_task_id,
    title,
    instruction,
    sort_order,
    photo_required,
    note_required,
    is_active
  )
  SELECT
    _instance_id,
    ctt.id,
    split_part(ctt.title, E'\n', 1),
    NULLIF(array_to_string((string_to_array(ctt.title, E'\n'))[2:array_length(string_to_array(ctt.title, E'\n'), 1)], E'\n'), ''),
    ctt.sort_order,
    ctt.photo_requirement = 'mandatory'::photo_requirement,
    ctt.note_requirement = 'mandatory'::note_requirement,
    ctt.is_active
  FROM public.checklist_template_tasks ctt
  WHERE ctt.template_id = _template_id
  ON CONFLICT (instance_id, template_task_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_checklist_instance_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.create_checklist_instance_tasks(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_checklist_instance_tasks_after_insert ON public.checklist_instances;
CREATE TRIGGER create_checklist_instance_tasks_after_insert
AFTER INSERT ON public.checklist_instances
FOR EACH ROW
EXECUTE FUNCTION public.handle_checklist_instance_tasks();