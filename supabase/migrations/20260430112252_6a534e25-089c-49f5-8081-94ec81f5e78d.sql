-- Drop the old unconditional unique indexes that prevented any second instance per (template, user, date)
DROP INDEX IF EXISTS public.idx_unique_instance_per_user_template_date;
DROP INDEX IF EXISTS public.uq_instance_template_user_date;

-- Replace with a partial unique index that only enforces uniqueness for ACTIVE instances
-- Active = not yet finished (pending, late, escalated). Completed/verified instances no longer block re-assignment.
CREATE UNIQUE INDEX uq_active_instance_template_user_date
  ON public.checklist_instances (template_id, assigned_to, scheduled_date)
  WHERE template_id IS NOT NULL
    AND assigned_to IS NOT NULL
    AND status IN ('pending', 'late', 'escalated');