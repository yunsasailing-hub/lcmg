import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, CookingPot, Eye, Pencil, Archive, ArchiveRestore } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
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
import {
  useRecipes, useArchiveRecipe, RECIPE_KINDS, RECIPE_STATUSES,
  type Recipe,
} from '@/hooks/useRecipes';
import { toast } from '@/hooks/use-toast';

export default function RecipesList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [archiveTarget, setArchiveTarget] = useState<Recipe | null>(null);

  const { data: recipes = [], isLoading } = useRecipes(includeArchived);
  const archive = useArchiveRecipe();

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return recipes.filter(r => {
      if (s) {
        const hay = `${r.name_en} ${r.code ?? ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [recipes, search, kindFilter, statusFilter]);

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

  return (
    <RecipesShell
      title={t('recipes.list.title')}
      description={t('recipes.list.subtitle')}
      actions={
        canManage ? (
          <Button onClick={() => navigate('/recipes/list/new')}>
            <Plus className="h-4 w-4" /> {t('recipes.list.add')}
          </Button>
        ) : null
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('recipes.list.searchPlaceholder')}
              className="pl-9"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('recipes.list.allKinds')}</SelectItem>
              {RECIPE_KINDS.map(k => (
                <SelectItem key={k} value={k}>{t(`recipes.kind.${k}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('recipes.list.allStatuses')}</SelectItem>
              {RECIPE_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{t(`recipes.status.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="arch" checked={includeArchived} onCheckedChange={setIncludeArchived} />
          <Label htmlFor="arch" className="text-sm">{t('recipes.list.includeArchived')}</Label>
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
                <TableHead>{t('recipes.list.cols.kind')}</TableHead>
                <TableHead>{t('recipes.list.cols.status')}</TableHead>
                <TableHead className="text-right">{t('recipes.list.cols.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id} className={!r.is_active ? 'opacity-60' : ''}>
                  <TableCell className="font-mono text-xs">{r.code ?? '—'}</TableCell>
                  <TableCell>
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() => navigate(`/recipes/list/${r.id}`)}
                    >
                      {r.name_en}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`recipes.kind.${r.kind}`)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'active' ? 'default' : 'secondary'}>
                      {t(`recipes.status.${r.status}`)}
                    </Badge>
                    {!r.is_active && (
                      <Badge variant="outline" className="ml-2">{t('common.archived')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/recipes/list/${r.id}`)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/recipes/list/${r.id}?edit=1`)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(r)}>
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
    </RecipesShell>
  );
}
