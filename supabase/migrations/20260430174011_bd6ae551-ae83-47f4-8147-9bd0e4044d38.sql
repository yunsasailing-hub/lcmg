
-- Add new statuses to the existing maintenance_repair_status enum.
-- Postgres requires ALTER TYPE ADD VALUE; conditional via DO block to be idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'maintenance_repair_status' AND e.enumlabel = 'Done'
  ) THEN
    ALTER TYPE public.maintenance_repair_status ADD VALUE 'Done';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'maintenance_repair_status' AND e.enumlabel = 'Archived'
  ) THEN
    ALTER TYPE public.maintenance_repair_status ADD VALUE 'Archived';
  END IF;
END$$;

-- Add cost_type and photos array
ALTER TABLE public.maintenance_repairs
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'Internal / No Cost',
  ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}'::text[];

-- Constrain cost_type to known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_repairs_cost_type_check'
  ) THEN
    ALTER TABLE public.maintenance_repairs
      ADD CONSTRAINT maintenance_repairs_cost_type_check
      CHECK (cost_type IN ('Internal / No Cost', 'External Service'));
  END IF;
END$$;
