import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Recipe = Database['public']['Tables']['recipes']['Row'];
export type RecipeInsert = Database['public']['Tables']['recipes']['Insert'];
export type RecipeKind = Database['public']['Enums']['recipe_kind'];
export type RecipeStatus = Database['public']['Enums']['recipe_status'];
export type RecipeDepartment = Database['public']['Enums']['department'];

export const RECIPE_KINDS: RecipeKind[] = ['dish', 'prep', 'batch', 'sub_recipe'];
export const RECIPE_STATUSES: RecipeStatus[] = ['draft', 'active', 'archived'];

export function useRecipes(includeArchived = false) {
  return useQuery({
    queryKey: ['recipes', { includeArchived }],
    queryFn: async () => {
      let q = supabase.from('recipes').select('*').order('name_en', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Recipe[];
    },
  });
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: ['recipe', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('recipes').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as Recipe | null;
    },
  });
}

export function useUpsertRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RecipeInsert & { id?: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { data, error } = await supabase
          .from('recipes').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data as Recipe;
      }
      const { data, error } = await supabase
        .from('recipes').insert(payload).select().single();
      if (error) throw error;
      return data as Recipe;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['recipe'] });
    },
  });
}

export function useArchiveRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('recipes').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['recipe'] });
    },
  });
}

/** Case-insensitive code uniqueness check. */
export async function isRecipeCodeTaken(code: string, excludeId?: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;
  let q = supabase.from('recipes').select('id').ilike('code', trimmed).limit(1);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
