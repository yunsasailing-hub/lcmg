import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { computeConvertedLineCost } from '@/lib/ingredientConversion';

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
  show_in_kitchen_production?: boolean | null;
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
  show_in_kitchen_production?: boolean | null;
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

/**
 * Batch-compute total ingredient cost for many recipes at once.
 * Mirrors the calculation used on the recipe detail page (see
 * useRecipeAsIngredientPublication / useRecipesAsIngredient) so the
 * list-table recap matches the detail-page total exactly.
 * Display-only — does not mutate any data.
 */
export function useRecipesTotalCosts(recipeIds: string[]) {
  const key = [...recipeIds].sort().join(',');
  return useQuery({
    queryKey: ['recipes_total_costs', key],
    enabled: recipeIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const ids = recipeIds;
      const { data: lines } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id, ingredient_id, sub_recipe_id, unit_id, quantity, cost_adjust_pct')
        .in('recipe_id', ids);

      const ingIds = Array.from(new Set((lines ?? []).map(l => l.ingredient_id).filter(Boolean) as string[]));
      const subIds = Array.from(new Set((lines ?? []).map(l => l.sub_recipe_id).filter(Boolean) as string[]));

      const ingMap: Record<string, any> = {};
      if (ingIds.length) {
        const { data: ings } = await supabase
          .from('ingredients')
          .select('id, price, purchase_to_base_factor, base_unit_id, purchase_unit_id, conversion_enabled, conversion_qty, conversion_unit_id')
          .in('id', ingIds);
        (ings ?? []).forEach(i => { ingMap[i.id] = i; });
      }

      // Sub-recipe cost-per-yield-unit lookup (one level deep, matches existing logic).
      const subRecipeMap: Record<string, { yield_unit_id: string | null; costPerYieldUnit: number }> = {};
      if (subIds.length) {
        const { data: subRecipes } = await supabase
          .from('recipes')
          .select('id, yield_quantity, yield_unit_id')
          .in('id', subIds);
        const { data: subLines } = await supabase
          .from('recipe_ingredients')
          .select('recipe_id, ingredient_id, sub_recipe_id, unit_id, quantity, cost_adjust_pct')
          .in('recipe_id', subIds);
        const subIngIds = Array.from(new Set((subLines ?? []).map(l => l.ingredient_id).filter(Boolean) as string[]));
        const subIngMap: Record<string, any> = {};
        if (subIngIds.length) {
          const { data: ings } = await supabase
            .from('ingredients')
            .select('id, price, purchase_to_base_factor, base_unit_id, purchase_unit_id, conversion_enabled, conversion_qty, conversion_unit_id')
            .in('id', subIngIds);
          (ings ?? []).forEach(i => { subIngMap[i.id] = i; });
        }
        const subUnitIds = Array.from(new Set([
          ...((subLines ?? []).map(l => l.unit_id).filter(Boolean) as string[]),
          ...Object.values(subIngMap).map((i: any) => i.base_unit_id).filter(Boolean),
          ...Object.values(subIngMap).map((i: any) => i.purchase_unit_id).filter(Boolean),
          ...Object.values(subIngMap).map((i: any) => i.conversion_unit_id).filter(Boolean),
          ...((subRecipes ?? []).map((r: any) => r.yield_unit_id).filter(Boolean) as string[]),
        ]));
        const subUnitMap: Record<string, any> = {};
        if (subUnitIds.length) {
          const { data: us } = await supabase
            .from('recipe_units').select('id, name_en, factor_to_base, unit_type').in('id', subUnitIds);
          (us ?? []).forEach(u => { subUnitMap[u.id] = u; });
        }
        const subTotals: Record<string, number> = {};
        (subLines ?? []).forEach(l => {
          subTotals[l.recipe_id] = (subTotals[l.recipe_id] ?? 0) + computeRecipeLineAdjustedCost({ line: l as any, ingMap: subIngMap, unitMap: subUnitMap });
        });
        (subRecipes ?? []).forEach((r: any) => {
          const yq = Number(r.yield_quantity) || 0;
          subRecipeMap[r.id] = {
            yield_unit_id: r.yield_unit_id ?? null,
            costPerYieldUnit: yq > 0 ? (subTotals[r.id] ?? 0) / yq : 0,
          };
        });
      }

      const unitIds = Array.from(new Set([
        ...((lines ?? []).map(l => l.unit_id).filter(Boolean) as string[]),
        ...Object.values(ingMap).map((i: any) => i.base_unit_id).filter(Boolean),
        ...Object.values(ingMap).map((i: any) => i.purchase_unit_id).filter(Boolean),
        ...Object.values(ingMap).map((i: any) => i.conversion_unit_id).filter(Boolean),
        ...Object.values(subRecipeMap).map(s => s.yield_unit_id).filter(Boolean) as string[],
      ]));
      const unitMap: Record<string, any> = {};
      if (unitIds.length) {
        const { data: us } = await supabase
          .from('recipe_units').select('id, name_en, factor_to_base, unit_type').in('id', unitIds);
        (us ?? []).forEach(u => { unitMap[u.id] = u; });
      }

      const totals: Record<string, number> = {};
      ids.forEach(id => { totals[id] = 0; });
      (lines ?? []).forEach(l => {
        totals[l.recipe_id] = (totals[l.recipe_id] ?? 0) + computeRecipeLineAdjustedCost({ line: l as any, ingMap, unitMap, subRecipeMap });
      });
      return totals;
    },
    staleTime: 30 * 1000,
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
        // Debug: ensure yield_unit_id is present in the update payload.
        // (Helps diagnose Master Info -> Yield Unit save issues.)
        // eslint-disable-next-line no-console
        console.debug('[useUpsertRecipe] update', id, {
          yield_unit_id: (rest as any).yield_unit_id,
          yield_quantity: (rest as any).yield_quantity,
        });
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
    onSuccess: async (data) => {
      // Force a refetch so the form re-reads persisted values (esp. yield_unit_id)
      // immediately after save. Awaiting prevents a flash of stale data.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['recipes'] }),
        qc.invalidateQueries({ queryKey: ['recipe', data?.id] }),
        qc.invalidateQueries({ queryKey: ['recipe'] }),
        qc.invalidateQueries({ queryKey: ['kitchen-production-items'] }),
      ]);
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

/**
 * Compute a recipe ingredient line's cost in a way consistent with the
 * Recipe Ingredients tab (RecipeIngredientsTab.computeRow). This honors:
 *  - Sub-recipe lines (uses the sub-recipe's costPerYieldUnit)
 *  - Ingredient conversion layer (Package/Bao → Kg, etc.)
 *  - Legacy purchase_to_base_factor + same-unit-type math
 *
 * Returned cost already has cost_adjust_pct applied.
 */
export function computeRecipeLineAdjustedCost(args: {
  line: { ingredient_id?: string | null; sub_recipe_id?: string | null; unit_id?: string | null; quantity?: number | null; cost_adjust_pct?: number | null };
  ingMap: Record<string, any>;
  unitMap: Record<string, any>;
  subRecipeMap?: Record<string, { yield_unit_id: string | null; costPerYieldUnit: number }>;
}): number {
  const { line, ingMap, unitMap, subRecipeMap } = args;
  const qty = Number(line.quantity) || 0;
  const adjPct = Number(line.cost_adjust_pct) || 0;

  // Sub-recipe path
  if (line.sub_recipe_id) {
    const sub = subRecipeMap?.[line.sub_recipe_id];
    if (!sub) return 0;
    const lineUnit = line.unit_id ? unitMap[line.unit_id] : null;
    const yieldUnit = sub.yield_unit_id ? unitMap[sub.yield_unit_id] : null;
    const sameType = lineUnit && yieldUnit && lineUnit.unit_type === yieldUnit.unit_type;
    const lineFactor = Number(lineUnit?.factor_to_base ?? 1);
    const yieldFactor = Number(yieldUnit?.factor_to_base ?? 1) || 1;
    const qtyInYieldUnit = sameType ? qty * (lineFactor / yieldFactor) : qty;
    return applyAdjustment(qtyInYieldUnit * (sub.costPerYieldUnit ?? 0), adjPct);
  }

  const ing = line.ingredient_id ? ingMap[line.ingredient_id] : null;
  if (!ing) return 0;
  const lineUnit = line.unit_id ? unitMap[line.unit_id] : null;
  const baseUnit = ing.base_unit_id ? unitMap[ing.base_unit_id] : null;
  const purchasePrice = Number(ing.price ?? 0);
  const baseFactor = Number(ing.purchase_to_base_factor ?? 1) || 1;

  // Legacy line cost (default).
  const sameType = lineUnit && baseUnit && lineUnit.unit_type === baseUnit.unit_type;
  const unitFactor = sameType ? Number(lineUnit?.factor_to_base ?? 1) : 1;
  let lineCost = computeLineCost(qty, unitFactor, baseFactor, purchasePrice);

  // Conversion-layer override (mirrors RecipeIngredientsTab).
  if (ing.conversion_enabled && lineUnit) {
    const purchaseUnit = ing.purchase_unit_id ? unitMap[ing.purchase_unit_id] : null;
    const convUnit = ing.conversion_unit_id ? unitMap[ing.conversion_unit_id] : null;
    const conv = computeConvertedLineCost({
      recipeQty: qty,
      lineUnitName: lineUnit?.name_en,
      purchasePrice,
      purchaseUnitName: purchaseUnit?.name_en,
      conversionEnabled: true,
      conversionQty: ing.conversion_qty,
      conversionUnitName: convUnit?.name_en,
    });
    if (conv && !conv.warning) lineCost = conv.lineCost;
  }

  return applyAdjustment(lineCost, adjPct);
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

// ===================== Phase 3: Recipes-as-Ingredients =====================

export interface RecipeAsIngredientOption {
  id: string;            // recipe id
  code: string | null;
  name_en: string;
  yield_quantity: number | null;
  yield_unit_id: string | null;
  costPerYieldUnit: number; // computed production cost / yield qty
  totalCost: number;        // total ingredient cost of the recipe
  currency: CurrencyCode;
}

/** Reason a flagged recipe cannot be published as an ingredient source.
 *  NOTE: zero total cost is intentionally NOT a blocking reason — it only
 *  triggers a soft warning so real kitchen workflows are never blocked. */
export type RecipeAsIngredientUnpublishedReason =
  | 'inactive'
  | 'missing_name'
  | 'missing_yield_quantity'
  | 'missing_yield_unit';

export interface RecipeAsIngredientUnpublished {
  id: string;
  code: string | null;
  name_en: string;
  reasons: RecipeAsIngredientUnpublishedReason[];
}

export interface RecipeAsIngredientResult {
  published: RecipeAsIngredientOption[];
  unpublished: RecipeAsIngredientUnpublished[];
}

/**
 * Lightweight publication check for a single recipe context.
 * Used in Recipe Detail to surface a clear reason when "Use as Ingredient = Yes"
 * but the recipe cannot actually be exposed in other recipe ingredient pickers.
 */
export function useRecipeAsIngredientPublication(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['recipe_as_ingredient_publication', recipeId],
    enabled: !!recipeId,
    queryFn: async (): Promise<{
      eligible: boolean;
      reasons: RecipeAsIngredientUnpublishedReason[];
      totalCost: number;
      costPerYieldUnit: number;
      zeroCost: boolean;
    }> => {
      const { data: r, error } = await supabase
        .from('recipes')
        .select('id, name_en, is_active, use_as_ingredient, yield_quantity, yield_unit_id')
        .eq('id', recipeId!)
        .maybeSingle();
      if (error) throw error;
      const reasons: RecipeAsIngredientUnpublishedReason[] = [];
      if (!r) return { eligible: false, reasons: ['inactive'], totalCost: 0, costPerYieldUnit: 0, zeroCost: true };
      if (!r.is_active) reasons.push('inactive');
      if (!r.name_en?.trim()) reasons.push('missing_name');
      const yq = Number(r.yield_quantity) || 0;
      if (!(yq > 0)) reasons.push('missing_yield_quantity');
      if (!r.yield_unit_id) reasons.push('missing_yield_unit');

      // Compute total ingredient cost for this recipe (linked-to-master lines only).
      const { data: lines } = await supabase
        .from('recipe_ingredients')
        .select('ingredient_id, sub_recipe_id, unit_id, quantity, cost_adjust_pct')
        .eq('recipe_id', recipeId!);
      const ingIds = Array.from(new Set((lines ?? []).map(l => l.ingredient_id).filter(Boolean) as string[]));
      const ingMap: Record<string, any> = {};
      if (ingIds.length) {
        const { data: ings } = await supabase
          .from('ingredients')
          .select('id, price, purchase_to_base_factor, base_unit_id, purchase_unit_id, conversion_enabled, conversion_qty, conversion_unit_id')
          .in('id', ingIds);
        (ings ?? []).forEach(i => { ingMap[i.id] = i; });
      }
      const unitIds = Array.from(new Set([
        ...((lines ?? []).map(l => l.unit_id).filter(Boolean) as string[]),
        ...Object.values(ingMap).map((i: any) => i.base_unit_id).filter(Boolean),
        ...Object.values(ingMap).map((i: any) => i.purchase_unit_id).filter(Boolean),
        ...Object.values(ingMap).map((i: any) => i.conversion_unit_id).filter(Boolean),
      ]));
      const unitMap: Record<string, any> = {};
      if (unitIds.length) {
        const { data: us } = await supabase
          .from('recipe_units').select('id, name_en, factor_to_base, unit_type').in('id', unitIds);
        (us ?? []).forEach(u => { unitMap[u.id] = u; });
      }
      let total = 0;
      (lines ?? []).forEach(l => {
        total += computeRecipeLineAdjustedCost({ line: l as any, ingMap, unitMap });
      });
      // Zero cost is a soft warning, NOT a blocking reason.
      const costPerYieldUnit = yq > 0 ? total / yq : 0;
      return { eligible: reasons.length === 0, reasons, totalCost: total, costPerYieldUnit, zeroCost: !(total > 0) };
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Returns active recipes that are flagged `use_as_ingredient = true`,
 * each with a computed cost-per-yield-unit derived from their own ingredient lines.
 *
 * Cost source rule (per spec):
 *   total_ingredient_cost / yield_quantity  -> recipe cost per yield unit
 * Selling price is NEVER used for this.
 *
 * Architecture note: this lives in a separate query so the Ingredient Master
 * stays untouched. Items are merged in the picker only at display time.
 */
export function useRecipesAsIngredient(excludeRecipeId?: string) {
  return useQuery({
    queryKey: ['recipes_as_ingredient', { excludeRecipeId: excludeRecipeId ?? null }],
    queryFn: async (): Promise<RecipeAsIngredientOption[]> => {
      // 1) Recipes flagged for reuse (active only). Eligibility is enforced
      //    in step 6 below so the picker never receives unpublishable rows.
      const { data: recipes, error: rErr } = await supabase
        .from('recipes')
        .select('id, code, name_en, yield_quantity, yield_unit_id, currency, use_as_ingredient, is_active')
        .eq('use_as_ingredient', true)
        .eq('is_active', true);
      if (rErr) throw rErr;
      let list = (recipes ?? []) as any[];
      if (excludeRecipeId) list = list.filter(r => r.id !== excludeRecipeId); // prevent self-pick
      if (list.length === 0) return [];

      const recipeIds = list.map(r => r.id);

      // 2) Their ingredient lines
      const { data: lines, error: lErr } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id, ingredient_id, sub_recipe_id, unit_id, quantity, cost_adjust_pct')
        .in('recipe_id', recipeIds);
      if (lErr) throw lErr;

      // 3) Lookup ingredients referenced by those lines
      const ingIds = Array.from(new Set((lines ?? []).map(l => l.ingredient_id).filter(Boolean) as string[]));
      const ingMap: Record<string, any> = {};
      if (ingIds.length) {
        const { data: ings } = await supabase
          .from('ingredients')
          .select('id, price, purchase_to_base_factor, base_unit_id, purchase_unit_id, conversion_enabled, conversion_qty, conversion_unit_id')
          .in('id', ingIds);
        (ings ?? []).forEach(i => { ingMap[i.id] = i; });
      }

      // 4) Lookup units used in lines (for unit conversion)
      const unitIds = Array.from(new Set([
        ...((lines ?? []).map(l => l.unit_id).filter(Boolean) as string[]),
        ...Object.values(ingMap).map((i: any) => i.base_unit_id).filter(Boolean),
        ...Object.values(ingMap).map((i: any) => i.purchase_unit_id).filter(Boolean),
        ...Object.values(ingMap).map((i: any) => i.conversion_unit_id).filter(Boolean),
      ]));
      const unitMap: Record<string, any> = {};
      if (unitIds.length) {
        const { data: us } = await supabase
          .from('recipe_units')
          .select('id, name_en, factor_to_base, unit_type')
          .in('id', unitIds);
        (us ?? []).forEach(u => { unitMap[u.id] = u; });
      }

      // 5) Compute total cost per recipe (only counts lines linked to ingredient master).
      // Sub-sub-recipe nesting is intentionally not recursed in this phase (data safety).
      const totals: Record<string, number> = {};
      (lines ?? []).forEach(l => {
        const adj = computeRecipeLineAdjustedCost({ line: l as any, ingMap, unitMap });
        totals[l.recipe_id] = (totals[l.recipe_id] ?? 0) + adj;
      });

      // 6) Map to options with cost-per-yield-unit.
      //    Publication rules: name, yield qty > 0, yield unit.
      //    Zero total cost is ALLOWED — recipe still shows in picker
      //    with costPerYieldUnit = 0 (soft warning surfaced in UI).
      const out: RecipeAsIngredientOption[] = [];
      for (const r of list) {
        const total = totals[r.id] ?? 0;
        const yq = Number(r.yield_quantity) || 0;
        if (!r.name_en?.trim()) continue;
        if (!(yq > 0)) continue;
        if (!r.yield_unit_id) continue;
        out.push({
          id: r.id,
          code: r.code ?? null,
          name_en: r.name_en,
          yield_quantity: r.yield_quantity ?? null,
          yield_unit_id: r.yield_unit_id ?? null,
          costPerYieldUnit: yq > 0 ? total / yq : 0,
          totalCost: total,
          currency: (r.currency ?? 'VND') as CurrencyCode,
        });
      }
      return out;
    },
    staleTime: 60 * 1000,
  });
}
