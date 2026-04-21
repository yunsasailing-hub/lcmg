import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Pencil, X, LayoutGrid, Rows3 } from 'lucide-react';
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
  type RecipeLineInput,
} from '@/hooks/useRecipes';
import { toast } from '@/hooks/use-toast';

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
  const { data: units = [] } = useRecipeUnits(true);
  const save = useSaveRecipeIngredients();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<Record<string, { ingredient?: string; quantity?: string }>>({});
  const [viewMode, setViewMode] = useState<'form' | 'table'>('form');

  const ingMap = useMemo(() => Object.fromEntries(ingredients.map(i => [i.id, i])), [ingredients]);
  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);

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
      })));
    }
  }, [lines, editing]);

  const ingredientOptions = useMemo(
    () => ingredients.map(i => ({
      id: i.id,
      label: i.name_en,
      sublabel: i.code ?? undefined,
    })),
    [ingredients],
  );

  // ---- Compute helpers using linked ingredient ----
  const computeRow = (line: DraftLine) => {
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

    return { ing, lineUnit, baseUnit, avgCostPerBaseUnit, lineCost, adjusted };
  };

  const total = useMemo(
    () => draft.reduce((s, l) => s + computeRow(l).adjusted, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, ingMap, unitMap],
  );

  // ---- Mutations on draft ----
  const addLine = () => {
    setDraft(d => [
      ...d,
      { _key: newKey(), ingredient_id: null, unit_id: null, quantity: 0, cost_adjust_pct: 0, prep_note: null, sort_order: d.length },
    ]);
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
  };

  const onPickIngredient = (key: string, ingredientId: string | null) => {
    const ing = ingredientId ? ingMap[ingredientId] : null;
    patch(key, {
      ingredient_id: ingredientId,
      // default unit to ingredient's base unit
      unit_id: ing?.base_unit_id ?? null,
    });
  };

  const validate = (): boolean => {
    const errs: typeof errors = {};
    let ok = true;
    draft.forEach(l => {
      const e: { ingredient?: string; quantity?: string } = {};
      if (!l.ingredient_id) { e.ingredient = t('recipes.lines.errors.ingredientRequired'); ok = false; }
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
                    const { ing, baseUnit, avgCostPerBaseUnit, lineCost, adjusted } = computeRow(l);
                    return (
                      <TableRow key={l._key}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">{ing?.name_en ?? '—'}</div>
                          <div className="font-mono text-xs text-muted-foreground">{ing?.code ?? ''}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                        <TableCell>{l.unit_id ? unitMap[l.unit_id]?.code ?? '—' : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(avgCostPerBaseUnit, currency)}
                          {baseUnit ? <span className="ml-1 text-xs text-muted-foreground">/{baseUnit.code}</span> : null}
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cancel} disabled={save.isPending}>
              <X className="h-4 w-4" /> {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={save.isPending}>
              <Save className="h-4 w-4" /> {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('recipes.lines.emptyEdit')}</p>
          )}

          {draft.map((l, idx) => {
            const { ing, lineCost, adjusted, baseUnit } = computeRow(l);
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
                      value={l.ingredient_id ?? ''}
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
                          <SelectItem key={u.id} value={u.id}>{u.code}</SelectItem>
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
                      {ing
                        ? `${t('recipes.lines.ingredientCode')}: ${ing.code ?? '—'} · ${t('recipes.lines.basePrice')}: ${fmt(Number(ing.price ?? 0), currency)}${baseUnit ? ` /${baseUnit.code}` : ''}`
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

        <div className="border-t pt-3">
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" /> {t('recipes.lines.addLine')}
            </Button>
          </div>
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
