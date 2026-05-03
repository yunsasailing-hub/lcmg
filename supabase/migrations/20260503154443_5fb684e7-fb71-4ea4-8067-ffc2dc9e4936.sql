-- Add work_area field to Work To Be Done and Repairs

CREATE TYPE public.work_area AS ENUM (
  'Electrical',
  'Plumbing',
  'Construction / Finishing',
  'Carpentry / Metal Work',
  'Equipment / Machinery',
  'Cooling & Ventilation',
  'Cleaning / Pest Control',
  'IT / System',
  'General / Other'
);

ALTER TABLE public.maintenance_work_to_be_done
  ADD COLUMN work_area public.work_area NOT NULL DEFAULT 'General / Other';

ALTER TABLE public.maintenance_repairs
  ADD COLUMN work_area public.work_area NOT NULL DEFAULT 'General / Other';

-- Backfill existing rows (covered by DEFAULT, but explicit for clarity)
UPDATE public.maintenance_work_to_be_done SET work_area = 'General / Other' WHERE work_area IS NULL;
UPDATE public.maintenance_repairs SET work_area = 'General / Other' WHERE work_area IS NULL;