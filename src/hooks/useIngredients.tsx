import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Ingredient = Database['public']['Tables']['ingredients']['Row'] & {
  ingredient_type_id?: string | null;
  ingredient_category_id?: string | null;
};
export type IngredientInsert = Database['public']['Tables']['ingredients']['Insert'] & {
  ingredient_type_id?: string | null;
  ingredient_category_id?: string | null;
};
export type IngredientUpdate = Database['public']['Tables']['ingredients']['Update'];
export type RecipeCategory = Database['public']['Tables']['recipe_categories']['Row'];
export type RecipeUnit = Database['public']['Tables']['recipe_units']['Row'];
export type Storehouse = Database['public']['Tables']['storehouses']['Row'];
export type IngredientType = Database['public']['Enums']['ingredient_type'];
export type CurrencyCode = Database['public']['Enums']['currency_code'];

export interface IngredientTypeRow {
  id: string;
  name_en: string;
  name_vi: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngredientCategoryRow {
  id: string;
  name_en: string;
  name_vi: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const INGREDIENT_TYPES: IngredientType[] = ['batch_recipe', 'bottled_drink', 'ingredient', 'other'];
export const CURRENCIES: CurrencyCode[] = ['VND', 'USD', 'EUR'];

// Maps a managed-type name to the legacy enum value (for backward compatibility).
export function mapNameToLegacyEnum(name: string): IngredientType {
  const n = name.trim().toLowerCase();
  if (n.includes('batch')) return 'batch_recipe';
  if (n.includes('bottle')) return 'bottled_drink';
  if (n === 'ingredient' || n.includes('ingredient')) return 'ingredient';
  return 'other';
}

export function useIngredients(includeArchived = false) {
  return useQuery({
    queryKey: ['ingredients', { includeArchived }],
    queryFn: async () => {
      let q = supabase.from('ingredients').select('*').order('name_en', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Ingredient[];
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
      return data as Ingredient | null;
    },
  });
}

export function useRecipeCategories(includeArchived = false) {
  return useQuery({
    queryKey: ['recipe_categories', { includeArchived }],
    queryFn: async () => {
      let q = supabase.from('recipe_categories').select('*').order('sort_order', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecipeUnits(includeArchived = false) {
  return useQuery({
    queryKey: ['recipe_units', { includeArchived }],
    queryFn: async () => {
      let q = supabase.from('recipe_units').select('*').order('sort_order', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useStorehouses(includeArchived = false) {
  return useQuery({
    queryKey: ['storehouses', { includeArchived }],
    queryFn: async () => {
      let q = supabase.from('storehouses').select('*').order('sort_order', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIngredientTypes(includeArchived = false) {
  return useQuery({
    queryKey: ['ingredient_types', { includeArchived }],
    queryFn: async () => {
      let q = (supabase as any)
        .from('ingredient_types')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as IngredientTypeRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIngredientCategories(includeArchived = false) {
  return useQuery({
    queryKey: ['ingredient_categories', { includeArchived }],
    queryFn: async () => {
      let q = (supabase as any)
        .from('ingredient_categories')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as IngredientCategoryRow[];
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
          .from('ingredients').update(rest as any).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('ingredients').insert(payload as any).select().single();
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

// ---------------- Master option-list mutations (Settings page) ----------------

type OptionTable = 'ingredient_types' | 'recipe_categories' | 'recipe_units' | 'storehouses';

const QUERY_KEY: Record<OptionTable, string> = {
  ingredient_types: 'ingredient_types',
  recipe_categories: 'recipe_categories',
  recipe_units: 'recipe_units',
  storehouses: 'storehouses',
};

export function useUpsertOption(table: OptionTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Record<string, any>) => {
      const { id, ...rest } = row;
      if (id) {
        const { data, error } = await (supabase as any).from(table).update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await (supabase as any).from(table).insert(rest).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY[table]] });
    },
  });
}

export function useArchiveOption(table: OptionTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from(table).update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY[table]] });
    },
  });
}

export function useReorderOption(table: OptionTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sort_order }: { id: string; sort_order: number }) => {
      const { error } = await (supabase as any).from(table).update({ sort_order }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY[table]] });
    },
  });
}
