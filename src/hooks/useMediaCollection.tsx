import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { removeRecipeStorageObject } from '@/hooks/useRecipeMedia';
import { uploadToAppFilesBucket } from '@/lib/appFilesStorage';

/**
 * Generic media-collection hook used by:
 *  - recipe_procedure_media  (parent = procedure_id)
 *  - recipe_service_media    (parent = recipe_id)
 *
 * Each row is one media item, kind = 'image' | 'video'.
 * Max 4 items per (parent, kind) is enforced in the UI; we also defensively
 * cap inserts here.
 */

export type MediaKind = 'image' | 'video';
export const MEDIA_MAX_PER_KIND = 4;

export interface MediaCollectionRow {
  id: string;
  kind: MediaKind;
  url: string;
  storage_path: string | null;
  title: string | null;
  sort_order: number;
  created_at: string;
}

type Table = 'recipe_procedure_media' | 'recipe_service_media';
type ParentCol = 'procedure_id' | 'recipe_id';

interface Config {
  table: Table;
  parentColumn: ParentCol;
  parentId: string | null | undefined;
}

const cfgKey = (c: Config) => [c.table, c.parentColumn, c.parentId] as const;

export function useMediaCollection(config: Config) {
  return useQuery({
    queryKey: cfgKey(config),
    enabled: !!config.parentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(config.table)
        .select('id, kind, url, storage_path, title, sort_order, created_at')
        .eq(config.parentColumn, config.parentId!)
        .order('kind', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MediaCollectionRow[];
    },
  });
}

/**
 * Upload a pasted/picked image to the recipe-media bucket and add a media row.
 */
export function useAddMediaImage(config: Config) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recipeIdForBucket: string;
      file: File;
      existingCount: number;
      readableName?: string | null;
    }) => {
      if (input.existingCount >= MEDIA_MAX_PER_KIND) {
        throw new Error('LIMIT_REACHED');
      }
      // Procedure / service step imagery -> recipes/step-photos/ in app-files.
      const result = await uploadToAppFilesBucket(
        input.file,
        'recipes-step-photos',
        {},
        input.readableName ?? null,
      );
      console.log('[recipe.upload]', {
        bucket: result.bucket,
        path: result.path,
        url: result.publicUrl,
        subFolder: 'step-photos',
        recipeId: input.recipeIdForBucket,
        target: config.table,
        readableName: input.readableName ?? null,
      });
      const { error } = await (supabase as any).from(config.table).insert({
        [config.parentColumn]: config.parentId,
        kind: 'image',
        url: result.publicUrl,
        storage_path: result.path,
        sort_order: input.existingCount,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cfgKey(config) }),
  });
}

export function useAddMediaVideo(config: Config) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { url: string; existingCount: number }) => {
      if (input.existingCount >= MEDIA_MAX_PER_KIND) throw new Error('LIMIT_REACHED');
      const url = input.url.trim();
      if (!url) throw new Error('EMPTY_URL');
      const { error } = await (supabase as any).from(config.table).insert({
        [config.parentColumn]: config.parentId,
        kind: 'video',
        url,
        sort_order: input.existingCount,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cfgKey(config) }),
  });
}

export function useDeleteMedia(config: Config) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { id: string; storage_path: string | null }) => {
      if (item.storage_path) {
        // Bucket-aware removal so legacy `recipe-media` rows still clean up.
        await removeRecipeStorageObject(item.storage_path);
      }
      const { error } = await (supabase as any).from(config.table).delete().eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cfgKey(config) }),
  });
}
