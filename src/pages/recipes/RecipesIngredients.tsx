import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Archive, ArchiveRestore, Search, Carrot } from 'lucide-react';
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
  useIngredients, useRecipeCategories, useRecipeUnits, useArchiveIngredient,
  type Ingredient,
} from '@/hooks/useIngredients';
import { toast } from '@/hooks/use-toast';

export default function RecipesIngredients() {
  const { t } = useTranslation();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [storageFilter, setStorageFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Ingredient | null>(null);

  const { data: ingredients = [], isLoading } = useIngredients(includeArchived);
  const { data: categories = [] } = useRecipeCategories();
  const { data: units = [] } = useRecipeUnits();
  const archive = useArchiveIngredient();

  const categoryMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return ingredients.filter(i => {
      if (s) {
        const hay = `${i.name_en} ${i.name_vi ?? ''} ${i.code ?? ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (categoryFilter !== 'all' && i.category_id !== categoryFilter) return false;
      if (storageFilter !== 'all' && i.storage_type !== storageFilter) return false;
      return true;
    });
  }, [ingredients, search, categoryFilter, storageFilter]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (ing: Ingredient) => { setEditing(ing); setDialogOpen(true); };

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

  const actions = canManage ? (
    <Button onClick={openAdd} size="sm">
      <Plus className="h-4 w-4" /> {t('recipes.ingredients.add')}
    </Button>
  ) : null;

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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('recipes.ingredients.allCategories')}</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={storageFilter} onValueChange={setStorageFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('recipes.ingredients.allStorage')}</SelectItem>
            <SelectItem value="dry">{t('recipes.ingredients.storageType.dry')}</SelectItem>
            <SelectItem value="chilled">{t('recipes.ingredients.storageType.chilled')}</SelectItem>
            <SelectItem value="frozen">{t('recipes.ingredients.storageType.frozen')}</SelectItem>
            <SelectItem value="ambient">{t('recipes.ingredients.storageType.ambient')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="archived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
          <Label htmlFor="archived" className="cursor-pointer text-sm">
            {t('recipes.ingredients.includeArchived')}
          </Label>
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {t('recipes.ingredients.countFound', { count: filtered.length })}
      </p>

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
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recipes.ingredients.cols.name')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('recipes.ingredients.cols.code')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('recipes.ingredients.cols.category')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('recipes.ingredients.cols.unit')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('recipes.ingredients.cols.price')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('recipes.ingredients.cols.storage')}</TableHead>
                <TableHead>{t('recipes.ingredients.cols.status')}</TableHead>
                {canManage && <TableHead className="text-right">{t('recipes.ingredients.cols.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(ing => {
                const cat = ing.category_id ? categoryMap[ing.category_id] : null;
                const unit = ing.base_unit_id ? unitMap[ing.base_unit_id] : null;
                return (
                  <TableRow key={ing.id}>
                    <TableCell>
                      <div className="font-medium">{ing.name_en}</div>
                      {ing.name_vi && <div className="text-xs text-muted-foreground">{ing.name_vi}</div>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {ing.code ?? '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {cat?.name_en ?? '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {unit?.code ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {ing.last_purchase_price != null
                        ? Number(ing.last_purchase_price).toLocaleString()
                        : t('recipes.ingredients.noPrice')}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline">
                        {t(`recipes.ingredients.storageType.${ing.storage_type}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ing.is_active ? 'default' : 'secondary'}>
                        {ing.is_active ? t('status.active') : t('status.inactive')}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(ing)} aria-label={t('common.edit')}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setArchiveTarget(ing)}
                            aria-label={ing.is_active ? t('recipes.ingredients.archive') : t('recipes.ingredients.restore')}>
                            {ing.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    )}
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
