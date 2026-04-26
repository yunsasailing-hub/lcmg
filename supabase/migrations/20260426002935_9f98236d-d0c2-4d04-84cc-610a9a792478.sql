CREATE OR REPLACE FUNCTION public.delete_checklist_template_task(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _exists boolean;
  _instance_task_count int := 0;
  _completion_count int := 0;
BEGIN
  -- Authorization
  IF NOT (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied',
      'message', 'Only owners or managers can delete template tasks');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.checklist_template_tasks WHERE id = _task_id) INTO _exists;
  IF NOT _exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'Task not found');
  END IF;

  -- Dependency check
  SELECT count(*) INTO _instance_task_count
  FROM public.checklist_instance_tasks WHERE template_task_id = _task_id;

  SELECT count(*) INTO _completion_count
  FROM public.checklist_task_completions WHERE task_id = _task_id;

  IF _instance_task_count = 0 AND _completion_count = 0 THEN
    -- Safe to hard delete
    DELETE FROM public.checklist_template_tasks WHERE id = _task_id;
    RETURN jsonb_build_object('ok', true, 'archived', false,
      'message', 'Task permanently deleted');
  END IF;

  -- Soft delete (archive) — preserve history
  UPDATE public.checklist_template_tasks
  SET is_active = false
  WHERE id = _task_id;

  -- Also mark any linked instance tasks inactive so they hide from active checklists
  UPDATE public.checklist_instance_tasks
  SET is_active = false, updated_at = now()
  WHERE template_task_id = _task_id;

  RETURN jsonb_build_object('ok', true, 'archived', true,
    'instance_task_count', _instance_task_count,
    'completion_count', _completion_count,
    'message', 'Task has history. It was archived instead of permanently deleted.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'message', SQLERRM);
END;
$function$;