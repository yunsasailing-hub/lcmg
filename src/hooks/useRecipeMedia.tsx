import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RecipeMediaType = 'image' | 'video_link' | 'web_link' | 'file';

export interface RecipeMediaRow {
  id: string;
  recipe_id: string;
  media_type: RecipeMediaType;
  title: string | null;
  url: string;
  storage_path: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const RECIPE_MEDIA_BUCKET = 'recipe-media';

export function useRecipeMedia(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['recipe_media', recipeId],
    enabled: !!recipeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('recipe_media')
        .select('*')
        .eq('recipe_id', recipeId!)
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecipeMediaRow[];
    },
  });
}

export async function uploadRecipeMediaFile(
  recipeId: string,
  file: File,
): Promise<{ path: string; publicUrl: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const key = `${recipeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(RECIPE_MEDIA_BUCKET)
    .upload(key, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from(RECIPE_MEDIA_BUCKET).getPublicUrl(key);
  return { path: key, publicUrl: data.publicUrl };
}

export function useAddRecipeMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recipe_id: string;
      media_type: RecipeMediaType;
      url: string;
      title?: string | null;
      storage_path?: string | null;
      is_primary?: boolean;
      sort_order?: number;
    }) => {
      // If marking as primary image, demote any other primary images first.
      if (input.is_primary && input.media_type === 'image') {
        await (supabase as any)
          .from('recipe_media')
          .update({ is_primary: false })
          .eq('recipe_id', input.recipe_id)
          .eq('media_type', 'image');
      }
      const { data, error } = await (supabase as any)
        .from('recipe_media')
        .insert({
          recipe_id: input.recipe_id,
          media_type: input.media_type,
          url: input.url,
          title: input.title ?? null,
          storage_path: input.storage_path ?? null,
          is_primary: input.is_primary ?? false,
          sort_order: input.sort_order ?? 0,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as RecipeMediaRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['recipe_media', vars.recipe_id] });
    },
  });
}

export function useUpdateRecipeMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      recipe_id: string;
      patch: Partial<Pick<RecipeMediaRow, 'title' | 'url' | 'is_primary' | 'sort_order'>>;
    }) => {
      if (input.patch.is_primary) {
        await (supabase as any)
          .from('recipe_media')
          .update({ is_primary: false })
          .eq('recipe_id', input.recipe_id)
          .eq('media_type', 'image')
          .neq('id', input.id);
      }
      const { error } = await (supabase as any)
        .from('recipe_media').update(input.patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['recipe_media', vars.recipe_id] });
    },
  });
}

export function useDeleteRecipeMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; recipe_id: string; storage_path?: string | null }) => {
      if (input.storage_path) {
        await supabase.storage.from(RECIPE_MEDIA_BUCKET).remove([input.storage_path]).catch(() => {});
      }
      const { error } = await (supabase as any)
        .from('recipe_media').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['recipe_media', vars.recipe_id] });
    },
  });
}
