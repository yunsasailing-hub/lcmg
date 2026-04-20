CREATE TABLE public.recipe_service_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL UNIQUE REFERENCES public.recipes(id) ON DELETE CASCADE,
  short_description TEXT,
  staff_explanation TEXT,
  key_ingredients TEXT,
  taste_profile TEXT,
  allergens_to_mention TEXT,
  upselling_notes TEXT,
  pairing_suggestion TEXT,
  service_warning TEXT,
  image_url TEXT,
  image_storage_path TEXT,
  video_url TEXT,
  web_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

ALTER TABLE public.recipe_service_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read service info"
ON public.recipe_service_info FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners/managers manage service info - insert"
ON public.recipe_service_info FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage service info - update"
ON public.recipe_service_info FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owners/managers manage service info - delete"
ON public.recipe_service_info FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_recipe_service_info_updated_at
BEFORE UPDATE ON public.recipe_service_info
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();