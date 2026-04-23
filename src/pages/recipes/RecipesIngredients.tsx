import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus, Pencil, Archive, ArchiveRestore, Search, Carrot, Eye, ArrowUpDown,
} from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import EmptyState from '@/components/shared/EmptyState';
import IngredientFormDialog from '@/components/recipes/IngredientFormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import {
  useIngredients, useIngredientCategories, useRecipeUnits, useStorehouses,
  useArchiveIngredient, useIngredientTypes,
  type Ingredient,
} from '@/hooks/useIngredients';
import { useRecipesAsIngredient } from '@/hooks/useRecipes';
import { classifyByPrefix } from '@/lib/ingredientClassification';
import { toast } from '@/hooks/use-toast';

type SortKey = 'name' | 'code' | 'category' | 'updated';

type DerivedRow = Ingredient & {
  __derived: true;
  __recipeId: string;
  __costPerUnit: number;
};

type AnyRow = Ingredient | DerivedRow;
const isDerived = (r: AnyRow): r is DerivedRow => (r as any).__derived === true;

export default function RecipesIngredients() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [storehouseFilter, setStorehouseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [prefixFilter, setPrefixFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Ingredient | null>(null);

  const { data: ingredients = [], isLoading } = useIngredients(includeArchived);
  const { data: types = [] } = useIngredientTypes(true);
  const { data: categories = [] } = useIngredientCategories(true);
  const { data: units = [] } = useRecipeUnits(true);
  const { data: storehouses = [] } = useStorehouses(true);
  const archive = useArchiveIngredient();
  const { data: recipeDerived = [] } = useRecipesAsIngredient();

  const typeMap = useMemo(() => Object.fromEntries(types.map(x => [x.id, x])), [types]);
  const categoryMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);
  const storehouseMap = useMemo(() => Object.fromEntries(storehouses.map(s => [s.id, s])), [storehouses]);

  // Find the managed "Batch Recipe" type id (if any) so derived rows match the type filter.
  const batchRecipeTypeId = useMemo(() => {
    const t = types.find(x => /batch/i.test(x.name_en));
    return t?.id ?? null;
  }, [types]);

  // Build virtual rows from recipe-derived ingredients (Use as Ingredient = Yes).
  const derivedRows = useMemo<DerivedRow[]>(() => {
    return recipeDerived.map(r => ({
      id: `recipe:${r.id}`,
      __derived: true,
      __recipeId: r.id,
      __costPerUnit: r.costPerYieldUnit,
      code: r.code ?? r.id.slice(0, 8).toUpperCase(),
      name_en: r.name_en,
      name_vi: null,
      ingredient_type: 'batch_recipe' as any,
      ingredient_type_id: batchRecipeTypeId,
      category_id: null,
      ingredient_category_id: null,
      base_unit_id: r.yield_unit_id,
      purchase_unit_id: null,
      storehouse_id: null,
      price: r.costPerYieldUnit,
      currency: r.currency,
      is_active: true,
      is_global: true,
      departments: [],
      allergens: null,
      storage_type: 'dry',
      yield_percent: 100,
      tax_rate: 0,
      purchase_to_base_factor: 1,
      last_purchase_price: null,
      supplier: null,
      notes: null,
      created_by: null,
      updated_by: null,
      created_at: '',
      updated_at: '',
      cost_updated_at: null,
    }) as unknown as DerivedRow);
  }, [recipeDerived, batchRecipeTypeId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const combined: AnyRow[] = [...ingredients, ...derivedRows];
    const out = combined.filter(i => {
      if (s) {
        const extra = isDerived(i) ? ` ${i.__recipeId}` : '';
        const hay = `${i.name_en} ${i.code ?? ''}${extra}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (typeFilter !== 'all' && (i as any).ingredient_type_id !== typeFilter) return false;
      if (categoryFilter !== 'all' && (i as any).ingredient_category_id !== categoryFilter) return false;
      if (unitFilter !== 'all' && i.base_unit_id !== unitFilter) return false;
      if (storehouseFilter !== 'all' && i.storehouse_id !== storehouseFilter) return false;
      if (statusFilter === 'active' && !i.is_active) return false;
      if (statusFilter === 'inactive' && i.is_active) return false;
      if (prefixFilter !== 'all' && classifyByPrefix(i.code) !== prefixFilter) return false;
      return true;
    });
    out.sort((a, b) => {
      switch (sortBy) {
        case 'code': return (a.code ?? '').localeCompare(b.code ?? '');
        case 'category': {
          const aId = (a as any).ingredient_category_id;
          const bId = (b as any).ingredient_category_id;
          const ac = aId ? categoryMap[aId]?.name_en ?? '' : '';
          const bc = bId ? categoryMap[bId]?.name_en ?? '' : '';
          return ac.localeCompare(bc);
        }
        case 'updated': return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
        default: return a.name_en.localeCompare(b.name_en);
      }
    });
    return out;
  }, [ingredients, derivedRows, search, typeFilter, categoryFilter, unitFilter, storehouseFilter, statusFilter, prefixFilter, sortBy, categoryMap]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (ing: Ingredient) => { setEditing(ing); setDialogOpen(true); };
  const openView = (ing: Ingredient) => navigate(`/recipes/ingredients/${ing.id}`);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archive.mutateAsync({ id: archiveTarget.id, is_active: !archiveTarget.is_active });
      toast({ title: archiveTarget.is_active ? t('recipes.ingredients.archived') : t('recipes.ingredients.restored') });
    } catch (e) {
      toast({ title: t('common.error'), description: (e as Error).message, variant: 'destructive' });
    }
    setArchiveTarget(null);
  };

  const clearFilters = () => {
    setSearch(''); setTypeFilter('all'); setCategoryFilter('all');
    setUnitFilter('all'); setStorehouseFilter('all'); setStatusFilter('all');
    setPrefixFilter('all');
  };

  const actions = (
    <div className="flex items-center gap-2">
      {canManage && (
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4" /> {t('recipes.ingredients.add')}
        </Button>
      )}
    </div>
  );

  return (
    <RecipesShell
      title={t('recipes.ingredients.title')}
      description={t('recipes.ingredients.subtitle')}
      actions={actions}
    >
      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('recipes.ingredients.searchPlaceholder')}
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger><SelectValue placeholder={t('recipes.ingredients.allTypes')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('recipes.ingredients.allTypes')}</SelectItem>
            {types.map(it => (
              <SelectItem key={it.id} value={it.id}>{it.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('recipes.ingredients.allCategories')}</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('recipes.ingredients.allUnits')}</SelectItem>
            {[...units].sort((a, b) => a.name_en.localeCompare(b.name_en)).map(u => (
              <SelectItem key={u.id} value={u.id}>{u.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={storehouseFilter} onValueChange={setStorehouseFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('recipes.ingredients.allStorehouses')}</SelectItem>
            {storehouses.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('recipes.ingredients.allStatuses')}</SelectItem>
            <SelectItem value="active">{t('status.active')}</SelectItem>
            <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={prefixFilter} onValueChange={setPrefixFilter}>
          <SelectTrigger><SelectValue placeholder="All classifications" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classifications</SelectItem>
            <SelectItem value="food">Food (10…)</SelectItem>
            <SelectItem value="drinks">Drinks (20…)</SelectItem>
            <SelectItem value="unclassified">Unclassified</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger>
            <ArrowUpDown className="h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t('recipes.ingredients.sort.name')}</SelectItem>
            <SelectItem value="code">{t('recipes.ingredients.sort.id')}</SelectItem>
            <SelectItem value="category">{t('recipes.ingredients.sort.category')}</SelectItem>
            <SelectItem value="updated">{t('recipes.ingredients.sort.updated')}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch id="archived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
          <Label htmlFor="archived" className="cursor-pointer text-sm">
            {t('recipes.ingredients.includeArchived')}
          </Label>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t('recipes.ingredients.countFound', { count: filtered.length })}
        </p>
        <Button size="sm" variant="ghost" onClick={clearFilters}>
          {t('common.clearFilters')}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        ingredients.length === 0 ? (
          <EmptyState
            icon={Carrot}
            title={t('recipes.ingredients.empty')}
            description={t('recipes.ingredients.emptyDesc')}
          >
            {canManage && (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" /> {t('recipes.ingredients.add')}
              </Button>
            )}
          </EmptyState>
        ) : (
          <p className="text-center py-8 text-sm text-muted-foreground">
            {t('recipes.ingredients.noMatch')}
          </p>
        )
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recipes.ingredients.cols.id')}</TableHead>
                <TableHead>{t('recipes.ingredients.cols.name')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('recipes.ingredients.cols.type')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('recipes.ingredients.cols.category')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('recipes.ingredients.cols.unit')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('recipes.ingredients.cols.storehouse')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('recipes.ingredients.cols.price')}</TableHead>
                <TableHead>{t('recipes.ingredients.cols.status')}</TableHead>
                <TableHead className="text-right">{t('recipes.ingredients.cols.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(ing => {
                const derived = isDerived(ing);
                const catId = (ing as any).ingredient_category_id;
                const cat = catId ? categoryMap[catId] : null;
                const unit = ing.base_unit_id ? unitMap[ing.base_unit_id] : null;
                const sh = ing.storehouse_id ? storehouseMap[ing.storehouse_id] : null;
                const typeName = (ing as any).ingredient_type_id
                  ? typeMap[(ing as any).ingredient_type_id]?.name_en
                  : null;
                const onRowClick = () => {
                  if (derived) navigate(`/recipes/list/${(ing as DerivedRow).__recipeId}`);
                  else openView(ing as Ingredient);
                };
                return (
                  <TableRow key={ing.id} className="cursor-pointer" onClick={onRowClick}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{ing.code ?? '—'}</TableCell>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {ing.name_en}
                        {derived && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            Recipe
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {derived ? 'Batch Recipe' : (typeName ?? t(`recipes.ingredients.typeLabel.${ing.ingredient_type}`))}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{cat?.name_en ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{unit?.name_en ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{sh?.name ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {ing.price != null
                        ? `${Number(ing.price).toLocaleString()} ${ing.currency}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ing.is_active ? 'default' : 'secondary'}>
                        {ing.is_active ? t('status.active') : t('status.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={onRowClick} aria-label={t('common.view') || 'View'}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canManage && !derived && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(ing as Ingredient)} aria-label={t('common.edit')}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setArchiveTarget(ing as Ingredient)}
                              aria-label={ing.is_active ? t('recipes.ingredients.archive') : t('recipes.ingredients.restore')}>
                              {ing.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <IngredientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ingredient={editing}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.is_active
                ? t('recipes.ingredients.archiveConfirmTitle')
                : t('recipes.ingredients.restore')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('recipes.ingredients.archiveConfirmDesc')}
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
