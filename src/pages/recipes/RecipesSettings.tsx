import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import RecipesShell from '@/components/recipes/RecipesShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OptionListManager, { type FieldDef } from '@/components/recipes/OptionListManager';
import {
  useIngredientTypes, useIngredientCategories,
  useRecipeCategories, useRecipeUnits, useStorehouses,
} from '@/hooks/useIngredients';
import { useRecipeTypes } from '@/hooks/useRecipes';
import { useAuth } from '@/hooks/useAuth';

export default function RecipesSettings() {
  const { t } = useTranslation();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(['owner', 'manager']);

  const [tab, setTab] = useState('ingredient_types');

  const { data: ingTypes = [], isLoading: itLoading } = useIngredientTypes(true);
  const { data: ingCategories = [], isLoading: icLoading } = useIngredientCategories(true);
  const { data: recTypes = [], isLoading: rtLoading } = useRecipeTypes(true);
  const { data: recCategories = [], isLoading: rcLoading } = useRecipeCategories(true);
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
        <TabsList className="mb-6 grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="ingredient_types">{t('recipes.settings.tabs.ingredientTypes')}</TabsTrigger>
          <TabsTrigger value="ingredient_categories">{t('recipes.settings.tabs.ingredientCategories')}</TabsTrigger>
          <TabsTrigger value="recipe_types">{t('recipes.settings.tabs.recipeTypes')}</TabsTrigger>
          <TabsTrigger value="recipe_categories">{t('recipes.settings.tabs.recipeCategories')}</TabsTrigger>
          <TabsTrigger value="units">{t('recipes.settings.tabs.units')}</TabsTrigger>
          <TabsTrigger value="storehouses">{t('recipes.settings.tabs.storehouses')}</TabsTrigger>
        </TabsList>

        <TabsContent value="ingredient_types">
          <OptionListManager
            table="ingredient_types"
            rows={ingTypes}
            isLoading={itLoading}
            fields={nameFields}
            primaryLabel={(r) => r.name_en}
            secondaryLabel={(r) => r.name_vi || null}
            emptyTitle={t('recipes.settings.empty.ingredientTypes')}
            addLabel={t('recipes.settings.add.ingredientType')}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="ingredient_categories">
          <OptionListManager
            table="ingredient_categories"
            rows={ingCategories}
            isLoading={icLoading}
            fields={nameFields}
            primaryLabel={(r) => r.name_en}
            secondaryLabel={(r) => r.name_vi || null}
            emptyTitle={t('recipes.settings.empty.ingredientCategories')}
            addLabel={t('recipes.settings.add.ingredientCategory')}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="recipe_types">
          <OptionListManager
            table="recipe_types"
            rows={recTypes}
            isLoading={rtLoading}
            fields={nameFields}
            primaryLabel={(r) => r.name_en}
            secondaryLabel={(r) => r.name_vi || null}
            emptyTitle={t('recipes.settings.empty.recipeTypes')}
            addLabel={t('recipes.settings.add.recipeType')}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="recipe_categories">
          <OptionListManager
            table="recipe_categories"
            rows={recCategories}
            isLoading={rcLoading}
            fields={nameFields}
            primaryLabel={(r) => r.name_en}
            secondaryLabel={(r) => r.name_vi || null}
            emptyTitle={t('recipes.settings.empty.recipeCategories')}
            addLabel={t('recipes.settings.add.recipeCategory')}
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
