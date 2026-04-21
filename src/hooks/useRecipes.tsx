import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Recipe = Database['public']['Tables']['recipes']['Row'] & {
  recipe_type_id?: string | null;
  category_id?: string | null;
  selling_price?: number | null;
  currency?: Database['public']['Enums']['currency_code'];
  portion_quantity?: number | null;
  portion_unit?: string | null;
  shelf_life?: string | null;
  internal_memo?: string | null;
  updated_by?: string | null;
  use_as_ingredient?: boolean | null;
};
export type RecipeInsert = Database['public']['Tables']['recipes']['Insert'] & {
  recipe_type_id?: string | null;
  category_id?: string | null;
  selling_price?: number | null;
  currency?: Database['public']['Enums']['currency_code'];
  portion_quantity?: number | null;
  portion_unit?: string | null;
  shelf_life?: string | null;
  internal_memo?: string | null;
  use_as_ingredient?: boolean | null;
};
export type RecipeStatus = Database['public']['Enums']['recipe_status'];
export type RecipeDepartment = Database['public']['Enums']['department'];
export type CurrencyCode = Database['public']['Enums']['currency_code'];

export const RECIPE_STATUSES: RecipeStatus[] = ['draft', 'active', 'archived'];
export const RECIPE_CURRENCIES: CurrencyCode[] = ['VND', 'USD', 'EUR'];
export const RECIPE_DEPARTMENTS: RecipeDepartment[] = ['kitchen', 'pizza', 'bar', 'bakery'];

export interface RecipeTypeRow {
  id: string;
  name_en: string;
  name_vi: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useRecipeTypes(includeArchived = false) {
  return useQuery({
    queryKey: ['recipe_types', { includeArchived }],
    queryFn: async () => {
      let q = (supabase as any).from('recipe_types').select('*').order('sort_order', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RecipeTypeRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecipes(includeArchived = false) {
  return useQuery({
    queryKey: ['recipes', { includeArchived }],
    queryFn: async () => {
      let q = supabase.from('recipes').select('*').order('updated_at', { ascending: false });
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
          .from('recipes').update(rest as any).eq('id', id).select().single();
        if (error) throw error;
        return data as Recipe;
      }
      const { data, error } = await supabase
        .from('recipes').insert(payload as any).select().single();
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

// ===================== Phase 2: Recipe Ingredient Lines =====================

export type RecipeIngredientRow = Database['public']['Tables']['recipe_ingredients']['Row'] & {
  cost_adjust_pct?: number | null;
};

export interface RecipeLineInput {
  id?: string;
  ingredient_id: string | null;
  unit_id: string | null;
  quantity: number;
  cost_adjust_pct: number;
  prep_note: string | null;
  sort_order: number;
  sub_recipe_id?: string | null;
}

export function useRecipeIngredients(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['recipe_ingredients', recipeId],
    enabled: !!recipeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .eq('recipe_id', recipeId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecipeIngredientRow[];
    },
  });
}

/**
 * Replace ALL lines for a recipe atomically (delete missing, upsert kept/new).
 * Keeps Ingredient Master untouched.
 */
export function useSaveRecipeIngredients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, lines }: { recipeId: string; lines: RecipeLineInput[] }) => {
      // 1) Determine which existing rows to delete (those not present in payload)
      const { data: existing, error: existErr } = await supabase
        .from('recipe_ingredients').select('id').eq('recipe_id', recipeId);
      if (existErr) throw existErr;
      const keepIds = new Set(lines.filter(l => l.id).map(l => l.id!));
      const toDelete = (existing ?? []).map(r => r.id).filter(id => !keepIds.has(id));
      if (toDelete.length) {
        const { error } = await supabase.from('recipe_ingredients').delete().in('id', toDelete);
        if (error) throw error;
      }
      // 2) Upsert each line (insert when no id, update when id present)
      for (const l of lines) {
        const payload: any = {
          recipe_id: recipeId,
          ingredient_id: l.sub_recipe_id ? null : l.ingredient_id,
          sub_recipe_id: l.sub_recipe_id ?? null,
          unit_id: l.unit_id,
          quantity: l.quantity,
          cost_adjust_pct: l.cost_adjust_pct,
          prep_note: l.prep_note,
          sort_order: l.sort_order,
        };
        if (l.id) {
          const { error } = await supabase.from('recipe_ingredients').update(payload).eq('id', l.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('recipe_ingredients').insert(payload);
          if (error) throw error;
        }
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['recipe_ingredients', vars.recipeId] });
    },
  });
}

/** Compute per-line cost using ingredient base price and unit conversion. */
export function computeLineCost(
  quantity: number,
  unitFactorToBase: number | null | undefined,
  ingredientBaseFactor: number | null | undefined,
  ingredientUnitPrice: number | null | undefined,
): number {
  const q = Number(quantity) || 0;
  const uf = Number(unitFactorToBase) || 1; // line unit -> base
  const bf = Number(ingredientBaseFactor) || 1; // purchase -> base
  const price = Number(ingredientUnitPrice) || 0; // price per purchase unit
  if (!q || !price) return 0;
  // cost per base unit = price / bf  ; line cost = q * uf * (price / bf)
  return q * uf * (price / bf);
}

export function applyAdjustment(lineCost: number, adjustPct: number): number {
  const pct = Number(adjustPct) || 0;
  return lineCost * (1 + pct / 100);
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
