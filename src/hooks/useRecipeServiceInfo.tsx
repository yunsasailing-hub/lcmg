import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RECIPE_MEDIA_BUCKET, removeRecipeStorageObject } from '@/hooks/useRecipeMedia';
import { uploadToAppFilesBucket } from '@/lib/appFilesStorage';

export interface RecipeServiceInfoRow {
  id: string;
  recipe_id: string;
  short_description: string | null;
  staff_explanation: string | null;
  key_ingredients: string | null;
  taste_profile: string | null;
  allergens_to_mention: string | null;
  upselling_notes: string | null;
  pairing_suggestion: string | null;
  service_warning: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  video_url: string | null;
  web_link: string | null;
  created_at: string;
  updated_at: string;
}

export type RecipeServiceInfoInput = Omit<
  RecipeServiceInfoRow,
  'id' | 'created_at' | 'updated_at'
>;

export function useRecipeServiceInfo(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['recipe_service_info', recipeId],
    enabled: !!recipeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('recipe_service_info')
        .select('*')
        .eq('recipe_id', recipeId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RecipeServiceInfoRow | null;
    },
  });
}

export function useSaveRecipeServiceInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecipeServiceInfoInput) => {
      // Upsert by unique recipe_id
      const { data, error } = await (supabase as any)
        .from('recipe_service_info')
        .upsert(input, { onConflict: 'recipe_id' })
        .select('*')
        .single();
      if (error) throw error;
      return data as RecipeServiceInfoRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['recipe_service_info', vars.recipe_id] });
    },
  });
}

export async function uploadServiceInfoImage(
  recipeId: string,
  file: File,
): Promise<{ path: string; publicUrl: string }> {
  // Service-info image -> recipes/step-photos/ in app-files bucket.
  const result = await uploadToAppFilesBucket(file, 'recipes-step-photos');
  console.log('[recipe.upload]', {
    bucket: result.bucket,
    path: result.path,
    url: result.publicUrl,
    subFolder: 'step-photos',
    recipeId,
    target: 'service_info',
  });
  return { path: result.path, publicUrl: result.publicUrl };
}

export async function deleteServiceInfoImage(path: string): Promise<void> {
  // Bucket-aware so legacy `recipe-media` paths still clean up.
  await removeRecipeStorageObject(path);
}
