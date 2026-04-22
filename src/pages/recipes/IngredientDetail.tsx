import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, Archive, ArchiveRestore } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import IngredientFormDialog from '@/components/recipes/IngredientFormDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import {
  useIngredient, useIngredientCategories, useRecipeUnits, useStorehouses, useArchiveIngredient, useIngredientTypes,
} from '@/hooks/useIngredients';
import { classifyByPrefix, PREFIX_CLASS_LABEL } from '@/lib/ingredientClassification';
import { toast } from '@/hooks/use-toast';

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

export default function IngredientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);

  const { data: ing, isLoading } = useIngredient(id);
  const { data: types = [] } = useIngredientTypes(true);
  const { data: categories = [] } = useIngredientCategories(true);
  // Only show approved (active) units
  const { data: units = [] } = useRecipeUnits(false);
  const { data: storehouses = [] } = useStorehouses(true);
  const archive = useArchiveIngredient();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (isLoading) {
    return (
      <RecipesShell title={t('recipes.ingredients.detail.title')}>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </RecipesShell>
    );
  }

  if (!ing) {
    return (
      <RecipesShell title={t('recipes.ingredients.detail.title')}>
        <p className="text-sm text-muted-foreground">{t('recipes.ingredients.detail.notFound')}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/recipes/ingredients')}>
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </Button>
      </RecipesShell>
    );
  }

  const type = ing.ingredient_type_id ? types.find((item) => item.id === ing.ingredient_type_id) : null;
  const catId = (ing as any).ingredient_category_id;
  const cat = catId ? categories.find((item) => item.id === catId) : null;
  const unit = ing.base_unit_id ? units.find((item) => item.id === ing.base_unit_id) : null;
  const sh = ing.storehouse_id ? storehouses.find((item) => item.id === ing.storehouse_id) : null;
  const withArchivedSuffix = (label?: string | null, isActive?: boolean) => {
    if (!label) return '—';
    return isActive === false ? `${label} (${t('common.archived')})` : label;
  };

  const handleArchiveToggle = async () => {
    try {
      await archive.mutateAsync({ id: ing.id, is_active: !ing.is_active });
      toast({ title: ing.is_active ? t('recipes.ingredients.archived') : t('recipes.ingredients.restored') });
    } catch (e) {
      toast({ title: t('common.error'), description: (e as Error).message, variant: 'destructive' });
    }
    setArchiveOpen(false);
  };

  const actions = (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => navigate('/recipes/ingredients')}>
        <ArrowLeft className="h-4 w-4" /> {t('common.back')}
      </Button>
      {canManage && (
        <>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> {t('common.edit')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setArchiveOpen(true)}>
            {ing.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
            {ing.is_active ? t('recipes.ingredients.archive') : t('recipes.ingredients.restore')}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <RecipesShell title={ing.name_en} actions={actions}>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              {t('recipes.ingredients.sections.master')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('recipes.ingredients.fields.id')}>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{ing.code ?? '—'}</span>
                  <Badge variant="outline">{PREFIX_CLASS_LABEL[classifyByPrefix(ing.code)]}</Badge>
                </div>
              </Field>
              <Field label={t('recipes.ingredients.fields.activeStatus')}>
                <Badge variant={ing.is_active ? 'default' : 'secondary'}>
                  {ing.is_active ? t('status.active') : t('status.inactive')}
                </Badge>
              </Field>
              <Field label={t('recipes.ingredients.fields.name', { defaultValue: 'Name' })}>{ing.name_en}</Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              {t('recipes.ingredients.sections.classification')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('recipes.ingredients.fields.type')}>
                {withArchivedSuffix(type?.name_en ?? t(`recipes.ingredients.typeLabel.${ing.ingredient_type}`), type?.is_active)}
              </Field>
              <Field label={t('recipes.ingredients.fields.category')}>{withArchivedSuffix(cat?.name_en, cat?.is_active)}</Field>
              <Field label={t('recipes.ingredients.fields.baseUnit')}>
                {withArchivedSuffix(unit?.name_en ?? null, unit?.is_active)}
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              {t('recipes.ingredients.sections.storage')}
            </h3>
            <div>
              <Field label={t('recipes.ingredients.fields.storehouse')}>{withArchivedSuffix(sh?.name, sh?.is_active)}</Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              {t('recipes.ingredients.sections.pricing')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('recipes.ingredients.fields.price')}>
                {ing.price != null ? Number(ing.price).toLocaleString() : '—'}
              </Field>
              <Field label={t('recipes.ingredients.fields.currency')}>{ing.currency}</Field>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              {t('recipes.ingredients.sections.notes')}
            </h3>
            <p className="text-sm whitespace-pre-wrap">{ing.notes || '—'}</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              {t('recipes.ingredients.detail.audit')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label={t('recipes.ingredients.detail.createdAt')}>{formatDateTime(ing.created_at)}</Field>
              <Field label={t('recipes.ingredients.detail.createdBy')}>
                <span className="font-mono text-xs">{ing.created_by ?? '—'}</span>
              </Field>
              <Field label={t('recipes.ingredients.detail.updatedAt')}>{formatDateTime(ing.updated_at)}</Field>
              <Field label={t('recipes.ingredients.detail.updatedBy')}>
                <span className="font-mono text-xs">{ing.updated_by ?? '—'}</span>
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <IngredientFormDialog open={editOpen} onOpenChange={setEditOpen} ingredient={ing} />

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ing.is_active
                ? t('recipes.ingredients.archiveConfirmTitle')
                : t('recipes.ingredients.restore')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('recipes.ingredients.archiveConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveToggle}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RecipesShell>
  );
}
