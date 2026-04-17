-- Add DELETE RLS policies for checklist_templates and related tables
CREATE POLICY "Owners and managers can delete templates"
ON public.checklist_templates
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Allow deletion of task completions (needed when cascading instance deletion)
CREATE POLICY "Owners can delete task completions"
ON public.checklist_task_completions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Safe delete function: removes template + child tasks + assignments + instances + completions in one transaction
CREATE OR REPLACE FUNCTION public.delete_checklist_template(_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _instance_count int;
  _assignment_count int;
  _task_count int;
BEGIN
  -- Authorization: only owner or manager
  IF NOT (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied', 'message', 'Only owners or managers can delete templates');
  END IF;

  -- Verify template exists
  IF NOT EXISTS (SELECT 1 FROM public.checklist_templates WHERE id = _template_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'Template not found');
  END IF;

  -- Delete task completions for instances of this template
  DELETE FROM public.checklist_task_completions
  WHERE instance_id IN (SELECT id FROM public.checklist_instances WHERE template_id = _template_id);

  -- Delete instances of this template
  DELETE FROM public.checklist_instances WHERE template_id = _template_id;
  GET DIAGNOSTICS _instance_count = ROW_COUNT;

  -- Delete assignments for this template
  DELETE FROM public.checklist_assignments WHERE template_id = _template_id;
  GET DIAGNOSTICS _assignment_count = ROW_COUNT;

  -- Delete child template tasks
  DELETE FROM public.checklist_template_tasks WHERE template_id = _template_id;
  GET DIAGNOSTICS _task_count = ROW_COUNT;

  -- Finally delete the template
  DELETE FROM public.checklist_templates WHERE id = _template_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_template_id', _template_id,
    'deleted_instances', _instance_count,
    'deleted_assignments', _assignment_count,
    'deleted_tasks', _task_count
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_checklist_template(uuid) TO authenticated;