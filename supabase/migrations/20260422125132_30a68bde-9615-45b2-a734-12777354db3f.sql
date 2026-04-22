-- Multi-media collections for recipe procedure steps and service info.
-- One row per media item. Kind discriminates image vs video.
-- Max 4 per (parent, kind) is enforced at the application layer.

CREATE TYPE public.recipe_media_kind AS ENUM ('image', 'video');

-- =========================
-- Step-level media
-- =========================
CREATE TABLE public.recipe_procedure_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES public.recipe_procedures(id) ON DELETE CASCADE,
  kind public.recipe_media_kind NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  title TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_procedure_media_proc ON public.recipe_procedure_media(procedure_id, kind, sort_order);

ALTER TABLE public.recipe_procedure_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read procedure media"
  ON public.recipe_procedure_media FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage procedure media - insert"
  ON public.recipe_procedure_media FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage procedure media - update"
  ON public.recipe_procedure_media FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage procedure media - delete"
  ON public.recipe_procedure_media FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_recipe_procedure_media_touch
  BEFORE UPDATE ON public.recipe_procedure_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- Service-info media
-- =========================
CREATE TABLE public.recipe_service_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  kind public.recipe_media_kind NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  title TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_service_media_recipe ON public.recipe_service_media(recipe_id, kind, sort_order);

ALTER TABLE public.recipe_service_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read service media"
  ON public.recipe_service_media FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage service media - insert"
  ON public.recipe_service_media FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage service media - update"
  ON public.recipe_service_media FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage service media - delete"
  ON public.recipe_service_media FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_recipe_service_media_touch
  BEFORE UPDATE ON public.recipe_service_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- Backfill from legacy single fields (idempotent)
-- =========================
INSERT INTO public.recipe_procedure_media (procedure_id, kind, url, storage_path, sort_order)
SELECT p.id, 'image'::recipe_media_kind, p.image_url, p.image_storage_path, 0
FROM public.recipe_procedures p
WHERE p.image_url IS NOT NULL AND p.image_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.recipe_procedure_media m
    WHERE m.procedure_id = p.id AND m.kind = 'image' AND m.url = p.image_url
  );

INSERT INTO public.recipe_procedure_media (procedure_id, kind, url, sort_order)
SELECT p.id, 'video'::recipe_media_kind, p.video_url, 0
FROM public.recipe_procedures p
WHERE p.video_url IS NOT NULL AND p.video_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.recipe_procedure_media m
    WHERE m.procedure_id = p.id AND m.kind = 'video' AND m.url = p.video_url
  );

INSERT INTO public.recipe_service_media (recipe_id, kind, url, storage_path, sort_order)
SELECT s.recipe_id, 'image'::recipe_media_kind, s.image_url, s.image_storage_path, 0
FROM public.recipe_service_info s
WHERE s.image_url IS NOT NULL AND s.image_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.recipe_service_media m
    WHERE m.recipe_id = s.recipe_id AND m.kind = 'image' AND m.url = s.image_url
  );

INSERT INTO public.recipe_service_media (recipe_id, kind, url, sort_order)
SELECT s.recipe_id, 'video'::recipe_media_kind, s.video_url, 0
FROM public.recipe_service_info s
WHERE s.video_url IS NOT NULL AND s.video_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.recipe_service_media m
    WHERE m.recipe_id = s.recipe_id AND m.kind = 'video' AND m.url = s.video_url
  );