import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, Archive, ArchiveRestore, Save, X } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useRecipeUnits } from '@/hooks/useIngredients';
import {
  useRecipe, useUpsertRecipe, useArchiveRecipe, isRecipeCodeTaken,
  RECIPE_KINDS, RECIPE_STATUSES,
  type RecipeKind, type RecipeStatus, type RecipeDepartment,
} from '@/hooks/useRecipes';
import { toast } from '@/hooks/use-toast';

const DEPARTMENTS: RecipeDepartment[] = ['management', 'kitchen', 'pizza', 'service', 'bar', 'office'];
const NONE = '__none__';

interface FormState {
  name_en: string;
  code: string;
  kind: RecipeKind;
  status: RecipeStatus;
  department: string;
  branch_id: string;
  yield_quantity: string;
  yield_unit_id: string;
  description: string;
  notes: string;
}

const EMPTY: FormState = {
  name_en: '',
  code: '',
  kind: 'dish',
  status: 'draft',
  department: NONE,
  branch_id: NONE,
  yield_quantity: '',
  yield_unit_id: NONE,
  description: '',
  notes: '',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

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
        name_en: recipe.name_en ?? '',
        code: recipe.code ?? '',
        kind: recipe.kind,
        status: recipe.status,
        department: recipe.department ?? NONE,
        branch_id: recipe.branch_id ?? NONE,
        yield_quantity: recipe.yield_quantity != null ? String(recipe.yield_quantity) : '',
        yield_unit_id: recipe.yield_unit_id ?? NONE,
        description: recipe.description ?? '',
        notes: recipe.notes ?? '',
      });
    }
  }, [recipe, isNew]);

  useEffect(() => {
    if (searchParams.get('edit') === '1' && !editing) setEditing(true);
  }, [searchParams, editing]);

  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);
  const branchMap = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
    setErrors(prev => ({ ...prev, [k]: '' }));
  };

  const validate = async (): Promise<boolean> => {
    const e: Record<string, string> = {};
    const name = form.name_en.trim();
    if (!name) e.name_en = t('recipes.list.errors.nameRequired');

    if (form.yield_quantity.trim()) {
      const n = Number(form.yield_quantity);
      if (!Number.isFinite(n) || n < 0) e.yield_quantity = t('recipes.list.errors.yieldInvalid');
    }

    const code = form.code.trim();
    if (code) {
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
        name_en: form.name_en.trim(),
        code: form.code.trim() || null,
        kind: form.kind,
        status: form.status,
        department: form.department === NONE ? null : form.department,
        branch_id: form.branch_id === NONE ? null : form.branch_id,
        yield_quantity: form.yield_quantity.trim() ? Number(form.yield_quantity) : null,
        yield_unit_id: form.yield_unit_id === NONE ? null : form.yield_unit_id,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
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
      toast({
        title: recipe.is_active ? t('recipes.list.archived') : t('recipes.list.restored'),
      });
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
      {!canManage && !editing && !isNew && (
        <p className="mb-4 text-sm text-muted-foreground">{t('recipes.list.viewOnly')}</p>
      )}

      {editing ? (
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">{t('recipes.list.fields.name')} *</Label>
                <Input
                  id="name" value={form.name_en}
                  onChange={e => update('name_en', e.target.value)}
                  onBlur={e => update('name_en', e.target.value.trim())}
                />
                {errors.name_en && <p className="mt-1 text-xs text-destructive">{errors.name_en}</p>}
              </div>

              <div>
                <Label htmlFor="code">{t('recipes.list.fields.code')}</Label>
                <Input
                  id="code" value={form.code}
                  onChange={e => update('code', e.target.value)}
                  onBlur={e => update('code', e.target.value.trim())}
                />
                {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
              </div>

              <div>
                <Label>{t('recipes.list.fields.kind')} *</Label>
                <Select value={form.kind} onValueChange={v => update('kind', v as RecipeKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECIPE_KINDS.map(k => (
                      <SelectItem key={k} value={k}>{t(`recipes.kind.${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('recipes.list.fields.status')} *</Label>
                <Select value={form.status} onValueChange={v => update('status', v as RecipeStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECIPE_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{t(`recipes.status.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('recipes.list.fields.department')}</Label>
                <Select value={form.department} onValueChange={v => update('department', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                    {DEPARTMENTS.map(d => (
                      <SelectItem key={d} value={d}>{t(`departments.${d}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('recipes.list.fields.branch')}</Label>
                <Select value={form.branch_id} onValueChange={v => update('branch_id', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('recipes.list.allBranches')}</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                    {units.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.code} — {u.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="desc">{t('recipes.list.fields.description')}</Label>
                <Textarea
                  id="desc" rows={3} value={form.description}
                  onChange={e => update('description', e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="notes">{t('recipes.list.fields.notes')}</Label>
                <Textarea
                  id="notes" rows={3} value={form.notes}
                  onChange={e => update('notes', e.target.value)}
                />
              </div>
            </div>

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
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(`recipes.kind.${recipe.kind}`)}</Badge>
              <Badge variant={recipe.status === 'active' ? 'default' : 'secondary'}>
                {t(`recipes.status.${recipe.status}`)}
              </Badge>
              {!recipe.is_active && (
                <Badge variant="outline">{t('common.archived')}</Badge>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('recipes.list.fields.code')}>
                <span className="font-mono">{recipe.code ?? '—'}</span>
              </Field>
              <Field label={t('recipes.list.fields.name')}>{recipe.name_en}</Field>
              <Field label={t('recipes.list.fields.department')}>
                {recipe.department ? t(`departments.${recipe.department}`) : '—'}
              </Field>
              <Field label={t('recipes.list.fields.branch')}>
                {recipe.branch_id ? branchMap[recipe.branch_id]?.name ?? '—' : t('recipes.list.allBranches')}
              </Field>
              <Field label={t('recipes.list.fields.yieldQuantity')}>
                {recipe.yield_quantity ?? '—'}
              </Field>
              <Field label={t('recipes.list.fields.yieldUnit')}>
                {recipe.yield_unit_id ? unitMap[recipe.yield_unit_id]?.code ?? '—' : '—'}
              </Field>
              <div className="sm:col-span-2">
                <Field label={t('recipes.list.fields.description')}>
                  <p className="whitespace-pre-wrap font-normal">{recipe.description ?? '—'}</p>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label={t('recipes.list.fields.notes')}>
                  <p className="whitespace-pre-wrap font-normal">{recipe.notes ?? '—'}</p>
                </Field>
              </div>
            </div>

            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <Field label={t('recipes.list.audit.createdAt')}>{formatDateTime(recipe.created_at)}</Field>
              <Field label={t('recipes.list.audit.updatedAt')}>{formatDateTime(recipe.updated_at)}</Field>
            </div>
          </CardContent>
        </Card>
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
