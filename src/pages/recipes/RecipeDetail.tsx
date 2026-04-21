import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, Archive, ArchiveRestore, Save, X } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import RecipeIngredientsTab from '@/components/recipes/RecipeIngredientsTab';
import RecipeProcedureTab from '@/components/recipes/RecipeProcedureTab';
import RecipeMediaTab from '@/components/recipes/RecipeMediaTab';
import RecipeServiceInfoTab from '@/components/recipes/RecipeServiceInfoTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useChecklists';
import { useRecipeCategories, useRecipeUnits } from '@/hooks/useIngredients';
import {
  useRecipe, useUpsertRecipe, useArchiveRecipe, useRecipeTypes, isRecipeCodeTaken,
  RECIPE_CURRENCIES, RECIPE_DEPARTMENTS,
  type CurrencyCode, type RecipeDepartment,
} from '@/hooks/useRecipes';
import { toast } from '@/hooks/use-toast';

const NONE = '__none__';
const GLOBAL = '__global__';

interface FormState {
  code: string;
  name_en: string;
  is_active: boolean;
  category_id: string;
  recipe_type_id: string;
  department: string;
  branch_id: string;
  selling_price: string;
  currency: CurrencyCode;
  yield_quantity: string;
  yield_unit_id: string;
  portion_quantity: string;
  portion_unit: string;
  shelf_life: string;
  description: string;
  internal_memo: string;
}

const EMPTY: FormState = {
  code: '',
  name_en: '',
  is_active: true,
  category_id: NONE,
  recipe_type_id: NONE,
  department: NONE,
  branch_id: GLOBAL,
  selling_price: '',
  currency: 'VND',
  yield_quantity: '',
  yield_unit_id: NONE,
  portion_quantity: '',
  portion_unit: '',
  shelf_life: '',
  description: '',
  internal_memo: '',
};

/** Compact info chip used in the consultation header strip. Hides itself when value is empty. */
function InfoChip({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '' || value === '—';
  if (empty) return null;
  return (
    <div className="min-w-[8rem] rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-4">
    <h3 className="text-sm font-heading font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </div>
);

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);

  const { data: recipe, isLoading } = useRecipe(isNew ? undefined : id);
  const { data: categories = [] } = useRecipeCategories(true);
  const { data: types = [] } = useRecipeTypes(true);
  const { data: units = [] } = useRecipeUnits(true);
  const { data: branches = [] } = useBranches();
  const upsert = useUpsertRecipe();
  const archive = useArchiveRecipe();

  const [editing, setEditing] = useState(isNew || searchParams.get('edit') === '1');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY);
      setEditing(true);
      return;
    }
    if (recipe) {
      setForm({
        code: recipe.code ?? '',
        name_en: recipe.name_en ?? '',
        is_active: recipe.is_active,
        category_id: recipe.category_id ?? NONE,
        recipe_type_id: recipe.recipe_type_id ?? NONE,
        department: recipe.department ?? NONE,
        branch_id: recipe.branch_id ?? GLOBAL,
        selling_price: recipe.selling_price != null ? String(recipe.selling_price) : '',
        currency: (recipe.currency ?? 'VND') as CurrencyCode,
        yield_quantity: recipe.yield_quantity != null ? String(recipe.yield_quantity) : '',
        yield_unit_id: recipe.yield_unit_id ?? NONE,
        portion_quantity: recipe.portion_quantity != null ? String(recipe.portion_quantity) : '',
        portion_unit: recipe.portion_unit ?? '',
        shelf_life: recipe.shelf_life ?? '',
        description: recipe.description ?? '',
        internal_memo: recipe.internal_memo ?? '',
      });
    }
  }, [recipe, isNew]);

  useEffect(() => {
    if (searchParams.get('edit') === '1' && !editing && canManage) setEditing(true);
  }, [searchParams, editing, canManage]);

  const categoryMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const typeMap = useMemo(() => Object.fromEntries(types.map(x => [x.id, x])), [types]);
  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);
  const branchMap = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
    setErrors(prev => ({ ...prev, [k]: '' }));
  };

  const validate = async (): Promise<boolean> => {
    const e: Record<string, string> = {};
    const code = form.code.trim();
    const name = form.name_en.trim();
    if (!code) e.code = t('recipes.list.errors.codeRequired');
    if (!name) e.name_en = t('recipes.list.errors.nameRequired');
    if (form.category_id === NONE) e.category_id = t('recipes.list.errors.categoryRequired');
    if (form.recipe_type_id === NONE) e.recipe_type_id = t('recipes.list.errors.typeRequired');
    if (form.department === NONE) e.department = t('recipes.list.errors.departmentRequired');

    const numField = (val: string, key: string) => {
      if (val.trim()) {
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0) e[key] = t('recipes.list.errors.numberInvalid');
      }
    };
    numField(form.selling_price, 'selling_price');
    numField(form.yield_quantity, 'yield_quantity');
    numField(form.portion_quantity, 'portion_quantity');

    if (code && !e.code) {
      try {
        const taken = await isRecipeCodeTaken(code, isNew ? undefined : id);
        if (taken) e.code = t('recipes.list.errors.codeDuplicate');
      } catch { /* ignore */ }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!(await validate())) return;
    try {
      const payload: any = {
        code: form.code.trim(),
        name_en: form.name_en.trim(),
        is_active: form.is_active,
        category_id: form.category_id === NONE ? null : form.category_id,
        recipe_type_id: form.recipe_type_id === NONE ? null : form.recipe_type_id,
        department: form.department === NONE ? null : (form.department as RecipeDepartment),
        branch_id: form.branch_id === GLOBAL ? null : form.branch_id,
        selling_price: form.selling_price.trim() ? Number(form.selling_price) : null,
        currency: form.currency,
        yield_quantity: form.yield_quantity.trim() ? Number(form.yield_quantity) : null,
        yield_unit_id: form.yield_unit_id === NONE ? null : form.yield_unit_id,
        portion_quantity: form.portion_quantity.trim() ? Number(form.portion_quantity) : null,
        portion_unit: form.portion_unit.trim() || null,
        shelf_life: form.shelf_life.trim() || null,
        description: form.description.trim() || null,
        internal_memo: form.internal_memo.trim() || null,
        // Keep legacy 'kind' satisfied (NOT NULL DEFAULT 'dish'); leave as-is when editing.
      };
      if (!isNew) payload.id = id;
      const saved = await upsert.mutateAsync(payload);
      toast({ title: isNew ? t('recipes.list.created') : t('recipes.list.updated') });
      if (isNew) {
        navigate(`/recipes/list/${saved.id}`, { replace: true });
      } else {
        setEditing(false);
        if (searchParams.get('edit')) {
          searchParams.delete('edit');
          setSearchParams(searchParams, { replace: true });
        }
      }
    } catch (e: any) {
      toast({ title: t('recipes.list.saveFailed'), description: e?.message, variant: 'destructive' });
    }
  };

  const handleArchive = async () => {
    if (!recipe) return;
    try {
      await archive.mutateAsync({ id: recipe.id, is_active: !recipe.is_active });
      toast({ title: recipe.is_active ? t('recipes.list.archived') : t('recipes.list.restored') });
      setArchiveOpen(false);
    } catch (e: any) {
      toast({ title: t('common.error'), description: e?.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <RecipesShell title={t('recipes.list.detailTitle')}>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </RecipesShell>
    );
  }
  if (!isNew && !recipe) {
    return (
      <RecipesShell title={t('recipes.list.detailTitle')}>
        <p className="text-sm text-muted-foreground">{t('recipes.list.notFound')}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/recipes/list')}>
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </Button>
      </RecipesShell>
    );
  }

  const title = isNew ? t('recipes.list.add') : (recipe?.name_en ?? t('recipes.list.detailTitle'));

  return (
    <RecipesShell
      title={title}
      description={isNew ? t('recipes.list.subtitle') : t('recipes.list.detailTitle')}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/recipes/list')}>
            <ArrowLeft className="h-4 w-4" /> {t('common.back')}
          </Button>
          {!isNew && canManage && !editing && (
            <>
              <Button size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> {t('common.edit')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setArchiveOpen(true)}>
                {recipe?.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                {recipe?.is_active ? t('recipes.list.archive') : t('recipes.list.restore')}
              </Button>
            </>
          )}
        </div>
      }
    >
      {!canManage && !isNew && (
        <p className="mb-4 text-sm text-muted-foreground">{t('recipes.list.viewOnly')}</p>
      )}

      {editing && canManage ? (
        <Card>
          <CardContent className="space-y-8 p-6">
            {/* A. MASTER INFO */}
            <Section title={t('recipes.list.sections.master')}>
              <div>
                <Label htmlFor="code">{t('recipes.list.fields.code')} *</Label>
                <Input
                  id="code" value={form.code}
                  onChange={e => update('code', e.target.value)}
                  onBlur={e => update('code', e.target.value.trim())}
                />
                {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
              </div>
              <div>
                <Label htmlFor="name">{t('recipes.list.fields.name')} *</Label>
                <Input
                  id="name" value={form.name_en}
                  onChange={e => update('name_en', e.target.value)}
                  onBlur={e => update('name_en', e.target.value.trim())}
                />
                {errors.name_en && <p className="mt-1 text-xs text-destructive">{errors.name_en}</p>}
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch id="active" checked={form.is_active} onCheckedChange={v => update('is_active', v)} />
                <Label htmlFor="active">
                  {t('recipes.list.fields.active')}: {form.is_active ? t('recipes.list.activeYes') : t('recipes.list.activeNot')}
                </Label>
              </div>
            </Section>

            {/* B. CLASSIFICATION */}
            <Section title={t('recipes.list.sections.classification')}>
              <div>
                <Label>{t('recipes.list.fields.category')} *</Label>
                <Select value={form.category_id} onValueChange={v => update('category_id', v)}>
                  <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category_id && <p className="mt-1 text-xs text-destructive">{errors.category_id}</p>}
              </div>
              <div>
                <Label>{t('recipes.list.fields.type')} *</Label>
                <Select value={form.recipe_type_id} onValueChange={v => update('recipe_type_id', v)}>
                  <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                    {types.map(x => (
                      <SelectItem key={x.id} value={x.id}>{x.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.recipe_type_id && <p className="mt-1 text-xs text-destructive">{errors.recipe_type_id}</p>}
              </div>
              <div>
                <Label>{t('recipes.list.fields.department')} *</Label>
                <Select value={form.department} onValueChange={v => update('department', v)}>
                  <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                    {RECIPE_DEPARTMENTS.map(d => (
                      <SelectItem key={d} value={d}>{t(`departments.${d}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.department && <p className="mt-1 text-xs text-destructive">{errors.department}</p>}
              </div>
              <div>
                <Label>{t('recipes.list.fields.branch')}</Label>
                <Select value={form.branch_id} onValueChange={v => update('branch_id', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLOBAL}>{t('recipes.list.global')}</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Section>

            {/* C. COMMERCIAL */}
            <Section title={t('recipes.list.sections.commercial')}>
              <div>
                <Label htmlFor="sp">{t('recipes.list.fields.sellingPrice')}</Label>
                <Input
                  id="sp" type="number" inputMode="decimal" min="0" step="any"
                  value={form.selling_price}
                  onChange={e => update('selling_price', e.target.value)}
                />
                {errors.selling_price && <p className="mt-1 text-xs text-destructive">{errors.selling_price}</p>}
              </div>
              <div>
                <Label>{t('recipes.list.fields.currency')}</Label>
                <Select value={form.currency} onValueChange={v => update('currency', v as CurrencyCode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECIPE_CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Section>

            {/* D. YIELD & PORTION */}
            <Section title={t('recipes.list.sections.yieldPortion')}>
              <div>
                <Label htmlFor="yq">{t('recipes.list.fields.yieldQuantity')}</Label>
                <Input
                  id="yq" type="number" inputMode="decimal" min="0" step="any"
                  value={form.yield_quantity}
                  onChange={e => update('yield_quantity', e.target.value)}
                />
                {errors.yield_quantity && <p className="mt-1 text-xs text-destructive">{errors.yield_quantity}</p>}
              </div>
              <div>
                <Label>{t('recipes.list.fields.yieldUnit')}</Label>
                <Select value={form.yield_unit_id} onValueChange={v => update('yield_unit_id', v)}>
                  <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                    {units.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.code} — {u.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pq">{t('recipes.list.fields.portionQuantity')}</Label>
                <Input
                  id="pq" type="number" inputMode="decimal" min="0" step="any"
                  value={form.portion_quantity}
                  onChange={e => update('portion_quantity', e.target.value)}
                />
                {errors.portion_quantity && <p className="mt-1 text-xs text-destructive">{errors.portion_quantity}</p>}
              </div>
              <div>
                <Label htmlFor="pu">{t('recipes.list.fields.portionUnit')}</Label>
                <Input
                  id="pu" value={form.portion_unit}
                  onChange={e => update('portion_unit', e.target.value)}
                  placeholder={t('recipes.list.fields.portionUnitPh')}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="sl">{t('recipes.list.fields.shelfLife')}</Label>
                <Input
                  id="sl" value={form.shelf_life}
                  onChange={e => update('shelf_life', e.target.value)}
                  placeholder={t('recipes.list.fields.shelfLifePh')}
                />
              </div>
            </Section>

            {/* E. NOTES */}
            <Section title={t('recipes.list.sections.notes')}>
              <div className="sm:col-span-2">
                <Label htmlFor="desc">{t('recipes.list.fields.description')}</Label>
                <Textarea
                  id="desc" rows={3} value={form.description}
                  onChange={e => update('description', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="memo">{t('recipes.list.fields.internalMemo')}</Label>
                <Textarea
                  id="memo" rows={3} value={form.internal_memo}
                  onChange={e => update('internal_memo', e.target.value)}
                />
              </div>
            </Section>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (isNew) navigate('/recipes/list');
                  else setEditing(false);
                }}
                disabled={upsert.isPending}
              >
                <X className="h-4 w-4" /> {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={upsert.isPending}>
                <Save className="h-4 w-4" /> {upsert.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : recipe ? (
        <div className="space-y-6">
          {/* Compact consultation hero — recipe sheet style */}
          <Card>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={recipe.is_active ? 'default' : 'secondary'}>
                      {recipe.is_active ? t('recipes.list.activeYes') : t('recipes.list.activeNot')}
                    </Badge>
                    {recipe.recipe_type_id && (
                      <Badge variant="outline">{typeMap[recipe.recipe_type_id]?.name_en ?? '—'}</Badge>
                    )}
                    {recipe.category_id && (
                      <Badge variant="outline">{categoryMap[recipe.category_id]?.name_en ?? '—'}</Badge>
                    )}
                    {recipe.department && (
                      <Badge variant="outline">{t(`departments.${recipe.department}`)}</Badge>
                    )}
                  </div>
                  <h2 className="font-heading text-2xl font-semibold leading-tight sm:text-3xl">
                    {recipe.name_en}
                  </h2>
                  {recipe.code && (
                    <div className="font-mono text-xs text-muted-foreground">{recipe.code}</div>
                  )}
                  {recipe.description && (
                    <p className="max-w-3xl whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
                      {recipe.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Compact info strip — chips hide themselves when empty */}
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <InfoChip
                  label={t('recipes.list.fields.sellingPrice')}
                  value={recipe.selling_price != null ? `${recipe.selling_price} ${recipe.currency ?? ''}` : null}
                />
                <InfoChip
                  label={t('recipes.list.fields.yieldQuantity')}
                  value={
                    recipe.yield_quantity != null
                      ? `${recipe.yield_quantity} ${recipe.yield_unit_id ? unitMap[recipe.yield_unit_id]?.code ?? '' : ''}`.trim()
                      : null
                  }
                />
                <InfoChip
                  label={t('recipes.list.fields.portionQuantity')}
                  value={
                    recipe.portion_quantity != null
                      ? `${recipe.portion_quantity} ${recipe.portion_unit ?? ''}`.trim()
                      : null
                  }
                />
                <InfoChip label={t('recipes.list.fields.shelfLife')} value={recipe.shelf_life} />
                <InfoChip
                  label={t('recipes.list.fields.branch')}
                  value={recipe.branch_id ? branchMap[recipe.branch_id]?.name ?? null : t('recipes.list.global')}
                />
              </div>

              {recipe.internal_memo && canManage && (
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('recipes.list.fields.internalMemo')}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{recipe.internal_memo}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                <span>{t('recipes.list.audit.createdAt')}: {formatDateTime(recipe.created_at)}</span>
                <span>{t('recipes.list.audit.updatedAt')}: {formatDateTime(recipe.updated_at)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Phase 2: Ingredients & Cost */}
          <RecipeIngredientsTab recipeId={recipe.id} currency={recipe.currency} sellingPrice={recipe.selling_price ?? null} canManage={canManage} />

          {/* Phase 3: Kitchen Procedure */}
          <RecipeProcedureTab recipeId={recipe.id} canManage={canManage} />

          {/* Phase 4: Media & References */}
          <RecipeMediaTab recipeId={recipe.id} canManage={canManage} />

          {/* Phase 5: Service / Sales Information */}
          <RecipeServiceInfoTab recipeId={recipe.id} canManage={canManage} />
        </div>
      ) : null}

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {recipe?.is_active ? t('recipes.list.archiveConfirmTitle') : t('recipes.list.restoreConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {recipe?.is_active ? t('recipes.list.archiveConfirmDesc') : t('recipes.list.restoreConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RecipesShell>
  );
}
