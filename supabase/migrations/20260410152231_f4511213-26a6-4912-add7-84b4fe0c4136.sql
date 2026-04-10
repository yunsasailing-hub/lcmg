
-- Add default_due_time to templates
ALTER TABLE public.checklist_templates
ADD COLUMN default_due_time TIME WITHOUT TIME ZONE;

-- Backfill existing templates based on checklist_type
UPDATE public.checklist_templates SET default_due_time = '10:00:00' WHERE checklist_type = 'opening';
UPDATE public.checklist_templates SET default_due_time = '16:00:00' WHERE checklist_type = 'afternoon';
UPDATE public.checklist_templates SET default_due_time = '22:30:00' WHERE checklist_type = 'closing';

-- Set NOT NULL after backfill
ALTER TABLE public.checklist_templates ALTER COLUMN default_due_time SET NOT NULL;

-- Add due_datetime to instances
ALTER TABLE public.checklist_instances
ADD COLUMN due_datetime TIMESTAMP WITH TIME ZONE;

-- Backfill existing instances
UPDATE public.checklist_instances ci
SET due_datetime = (ci.scheduled_date || ' ' || COALESCE(ct.default_due_time::text, '10:00:00'))::timestamp AT TIME ZONE 'UTC'
FROM public.checklist_templates ct
WHERE ci.template_id = ct.id AND ci.due_datetime IS NULL;

-- For instances without a template, use type-based defaults
UPDATE public.checklist_instances
SET due_datetime = (scheduled_date || ' ' ||
  CASE checklist_type
    WHEN 'opening' THEN '10:00:00'
    WHEN 'afternoon' THEN '16:00:00'
    WHEN 'closing' THEN '22:30:00'
    ELSE '10:00:00'
  END)::timestamp AT TIME ZONE 'UTC'
WHERE due_datetime IS NULL;
