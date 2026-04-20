
-- 1. recipe_media table
CREATE TYPE public.recipe_media_type AS ENUM ('image', 'video_link', 'web_link', 'file');

CREATE TABLE public.recipe_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  media_type public.recipe_media_type NOT NULL,
  title text,
  url text NOT NULL,
  storage_path text,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_recipe_media_recipe ON public.recipe_media (recipe_id, sort_order);

ALTER TABLE public.recipe_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read recipe media"
  ON public.recipe_media FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage recipe media - insert"
  ON public.recipe_media FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage recipe media - update"
  ON public.recipe_media FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage recipe media - delete"
  ON public.recipe_media FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_recipe_media_updated_at
  BEFORE UPDATE ON public.recipe_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Procedure step optional media
ALTER TABLE public.recipe_procedures
  ADD COLUMN image_url text,
  ADD COLUMN image_storage_path text,
  ADD COLUMN video_url text,
  ADD COLUMN web_link text;

-- 3. Storage bucket (public for read; writes via RLS)
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-media', 'recipe-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read recipe-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recipe-media');

CREATE POLICY "Owners/managers upload recipe-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-media'
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );

CREATE POLICY "Owners/managers update recipe-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recipe-media'
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );

CREATE POLICY "Owners/managers delete recipe-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'recipe-media'
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
