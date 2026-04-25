-- Cleanup logic for removed checklist assignments
-- 1) Function to clean a specific assignment's pending instances (called by trigger)
-- 2) Function to clean ALL orphan pending instances (called by Owner button)
-- Both PRESERVE submitted/verified/rejected (Done Archive) records.

CREATE OR REPLACE FUNCTION public.cleanup_pending_for_assignment(_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _instance_ids uuid[];
  _deleted_instances int := 0;
  _deleted_notifications int := 0;
BEGIN
  -- Collect pending/late/escalated instance ids tied to this assignment.
  -- We only touch in-progress states; submitted/verified/rejected stay intact.
  SELECT array_agg(id) INTO _instance_ids
  FROM public.checklist_instances
  WHERE assignment_id = _assignment_id
    AND status IN ('pending', 'late', 'escalated');

  IF _instance_ids IS NULL OR array_length(_instance_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted_instances', 0, 'deleted_notifications', 0);
  END IF;

  -- Clear notifications linked to those instances
  DELETE FROM public.in_app_notifications WHERE instance_id = ANY(_instance_ids);
  GET DIAGNOSTICS _deleted_notifications = ROW_COUNT;

  -- Clear child tasks & completions for those instances
  DELETE FROM public.checklist_task_completions WHERE instance_id = ANY(_instance_ids);
  DELETE FROM public.checklist_instance_tasks WHERE instance_id = ANY(_instance_ids);

  -- Finally remove the pending instances
  DELETE FROM public.checklist_instances WHERE id = ANY(_instance_ids);
  GET DIAGNOSTICS _deleted_instances = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_instances', _deleted_instances,
    'deleted_notifications', _deleted_notifications
  );
END;
$$;

-- Trigger function: when an assignment is deleted, clean its pending instances first
CREATE OR REPLACE FUNCTION public.cleanup_pending_on_assignment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _instance_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO _instance_ids
  FROM public.checklist_instances
  WHERE assignment_id = OLD.id
    AND status IN ('pending', 'late', 'escalated');

  IF _instance_ids IS NOT NULL AND array_length(_instance_ids, 1) IS NOT NULL THEN
    DELETE FROM public.in_app_notifications WHERE instance_id = ANY(_instance_ids);
    DELETE FROM public.checklist_task_completions WHERE instance_id = ANY(_instance_ids);
    DELETE FROM public.checklist_instance_tasks WHERE instance_id = ANY(_instance_ids);
    DELETE FROM public.checklist_instances WHERE id = ANY(_instance_ids);
  END IF;

  -- Detach assignment_id on any remaining (submitted/verified/rejected) instances so FK-style logic stays clean.
  UPDATE public.checklist_instances
  SET assignment_id = NULL
  WHERE assignment_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_pending_on_assignment_delete ON public.checklist_assignments;
CREATE TRIGGER trg_cleanup_pending_on_assignment_delete
BEFORE DELETE ON public.checklist_assignments
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_pending_on_assignment_delete();

-- Owner-callable cleanup: remove ALL orphan pending/late/escalated instances.
-- An "orphan" is a pending instance whose assignment is missing or ended.
CREATE OR REPLACE FUNCTION public.cleanup_orphan_pending_checklists()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _instance_ids uuid[];
  _deleted_instances int := 0;
  _deleted_notifications int := 0;
BEGIN
  -- Authorization: Owner or Manager only
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied',
      'message', 'Only owners or managers can run cleanup');
  END IF;

  SELECT array_agg(ci.id) INTO _instance_ids
  FROM public.checklist_instances ci
  LEFT JOIN public.checklist_assignments ca ON ca.id = ci.assignment_id
  WHERE ci.status IN ('pending', 'late', 'escalated')
    AND (
      ci.assignment_id IS NULL          -- legacy / never linked
      OR ca.id IS NULL                  -- assignment was hard-deleted
      OR ca.status = 'ended'            -- assignment ended
    );

  IF _instance_ids IS NULL OR array_length(_instance_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted_instances', 0, 'deleted_notifications', 0);
  END IF;

  DELETE FROM public.in_app_notifications WHERE instance_id = ANY(_instance_ids);
  GET DIAGNOSTICS _deleted_notifications = ROW_COUNT;

  DELETE FROM public.checklist_task_completions WHERE instance_id = ANY(_instance_ids);
  DELETE FROM public.checklist_instance_tasks WHERE instance_id = ANY(_instance_ids);

  DELETE FROM public.checklist_instances WHERE id = ANY(_instance_ids);
  GET DIAGNOSTICS _deleted_instances = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_instances', _deleted_instances,
    'deleted_notifications', _deleted_notifications
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'message', SQLERRM);
END;
$$;