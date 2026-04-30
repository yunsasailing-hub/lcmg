ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS cost_amount numeric,
  ADD COLUMN IF NOT EXISTS cost_type text,
  ADD COLUMN IF NOT EXISTS external_company text,
  ADD COLUMN IF NOT EXISTS external_contact text,
  ADD COLUMN IF NOT EXISTS spare_parts text,
  ADD COLUMN IF NOT EXISTS technical_note text,
  ADD COLUMN IF NOT EXISTS additional_photos text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.maintenance_tasks
  DROP CONSTRAINT IF EXISTS maintenance_tasks_cost_type_check;

ALTER TABLE public.maintenance_tasks
  ADD CONSTRAINT maintenance_tasks_cost_type_check
  CHECK (cost_type IS NULL OR cost_type IN ('Internal', 'External'));