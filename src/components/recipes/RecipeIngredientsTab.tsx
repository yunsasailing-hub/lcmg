import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Pencil, X, LayoutGrid, Rows3, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { cn } from '@/lib/utils';
import { useIngredients, useRecipeUnits } from '@/hooks/useIngredients';
import {
  useRecipeIngredients, useSaveRecipeIngredients,
  computeLineCost, applyAdjustment,
  useRecipesAsIngredient,
  type RecipeLineInput,
  type RecipeAsIngredientOption,
} from '@/hooks/useRecipes';
import { toast } from '@/hooks/use-toast';
import { computeConvertedLineCost } from '@/lib/ingredientConversion';

interface Props {
  recipeId: string;
  currency?: string | null;
  sellingPrice?: number | null;
  canManage: boolean;
}

interface DraftLine extends RecipeLineInput {
  _key: string; // local stable key
}

const newKey = () => Math.random().toString(36).slice(2);

const toDraft = (l: RecipeLineInput): DraftLine => ({ ...l, _key: l.id ?? newKey() });

const RECIPE_PREFIX = 'rcp:';

const fmt = (n: number, currency?: string | null) => {
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? 'currency' : 'decimal',
      currency: currency || undefined,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
};

export default function RecipeIngredientsTab({ recipeId, currency, sellingPrice, canManage }: Props) {
  const { t } = useTranslation();
  const { data: lines = [], isLoading } = useRecipeIngredients(recipeId);
  const { data: ingredients = [] } = useIngredients(false);
  // Only approved (active) units shown in ingredient lines
  const { data: units = [] } = useRecipeUnits(false);
  const { data: recipeIngredientOptions = [] } = useRecipesAsIngredient(recipeId);
  const save = useSaveRecipeIngredients();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<Record<string, { ingredient?: string; quantity?: string }>>({});
  const [viewMode, setViewMode] = useState<'form' | 'table'>('form');
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  const [lastEditedKey, setLastEditedKey] = useState<string | null>(null);

  const ingMap = useMemo(() => Object.fromEntries(ingredients.map(i => [i.id, i])), [ingredients]);
  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);
  const recipeOptMap = useMemo(
    () => Object.fromEntries(recipeIngredientOptions.map(r => [r.id, r])) as Record<string, RecipeAsIngredientOption>,
    [recipeIngredientOptions],
  );

  // Initialize draft when entering edit OR when lines reload
  useEffect(() => {
    if (!editing) {
      setDraft(lines.map((l, i) => toDraft({
        id: l.id,
        ingredient_id: l.ingredient_id,
        unit_id: l.unit_id,
        quantity: Number(l.quantity) || 0,
        cost_adjust_pct: Number((l as any).cost_adjust_pct) || 0,
        prep_note: l.prep_note,
        sort_order: l.sort_order ?? i,
        sub_recipe_id: (l as any).sub_recipe_id ?? null,
      })));
    }
  }, [lines, editing]);

  // Unified picker options:
  //  - Ingredient Master items (id = ingredient.id)
  //  - Recipe-derived items   (id = `rcp:<recipe.id>`, clearly tagged as Recipe)
  // Recipe-derived items are stored on the line via `sub_recipe_id`, not duplicated into Ingredient Master.
  const ingredientOptions = useMemo(() => {
    const base = ingredients.map(i => ({
      id: i.id,
      label: i.name_en,
      sublabel: i.code ? `${i.code} · ${t('recipes.lines.sourceIngredient')}` : t('recipes.lines.sourceIngredient') as string,
    }));
    const recipes = recipeIngredientOptions.map(r => ({
      id: `${RECIPE_PREFIX}${r.id}`,
      label: r.name_en,
      sublabel: `${r.code ?? '—'} · ${t('recipes.lines.sourceRecipe')} / ${t('recipes.lines.batchRecipe')}`,
    }));
    return [...base, ...recipes];
  }, [ingredients, recipeIngredientOptions, t]);

  // ---- Compute helpers using linked ingredient OR sub-recipe ----
  const computeRow = (line: DraftLine) => {
    // Sub-recipe path: cost from recipe's computed cost-per-yield-unit.
    if (line.sub_recipe_id) {
      const subRecipe = recipeOptMap[line.sub_recipe_id] ?? null;
      const lineUnit = line.unit_id ? unitMap[line.unit_id] : null;
      const yieldUnit = subRecipe?.yield_unit_id ? unitMap[subRecipe.yield_unit_id] : null;
      // Convert line unit -> recipe yield unit when both share the same unit_type.
      const sameType = lineUnit && yieldUnit && lineUnit.unit_type === yieldUnit.unit_type;
      const lineFactor = Number(lineUnit?.factor_to_base ?? 1);
      const yieldFactor = Number(yieldUnit?.factor_to_base ?? 1) || 1;
      const qtyInYieldUnit = sameType
        ? (Number(line.quantity) || 0) * (lineFactor / yieldFactor)
        : (Number(line.quantity) || 0);
      const lineCost = qtyInYieldUnit * (subRecipe?.costPerYieldUnit ?? 0);
      const adjusted = applyAdjustment(lineCost, line.cost_adjust_pct);
      return {
        ing: null,
        lineUnit,
        baseUnit: yieldUnit,
        avgCostPerBaseUnit: subRecipe?.costPerYieldUnit ?? 0,
        lineCost,
        adjusted,
        subRecipe,
      };
    }

    // Ingredient Master path (unchanged).
    const ing = line.ingredient_id ? ingMap[line.ingredient_id] : null;
    const lineUnit = line.unit_id ? unitMap[line.unit_id] : null;
    const baseUnit = ing?.base_unit_id ? unitMap[ing.base_unit_id] : null;

    // Average cost per base unit (display only): price / purchase_to_base_factor
    const purchasePrice = Number(ing?.price ?? 0);
    const baseFactor = Number(ing?.purchase_to_base_factor ?? 1) || 1;
    const avgCostPerBaseUnit = purchasePrice / baseFactor;

    // Line cost uses unit conversion (line unit -> base unit)
    const sameType = lineUnit && baseUnit && lineUnit.unit_type === baseUnit.unit_type;
    const unitFactor = sameType ? Number(lineUnit?.factor_to_base ?? 1) : 1;
    const lineCost = computeLineCost(line.quantity, unitFactor, baseFactor, purchasePrice);
    const adjusted = applyAdjustment(lineCost, line.cost_adjust_pct);

    // Conversion-layer override: if ingredient has conversion_enabled and the line
    // uses the conversion unit (or a same-family variant of it), prefer that math.
    let finalLineCost = lineCost;
    if (ing && (ing as any).conversion_enabled && lineUnit) {
      const purchaseUnit = ing.purchase_unit_id ? unitMap[ing.purchase_unit_id] : null;
      const convUnit = (ing as any).conversion_unit_id ? unitMap[(ing as any).conversion_unit_id] : null;
      const conv = computeConvertedLineCost({
        recipeQty: Number(line.quantity) || 0,
        lineUnitName: lineUnit?.name_en,
        purchasePrice,
        purchaseUnitName: purchaseUnit?.name_en,
        conversionEnabled: true,
        conversionQty: (ing as any).conversion_qty,
        conversionUnitName: convUnit?.name_en,
      });
      if (conv && !conv.warning) {
        finalLineCost = conv.lineCost;
      }
    }
    const adjustedFinal = applyAdjustment(finalLineCost, line.cost_adjust_pct);

    return {
      ing,
      lineUnit,
      baseUnit,
      avgCostPerBaseUnit,
      lineCost: finalLineCost,
      adjusted: adjustedFinal,
      subRecipe: null as RecipeAsIngredientOption | null,
    };
  };

  const total = useMemo(
    () => draft.reduce((s, l) => s + computeRow(l).adjusted, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, ingMap, unitMap],
  );

  // ---- Mutations on draft ----
  const addLine = () => {
    const key = newKey();
    setDraft(d => [
      ...d,
      { _key: key, ingredient_id: null, sub_recipe_id: null, unit_id: null, quantity: 0, cost_adjust_pct: 0, prep_note: null, sort_order: d.length },
    ]);
    setLastAddedKey(key);
    setLastEditedKey(key);
  };
  const duplicateLine = (key: string) => {
    const newK = newKey();
    setDraft(d => {
      const idx = d.findIndex(l => l._key === key);
      if (idx < 0) return d;
      const src = d[idx];
      const copy: DraftLine = { ...src, id: undefined, _key: newK, sort_order: idx + 1 };
      const next = [...d.slice(0, idx + 1), copy, ...d.slice(idx + 1)];
      return next.map((l, i) => ({ ...l, sort_order: i }));
    });
    setLastEditedKey(newK);
  };
  const removeLine = (key: string) => setDraft(d => d.filter(l => l._key !== key).map((l, i) => ({ ...l, sort_order: i })));
  const moveLine = (key: string, dir: -1 | 1) => {
    setDraft(d => {
      const idx = d.findIndex(l => l._key === key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= d.length) return d;
      const next = [...d];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((l, i) => ({ ...l, sort_order: i }));
    });
  };
  const patch = (key: string, p: Partial<DraftLine>) => {
    setDraft(d => d.map(l => l._key === key ? { ...l, ...p } : l));
    setErrors(e => ({ ...e, [key]: { ...e[key], ...(p.ingredient_id !== undefined ? { ingredient: '' } : {}), ...(p.quantity !== undefined ? { quantity: '' } : {}) } }));
    setLastEditedKey(key);
  };

  const onPickIngredient = (key: string, pickedId: string | null) => {
    if (pickedId && pickedId.startsWith(RECIPE_PREFIX)) {
      // Recipe-derived item: store on sub_recipe_id, clear ingredient_id, default unit to recipe yield unit.
      const recipeId = pickedId.slice(RECIPE_PREFIX.length);
      const sub = recipeOptMap[recipeId] ?? null;
      patch(key, {
        ingredient_id: null,
        sub_recipe_id: recipeId,
        unit_id: sub?.yield_unit_id ?? null,
      });
      return;
    }
    const ing = pickedId ? ingMap[pickedId] : null;
    patch(key, {
      ingredient_id: pickedId,
      sub_recipe_id: null,
      unit_id: ing?.base_unit_id ?? null,
    });
  };

  const validate = (): boolean => {
    const errs: typeof errors = {};
    let ok = true;
    draft.forEach(l => {
      const e: { ingredient?: string; quantity?: string } = {};
      if (!l.ingredient_id && !l.sub_recipe_id) { e.ingredient = t('recipes.lines.errors.ingredientRequired'); ok = false; }
      if (!(Number(l.quantity) > 0)) { e.quantity = t('recipes.lines.errors.quantityPositive'); ok = false; }
      if (e.ingredient || e.quantity) errs[l._key] = e;
    });
    setErrors(errs);
    return ok;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast({ title: t('recipes.lines.errors.fixBeforeSave'), variant: 'destructive' });
      return;
    }
    try {
      await save.mutateAsync({
        recipeId,
        lines: draft.map((l, i) => ({
          id: l.id,
          ingredient_id: l.ingredient_id,
          sub_recipe_id: l.sub_recipe_id ?? null,
          unit_id: l.unit_id,
          quantity: Number(l.quantity) || 0,
          cost_adjust_pct: Number(l.cost_adjust_pct) || 0,
          prep_note: l.prep_note?.trim() || null,
          sort_order: i,
        })),
      });
      toast({ title: t('recipes.lines.saved') });
      setEditing(false);
    } catch (e: any) {
      toast({ title: t('common.error'), description: e?.message, variant: 'destructive' });
    }
  };

  const cancel = () => {
    setEditing(false);
    setErrors({});
  };

  // -------------------- VIEW MODE --------------------
  if (!editing) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-lg font-semibold">{t('recipes.lines.title')}</h3>
            {canManage && (
              <Button size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> {t('recipes.lines.editLines')}
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('recipes.lines.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>{t('recipes.lines.cols.ingredient')}</TableHead>
                    <TableHead className="text-right">{t('recipes.lines.cols.qty')}</TableHead>
                    <TableHead>{t('recipes.lines.cols.unit')}</TableHead>
                    <TableHead className="text-right">{t('recipes.lines.cols.avgCost')}</TableHead>
                    <TableHead className="text-right">{t('recipes.lines.cols.lineCost')}</TableHead>
                    <TableHead className="text-right">{t('recipes.lines.cols.adjPct')}</TableHead>
                    <TableHead className="text-right">{t('recipes.lines.cols.adjusted')}</TableHead>
                    <TableHead>{t('recipes.lines.cols.note')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.map((l, idx) => {
                    const { ing, baseUnit, avgCostPerBaseUnit, lineCost, adjusted, subRecipe } = computeRow(l);
                    // Usage Unit / Unit Cost display (no math change).
                    const convEnabled = Boolean((ing as any)?.conversion_enabled);
                    const convUnit = convEnabled && (ing as any)?.conversion_unit_id
                      ? unitMap[(ing as any).conversion_unit_id]
                      : null;
                    const convQty = (ing as any)?.conversion_qty as number | null | undefined;
                    const usageUnit = convUnit ?? baseUnit ?? null;
                    const usageUnitCost = convEnabled && convQty
                      ? (Number(ing?.price ?? 0) / Number(convQty || 1))
                      : avgCostPerBaseUnit;
                    return (
                      <TableRow key={l._key}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {subRecipe ? subRecipe.name_en : (ing?.name_en ?? '—')}
                          </div>
                          {(subRecipe || ing) && (
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {(subRecipe ? subRecipe.code : ing?.code) ?? '—'}
                              </span>
                              {subRecipe && (
                                <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {t('recipes.lines.batchRecipe')}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                        <TableCell>
                          {(() => {
                            const lineU = l.unit_id ? unitMap[l.unit_id] : null;
                            const baseU = ing?.base_unit_id ? unitMap[ing.base_unit_id] : null;
                            const label =
                              lineU?.name_en ?? lineU?.name_vi ?? lineU?.code ??
                              baseU?.name_en ?? baseU?.name_vi ?? baseU?.code ??
                              null;
                            return label || '—';
                          })()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(avgCostPerBaseUnit, currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(lineCost, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.cost_adjust_pct || 0}%</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(adjusted, currency)}</TableCell>
                        <TableCell className="max-w-[14rem] truncate text-sm text-muted-foreground" title={l.prep_note ?? ''}>
                          {l.prep_note || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <CostSummary total={total} sellingPrice={sellingPrice ?? null} currency={currency} />
        </CardContent>
      </Card>
    );
  }

  // -------------------- EDIT MODE --------------------
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold">{t('recipes.lines.editTitle')}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'form' ? 'default' : 'ghost'}
                className="h-8 gap-1"
                onClick={() => setViewMode('form')}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">{t('recipes.lines.formView')}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                className="h-8 gap-1"
                onClick={() => setViewMode('table')}
              >
                <Rows3 className="h-4 w-4" />
                <span className="hidden sm:inline">{t('recipes.lines.tableView')}</span>
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={cancel} disabled={save.isPending}>
              <X className="h-4 w-4" /> {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={save.isPending}>
              <Save className="h-4 w-4" /> {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <TableEditor
            draft={draft}
            errors={errors}
            ingredientOptions={ingredientOptions}
            units={units}
            currency={currency}
            computeRow={computeRow}
            onPickIngredient={onPickIngredient}
            patch={patch}
            removeLine={removeLine}
            moveLine={moveLine}
            addLine={addLine}
            duplicateLine={duplicateLine}
            lastAddedKey={lastAddedKey}
            lastEditedKey={lastEditedKey}
            sellingPrice={sellingPrice ?? null}
            total={total}
          />
        ) : (
        <div className="space-y-3">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('recipes.lines.emptyEdit')}</p>
          )}

          {draft.map((l, idx) => {
            const { ing, lineCost, adjusted, baseUnit, subRecipe } = computeRow(l);
            const err = errors[l._key];
            return (
              <div key={l._key} className="rounded-md border p-3 sm:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    {t('recipes.lines.line')} {idx + 1}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => moveLine(l._key, -1)} disabled={idx === 0} title={t('recipes.lines.moveUp') as string}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => moveLine(l._key, 1)} disabled={idx === draft.length - 1} title={t('recipes.lines.moveDown') as string}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeLine(l._key)} title={t('recipes.lines.remove') as string}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <label className="text-xs text-muted-foreground">{t('recipes.lines.cols.ingredient')} *</label>
                    <SearchableCombobox
                      value={l.sub_recipe_id ? `${RECIPE_PREFIX}${l.sub_recipe_id}` : (l.ingredient_id ?? '')}
                      onChange={(v) => onPickIngredient(l._key, v || null)}
                      options={ingredientOptions}
                      placeholder={t('recipes.lines.searchIngredient') as string}
                      searchPlaceholder={t('recipes.lines.searchIngredient') as string}
                      emptyText={t('recipes.lines.noIngredients') as string}
                    />
                    {err?.ingredient && <p className="mt-1 text-xs text-destructive">{err.ingredient}</p>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">{t('recipes.lines.cols.qty')} *</label>
                    <Input
                      type="number" inputMode="decimal" min="0" step="any"
                      value={Number.isFinite(l.quantity) ? l.quantity : 0}
                      onChange={e => patch(l._key, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                    {err?.quantity && <p className="mt-1 text-xs text-destructive">{err.quantity}</p>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">{t('recipes.lines.cols.unit')}</label>
                    <Select value={l.unit_id ?? ''} onValueChange={v => patch(l._key, { unit_id: v || null })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {units.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name_en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">{t('recipes.lines.cols.adjPct')}</label>
                    <Input
                      type="number" inputMode="decimal" step="any"
                      value={Number.isFinite(l.cost_adjust_pct) ? l.cost_adjust_pct : 0}
                      onChange={e => patch(l._key, { cost_adjust_pct: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                  </div>

                  <div className="sm:col-span-1 flex flex-col justify-end">
                    <span className="text-xs text-muted-foreground">{t('recipes.lines.cols.lineCost')}</span>
                    <span className="text-sm tabular-nums">{fmt(lineCost, currency)}</span>
                  </div>

                  <div className="sm:col-span-12">
                    <label className="text-xs text-muted-foreground">{t('recipes.lines.cols.note')}</label>
                    <Input
                      value={l.prep_note ?? ''}
                      onChange={e => patch(l._key, { prep_note: e.target.value })}
                      placeholder={t('recipes.lines.notePh') as string}
                    />
                  </div>

                  <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                    <span>
                      {subRecipe
                        ? `${t('recipes.lines.sourceRecipe')} / ${t('recipes.lines.batchRecipe')}: ${subRecipe.code ?? '—'} · ${fmt(subRecipe.costPerYieldUnit, currency)}`
                        : ing
                        ? `${t('recipes.lines.ingredientCode')}: ${ing.code ?? '—'} · ${t('recipes.lines.basePrice')}: ${fmt(Number(ing.price ?? 0), currency)}`
                        : t('recipes.lines.noIngredientSelected')}
                    </span>
                    <span className="font-medium text-foreground">
                      {t('recipes.lines.cols.adjusted')}: <span className="tabular-nums">{fmt(adjusted, currency)}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}

        <div className="border-t pt-3">
          {viewMode === 'form' && (
            <div className="mb-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4" /> {t('recipes.lines.addLine')}
              </Button>
            </div>
          )}
          <CostSummary total={total} sellingPrice={sellingPrice ?? null} currency={currency} />
        </div>
      </CardContent>
    </Card>
  );
}

function CostSummary({
  total,
  sellingPrice,
  currency,
}: {
  total: number;
  sellingPrice: number | null;
  currency?: string | null;
}) {
  const { t } = useTranslation();
  const hasSelling = sellingPrice != null && Number(sellingPrice) > 0;
  const foodCostPct = hasSelling ? (total / Number(sellingPrice)) * 100 : null;

  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('recipes.lines.totalCost')}
          </div>
          <div className="font-heading text-xl font-semibold tabular-nums">
            {fmt(total, currency)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('recipes.summary.sellingPrice')}
          </div>
          <div className="font-heading text-xl font-semibold tabular-nums">
            {hasSelling ? fmt(Number(sellingPrice), currency) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('recipes.summary.foodCostPct')}
          </div>
          <div className="font-heading text-xl font-semibold tabular-nums">
            {foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : (
              <span className="text-base font-normal text-muted-foreground">
                {t('recipes.summary.noSellingPrice')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------- TABLE EDITOR --------------------
interface TableEditorProps {
  draft: DraftLine[];
  errors: Record<string, { ingredient?: string; quantity?: string }>;
  ingredientOptions: { id: string; label: string; sublabel?: string }[];
  units: { id: string; code: string; name_en: string }[];
  currency?: string | null;
  computeRow: (line: DraftLine) => {
    ing: any;
    lineUnit: any;
    baseUnit: any;
    avgCostPerBaseUnit: number;
    lineCost: number;
    adjusted: number;
  };
  onPickIngredient: (key: string, ingredientId: string | null) => void;
  patch: (key: string, p: Partial<DraftLine>) => void;
  removeLine: (key: string) => void;
  moveLine: (key: string, dir: -1 | 1) => void;
  addLine: () => void;
  duplicateLine: (key: string) => void;
  lastAddedKey: string | null;
  lastEditedKey: string | null;
  total: number;
  sellingPrice: number | null;
}

function TableEditor({
  draft, errors, ingredientOptions, units, currency,
  computeRow, onPickIngredient, patch, removeLine, moveLine, addLine,
  duplicateLine, lastAddedKey, lastEditedKey, total, sellingPrice,
}: TableEditorProps) {
  const { t } = useTranslation();
  const hasSelling = sellingPrice != null && Number(sellingPrice) > 0;
  const foodCostPct = hasSelling ? (total / Number(sellingPrice!)) * 100 : null;
  return (
    <div className="space-y-3 pb-20">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="min-w-[14rem]">{t('recipes.lines.cols.ingredient')} *</TableHead>
              <TableHead className="w-24 text-right">{t('recipes.lines.cols.qty')} *</TableHead>
              <TableHead className="w-28">{t('recipes.lines.cols.unit')}</TableHead>
              <TableHead className="w-32 text-right">{t('recipes.lines.cols.avgCost')}</TableHead>
              <TableHead className="w-24 text-right">{t('recipes.lines.cols.adjPct')}</TableHead>
              <TableHead className="w-28 text-right">{t('recipes.lines.cols.lineCost')}</TableHead>
              <TableHead className="w-28 text-right">{t('recipes.lines.cols.adjusted')}</TableHead>
              <TableHead className="w-32 text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                  {t('recipes.lines.emptyEdit')}
                </TableCell>
              </TableRow>
            )}
            {draft.map((l, idx) => {
              const { baseUnit, avgCostPerBaseUnit, lineCost, adjusted } = computeRow(l);
              const err = errors[l._key];
              const invalid = !!(err?.ingredient || err?.quantity);
              const isEdited = lastEditedKey === l._key;
              const isLast = idx === draft.length - 1;
              return (
                <TableRow
                  key={l._key}
                  className={cn(
                    'transition-colors',
                    invalid && 'bg-destructive/5',
                    !invalid && isEdited && 'bg-accent/40',
                  )}
                >
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <SearchableCombobox
                      value={l.sub_recipe_id ? `${RECIPE_PREFIX}${l.sub_recipe_id}` : (l.ingredient_id ?? '')}
                      onChange={(v) => onPickIngredient(l._key, v || null)}
                      options={ingredientOptions}
                      placeholder={t('recipes.lines.searchIngredient') as string}
                      searchPlaceholder={t('recipes.lines.searchIngredient') as string}
                      emptyText={t('recipes.lines.noIngredients') as string}
                      autoOpen={lastAddedKey === l._key && !l.ingredient_id && !l.sub_recipe_id}
                    />
                    {err?.ingredient && (
                      <p className="mt-1 text-xs text-destructive">{err.ingredient}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" inputMode="decimal" min="0" step="any"
                      className={cn('h-9 text-right tabular-nums', err?.quantity && 'border-destructive')}
                      value={Number.isFinite(l.quantity) ? l.quantity : 0}
                      onChange={e => patch(l._key, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (isLast) addLine();
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={l.unit_id ?? ''} onValueChange={v => patch(l._key, { unit_id: v || null })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {units.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name_en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {fmt(avgCostPerBaseUnit, currency)}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" inputMode="decimal" step="any"
                      className="h-9 text-right tabular-nums"
                      value={Number.isFinite(l.cost_adjust_pct) ? l.cost_adjust_pct : 0}
                      onChange={e => patch(l._key, { cost_adjust_pct: e.target.value === '' ? 0 : Number(e.target.value) })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (isLast) addLine();
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(lineCost, currency)}</TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">{fmt(adjusted, currency)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveLine(l._key, -1)} disabled={idx === 0} title={t('recipes.lines.moveUp') as string}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveLine(l._key, 1)} disabled={idx === draft.length - 1} title={t('recipes.lines.moveDown') as string}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => duplicateLine(l._key)} title={t('recipes.lines.duplicate') as string}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLine(l._key)} title={t('recipes.lines.remove') as string}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={addLine}>
          <Plus className="h-4 w-4" /> {t('recipes.lines.quickAdd')}
        </Button>
      </div>
      {/* Sticky total cost bar */}
      <div className="sticky bottom-0 left-0 right-0 z-10 -mx-4 mt-3 border-t bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-muted-foreground">{t('recipes.lines.totalCost')}</span>
            <span className="font-heading text-lg font-semibold tabular-nums">{fmt(total, currency)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
            <span>
              {t('recipes.summary.sellingPrice')}:{' '}
              <span className="tabular-nums text-foreground">{hasSelling ? fmt(Number(sellingPrice), currency) : '—'}</span>
            </span>
            <span>
              {t('recipes.summary.foodCostPct')}:{' '}
              <span className="tabular-nums text-foreground">{foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'}</span>
            </span>
            <span className="text-xs">{t('recipes.lines.lines')}: <span className="tabular-nums text-foreground">{draft.length}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
