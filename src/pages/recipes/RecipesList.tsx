import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, CookingPot, Eye, Pencil, Archive, ArchiveRestore, Upload, Image as ImageIcon } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import RecipeImportValidatorDialog from '@/components/recipes/RecipeImportValidatorDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useChecklists';
import { useRecipeCategories } from '@/hooks/useIngredients';
import {
  useRecipes, useArchiveRecipe, useRecipeTypes,
  RECIPE_DEPARTMENTS,
  useRecipesTotalCosts,
  type Recipe,
} from '@/hooks/useRecipes';
import { useRecipePrimaryImages } from '@/hooks/useRecipeMedia';
import { toast } from '@/hooks/use-toast';

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
};

const formatCurrency = (amount: number | null | undefined, currency?: string | null) => {
  if (amount == null || !Number.isFinite(Number(amount))) return '—';
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(amount)) + (currency ? ` ${currency}` : '');
  } catch {
    return String(amount);
  }
};

interface RecipesListProps {
  kind?: 'food' | 'drink';
}

export default function RecipesList({ kind }: RecipesListProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all'); // all|yes|not
  const [archiveTarget, setArchiveTarget] = useState<Recipe | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: recipes = [], isLoading } = useRecipes(true); // fetch all, filter client-side
  // Only show ACTIVE recipe categories/types in filter dropdowns (matches recipe form)
  const { data: categories = [] } = useRecipeCategories(false);
  const { data: types = [] } = useRecipeTypes(false);
  const { data: branches = [] } = useBranches();
  const archive = useArchiveRecipe();

  const categoryMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const typeMap = useMemo(() => Object.fromEntries(types.map(x => [x.id, x])), [types]);
  const branchMap = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return recipes.filter(r => {
      if (!includeArchived && !r.is_active) return false;
      if (kind === 'drink' && r.department !== 'bar') return false;
      if (kind === 'food' && r.department === 'bar') return false;
      if (s) {
        const hay = `${r.name_en} ${r.code ?? ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (categoryFilter !== 'all' && r.category_id !== categoryFilter) return false;
      if (typeFilter !== 'all' && r.recipe_type_id !== typeFilter) return false;
      if (deptFilter !== 'all' && r.department !== deptFilter) return false;
      if (branchFilter !== 'all') {
        if (branchFilter === '__global__') {
          if (r.branch_id) return false;
        } else if (r.branch_id !== branchFilter) return false;
      }
      if (activeFilter === 'yes' && !r.is_active) return false;
      if (activeFilter === 'not' && r.is_active) return false;
      return true;
    });
  }, [recipes, kind, includeArchived, search, categoryFilter, typeFilter, deptFilter, branchFilter, activeFilter]);

  const visibleIds = useMemo(() => filtered.map(r => r.id), [filtered]);
  const { data: thumbMap = {} } = useRecipePrimaryImages(visibleIds);
  const { data: costMap = {} } = useRecipesTotalCosts(visibleIds);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archive.mutateAsync({ id: archiveTarget.id, is_active: !archiveTarget.is_active });
      toast({
        title: archiveTarget.is_active
          ? t('recipes.list.archived')
          : t('recipes.list.restored'),
      });
      setArchiveTarget(null);
    } catch (e: any) {
      toast({ title: t('common.error'), description: e?.message, variant: 'destructive' });
    }
  };

  const titleKey =
    kind === 'drink' ? 'recipes.drinkList.title'
    : kind === 'food' ? 'recipes.foodList.title'
    : 'recipes.list.title';
  const subtitleKey =
    kind === 'drink' ? 'recipes.drinkList.subtitle'
    : kind === 'food' ? 'recipes.foodList.subtitle'
    : 'recipes.list.subtitle';
  const addLabelKey =
    kind === 'drink' ? 'recipes.drinkList.add'
    : kind === 'food' ? 'recipes.foodList.add'
    : 'recipes.list.add';

  return (
    <RecipesShell
      title={t(titleKey)}
      description={t(subtitleKey)}
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button onClick={() => navigate('/recipes/list/new')}>
              <Plus className="h-4 w-4" /> {t(addLabelKey)}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('recipes.list.searchPlaceholder')}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Switch id="arch" checked={includeArchived} onCheckedChange={setIncludeArchived} />
            <Label htmlFor="arch" className="text-sm">{t('recipes.list.includeArchived')}</Label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('recipes.list.allCategories')}</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('recipes.list.allTypes')}</SelectItem>
              {types.map(x => (
                <SelectItem key={x.id} value={x.id}>{x.name_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('recipes.list.allDepartments')}</SelectItem>
              {RECIPE_DEPARTMENTS.map(d => (
                <SelectItem key={d} value={d}>{t(`departments.${d}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('recipes.list.allBranches')}</SelectItem>
              <SelectItem value="__global__">{t('recipes.list.global')}</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('recipes.list.allStatuses')}</SelectItem>
              <SelectItem value="yes">{t('recipes.list.activeYes')}</SelectItem>
              <SelectItem value="not">{t('recipes.list.activeNot')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CookingPot}
          title={recipes.length === 0 ? t('recipes.list.empty') : t('recipes.list.noMatch')}
          description={recipes.length === 0 ? t('recipes.list.emptyDesc') : ''}
        >
          {canManage && recipes.length === 0 && (
            <Button onClick={() => navigate('/recipes/list/new')}>
              <Plus className="h-4 w-4" /> {t('recipes.list.add')}
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recipes.list.cols.code')}</TableHead>
                <TableHead>{t('recipes.list.cols.name')}</TableHead>
                <TableHead>{t('recipes.list.cols.category')}</TableHead>
                <TableHead>{t('recipes.list.cols.type')}</TableHead>
                <TableHead>{t('recipes.list.cols.department')}</TableHead>
                <TableHead>{t('recipes.list.cols.branch')}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t('recipes.list.cols.ingredientCost') ?? 'Ingredient Cost'}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t('recipes.list.cols.sellingPrice') ?? 'Selling Price'}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t('recipes.list.cols.foodCostPct') ?? 'Food Cost %'}</TableHead>
                <TableHead>{t('recipes.list.cols.active')}</TableHead>
                <TableHead>{t('recipes.list.cols.updated')}</TableHead>
                <TableHead className="text-right">{t('recipes.list.cols.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id} className={!r.is_active ? 'opacity-60' : ''}>
                  <TableCell className="font-mono text-xs">{r.code ?? '—'}</TableCell>
                  <TableCell>
                    <button
                      className="flex items-center gap-3 text-left font-medium hover:underline"
                      onClick={() => navigate(`/recipes/list/${r.id}`)}
                    >
                      {thumbMap[r.id] ? (
                        <img
                          src={thumbMap[r.id]}
                          alt=""
                          className="h-[50px] w-[50px] shrink-0 rounded-md border object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                      <span>{r.name_en}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">{r.category_id ? categoryMap[r.category_id]?.name_en ?? '—' : '—'}</TableCell>
                  <TableCell className="text-sm">{r.recipe_type_id ? typeMap[r.recipe_type_id]?.name_en ?? '—' : '—'}</TableCell>
                  <TableCell className="text-sm">{r.department ? t(`departments.${r.department}`) : '—'}</TableCell>
                  <TableCell className="text-sm">
                    {r.branch_id ? branchMap[r.branch_id]?.name ?? '—' : <span className="text-muted-foreground">{t('recipes.list.global')}</span>}
                  </TableCell>
                  {(() => {
                    const ingredientCost = costMap[r.id];
                    const hasCost = ingredientCost != null && Number.isFinite(ingredientCost);
                    const sp = r.selling_price != null ? Number(r.selling_price) : null;
                    const hasSelling = sp != null && sp > 0;
                    const pct = hasCost && hasSelling ? (Number(ingredientCost) / sp!) * 100 : null;
                    return (
                      <>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {hasCost ? formatCurrency(Number(ingredientCost), r.currency) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {hasSelling ? formatCurrency(sp!, r.currency) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {pct != null ? `${pct.toFixed(1)}%` : '—'}
                        </TableCell>
                      </>
                    );
                  })()}
                  <TableCell>
                    <Badge variant={r.is_active ? 'default' : 'secondary'}>
                      {r.is_active ? t('recipes.list.activeYes') : t('recipes.list.activeNot')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/recipes/list/${r.id}`)} title={t('common.view') as string}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/recipes/list/${r.id}?edit=1`)} title={t('common.edit') as string}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(r)} title={r.is_active ? t('recipes.list.archive') as string : t('recipes.list.restore') as string}>
                          {r.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.is_active
                ? t('recipes.list.archiveConfirmTitle')
                : t('recipes.list.restoreConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.is_active
                ? t('recipes.list.archiveConfirmDesc')
                : t('recipes.list.restoreConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecipeImportValidatorDialog open={importOpen} onOpenChange={setImportOpen} />
    </RecipesShell>
  );
}
