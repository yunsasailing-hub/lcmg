-- Allow staff to update and delete their own kitchen production logs from the same day
CREATE POLICY "Staff update own same-day production logs"
ON public.kitchen_production_logs
FOR UPDATE
TO authenticated
USING (created_by = auth.uid() AND production_date = CURRENT_DATE)
WITH CHECK (created_by = auth.uid() AND production_date = CURRENT_DATE);

CREATE POLICY "Staff delete own same-day production logs"
ON public.kitchen_production_logs
FOR DELETE
TO authenticated
USING (created_by = auth.uid() AND production_date = CURRENT_DATE);