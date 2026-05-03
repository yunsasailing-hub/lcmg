
CREATE TABLE public.maintenance_work_to_be_done_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_to_be_done_id uuid NOT NULL REFERENCES public.maintenance_work_to_be_done(id) ON DELETE CASCADE,
  update_note text NOT NULL,
  photo_url text,
  photo_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wtbd_updates_job ON public.maintenance_work_to_be_done_updates(work_to_be_done_id, created_at DESC);

ALTER TABLE public.maintenance_work_to_be_done_updates ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can read the parent job
CREATE POLICY "Read wtbd updates via parent"
ON public.maintenance_work_to_be_done_updates
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.maintenance_work_to_be_done w
  WHERE w.id = work_to_be_done_id
));

-- Insert: only when parent is active (not Completed/Cancelled), user can see parent, created_by = self
CREATE POLICY "Insert wtbd updates when active"
ON public.maintenance_work_to_be_done_updates
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.maintenance_work_to_be_done w
    WHERE w.id = work_to_be_done_id
      AND w.status NOT IN ('Completed','Cancelled')
  )
);
