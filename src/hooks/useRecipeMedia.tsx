import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { uploadToAppFilesBucket, type AppFilesModuleType } from '@/lib/appFilesStorage';
import { APP_FILES_BUCKET } from '@/lib/appFilesStorage';

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

/**
 * Determine which bucket a stored path belongs to.
 * New uploads land under `recipes/...` in `app-files`; everything else is
 * assumed legacy and lives in `recipe-media`.
 */
function bucketForPath(storagePath: string): string {
  return storagePath.startsWith('recipes/') ? APP_FILES_BUCKET : RECIPE_MEDIA_BUCKET;
}

/** Remove a stored object from whichever bucket it actually lives in. */
export async function removeRecipeStorageObject(storagePath: string): Promise<void> {
  await supabase.storage.from(bucketForPath(storagePath)).remove([storagePath]).catch(() => {});
}

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

/**
 * Fetch the primary (or first available) image for many recipes at once.
 * Used to render small thumbnails next to recipe names in the recipe list.
 * Returns a map: recipe_id -> public image url.
 */
export function useRecipePrimaryImages(recipeIds: string[]) {
  const ids = [...recipeIds].sort();
  return useQuery({
    queryKey: ['recipe_media_primary', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('recipe_media')
        .select('recipe_id,url,is_primary,sort_order,created_at,media_type')
        .in('recipe_id', ids)
        .eq('media_type', 'image')
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ recipe_id: string; url: string }>) {
        if (!map[row.recipe_id]) map[row.recipe_id] = row.url;
      }
      return map;
    },
  });
}

/**
 * Upload a recipe media file to the unified `app-files` bucket.
 *
 * NEW uploads go to `app-files` under one of:
 *   - recipes/images/        (main recipe images & generic files)
 *   - recipes/step-photos/   (per-step / procedure / service media)
 *   - recipes/videos/        (uploaded video files; video LINKS are stored as URLs only)
 *
 * IMPORTANT: existing rows that point at the legacy `recipe-media` bucket
 * keep working — display logic loads them straight from their stored URL.
 * Only NEW uploads are routed through here.
 *
 * `recipeId` is intentionally accepted for API compatibility with old
 * callers but is no longer encoded into the storage path; the file name
 * carries the readable suffix instead.
 */
export type RecipeUploadSubFolder = 'images' | 'step-photos' | 'videos';

export async function uploadRecipeMediaFile(
  recipeId: string,
  file: File,
  subFolder: RecipeUploadSubFolder = 'images',
): Promise<{ path: string; publicUrl: string }> {
  const moduleType: AppFilesModuleType =
    subFolder === 'step-photos'
      ? 'recipes-step-photos'
      : subFolder === 'videos'
        ? 'recipes-videos'
        : 'recipes-images';

  const result = await uploadToAppFilesBucket(file, moduleType);

  // Verification log requested by spec.
  console.log('[recipe.upload]', {
    bucket: result.bucket,
    path: result.path,
    url: result.publicUrl,
    subFolder,
    recipeId,
  });

  return { path: result.path, publicUrl: result.publicUrl };
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
