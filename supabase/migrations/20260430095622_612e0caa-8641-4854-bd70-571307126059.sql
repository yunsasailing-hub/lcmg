-- Create unified app-files bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-files', 'app-files', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "app-files public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-files');

-- Authenticated upload
CREATE POLICY "app-files authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'app-files');

-- Authenticated update
CREATE POLICY "app-files authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'app-files');

-- Authenticated delete
CREATE POLICY "app-files authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'app-files');