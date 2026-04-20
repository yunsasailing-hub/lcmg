import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import RecipesShell from '@/components/recipes/RecipesShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OptionListManager, { type FieldDef } from '@/components/recipes/OptionListManager';
import {
  useIngredientTypes, useRecipeCategories, useRecipeUnits, useStorehouses,
} from '@/hooks/useIngredients';
import { useAuth } from '@/hooks/useAuth';

export default function RecipesSettings() {
  const { t } = useTranslation();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);

  const [tab, setTab] = useState('types');

  const { data: types = [], isLoading: tLoading } = useIngredientTypes(true);
  const { data: categories = [], isLoading: cLoading } = useRecipeCategories(true);
  const { data: units = [], isLoading: uLoading } = useRecipeUnits(true);
  const { data: storehouses = [], isLoading: sLoading } = useStorehouses(true);

  const nameFields: FieldDef[] = [
    { key: 'name_en', label: t('recipes.settings.nameEn'), type: 'text', required: true },
    { key: 'name_vi', label: t('recipes.settings.nameVi'), type: 'text' },
  ];

  const unitFields: FieldDef[] = [
    { key: 'code', label: t('recipes.settings.unitCode'), type: 'text', required: true, placeholder: 'kg, l, pcs…' },
    { key: 'name_en', label: t('recipes.settings.nameEn'), type: 'text', required: true },
    { key: 'name_vi', label: t('recipes.settings.nameVi'), type: 'text' },
    { key: 'unit_type', label: t('recipes.settings.unitType'), type: 'select', required: true, options: [
      { value: 'weight', label: t('recipes.settings.unitTypes.weight') },
      { value: 'volume', label: t('recipes.settings.unitTypes.volume') },
      { value: 'count', label: t('recipes.settings.unitTypes.count') },
      { value: 'other', label: t('recipes.settings.unitTypes.other') },
    ] },
  ];

  const storehouseFields: FieldDef[] = [
    { key: 'name', label: t('recipes.settings.nameEn'), type: 'text', required: true },
  ];

  return (
    <RecipesShell
      title={t('recipes.nav.settings')}
      description={t('recipes.settings.subtitle')}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="types">{t('recipes.settings.tabs.types')}</TabsTrigger>
          <TabsTrigger value="categories">{t('recipes.settings.tabs.categories')}</TabsTrigger>
          <TabsTrigger value="units">{t('recipes.settings.tabs.units')}</TabsTrigger>
          <TabsTrigger value="storehouses">{t('recipes.settings.tabs.storehouses')}</TabsTrigger>
        </TabsList>

        <TabsContent value="types">
          <OptionListManager
            table="ingredient_types"
            rows={types}
            isLoading={tLoading}
            fields={nameFields}
            primaryLabel={(r) => r.name_en}
            secondaryLabel={(r) => r.name_vi || null}
            emptyTitle={t('recipes.settings.empty.types')}
            addLabel={t('recipes.settings.add.type')}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="categories">
          <OptionListManager
            table="recipe_categories"
            rows={categories}
            isLoading={cLoading}
            fields={nameFields}
            primaryLabel={(r) => r.name_en}
            secondaryLabel={(r) => r.name_vi || null}
            emptyTitle={t('recipes.settings.empty.categories')}
            addLabel={t('recipes.settings.add.category')}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="units">
          <OptionListManager
            table="recipe_units"
            rows={units}
            isLoading={uLoading}
            fields={unitFields}
            primaryLabel={(r) => r.name_en}
            secondaryLabel={(r) => r.name_vi || null}
            emptyTitle={t('recipes.settings.empty.units')}
            addLabel={t('recipes.settings.add.unit')}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="storehouses">
          <OptionListManager
            table="storehouses"
            rows={storehouses}
            isLoading={sLoading}
            fields={storehouseFields}
            primaryLabel={(r) => r.name}
            emptyTitle={t('recipes.settings.empty.storehouses')}
            addLabel={t('recipes.settings.add.storehouse')}
            canManage={canManage}
          />
        </TabsContent>
      </Tabs>
    </RecipesShell>
  );
}
