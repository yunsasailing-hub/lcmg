import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Ingredient = Database['public']['Tables']['ingredients']['Row'];
export type IngredientInsert = Database['public']['Tables']['ingredients']['Insert'];
export type IngredientUpdate = Database['public']['Tables']['ingredients']['Update'];
export type RecipeCategory = Database['public']['Tables']['recipe_categories']['Row'];
export type RecipeUnit = Database['public']['Tables']['recipe_units']['Row'];
export type Storehouse = Database['public']['Tables']['storehouses']['Row'];
export type IngredientType = Database['public']['Enums']['ingredient_type'];
export type CurrencyCode = Database['public']['Enums']['currency_code'];

export const INGREDIENT_TYPES: IngredientType[] = ['batch_recipe', 'bottled_drink', 'ingredient', 'other'];
export const CURRENCIES: CurrencyCode[] = ['VND', 'USD', 'EUR'];

export function useIngredients(includeArchived = false) {
  return useQuery({
    queryKey: ['ingredients', { includeArchived }],
    queryFn: async () => {
      let q = supabase.from('ingredients').select('*').order('name_en', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useIngredient(id: string | undefined) {
  return useQuery({
    queryKey: ['ingredient', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('ingredients').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRecipeCategories() {
  return useQuery({
    queryKey: ['recipe_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecipeUnits() {
  return useQuery({
    queryKey: ['recipe_units'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_units')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useStorehouses() {
  return useQuery({
    queryKey: ['storehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('storehouses')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: IngredientInsert & { id?: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { data, error } = await supabase
          .from('ingredients').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('ingredients').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['ingredient'] });
    },
  });
}

export function useArchiveIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('ingredients').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['ingredient'] });
    },
  });
}

/** Check if a code is already used (case-insensitive). Optionally exclude one id (for editing). */
export async function isIngredientCodeTaken(code: string, excludeId?: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;
  let q = supabase.from('ingredients').select('id').ilike('code', trimmed).limit(1);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
