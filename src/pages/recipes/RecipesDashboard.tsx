import { useTranslation } from 'react-i18next';
import { Carrot, CookingPot, AlertCircle, Archive, Clock, CheckCircle2, FileWarning, ListChecks } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import StatCard from '@/components/shared/StatCard';
import { useIngredients } from '@/hooks/useIngredients';
import { useRecipes } from '@/hooks/useRecipes';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

function useRecipeCoverage() {
  return useQuery({
    queryKey: ['recipe_coverage_dashboard'],
    queryFn: async () => {
      const [{ data: ingLines }, { data: procs }] = await Promise.all([
        supabase.from('recipe_ingredients').select('recipe_id'),
        supabase.from('recipe_procedures').select('recipe_id'),
      ]);
      const withIngredients = new Set((ingLines ?? []).map(r => r.recipe_id));
      const withProcedures = new Set((procs ?? []).map(r => r.recipe_id));
      return { withIngredients, withProcedures };
    },
    staleTime: 60 * 1000,
  });
}

export default function RecipesDashboard() {
  const { t } = useTranslation();
  const { data: activeIngredients = [] } = useIngredients(false);
  const { data: allRecipes = [] } = useRecipes(true);
  const { data: coverage } = useRecipeCoverage();

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const totalRecipes = allRecipes.length;
  const activeRecipes = allRecipes.filter(r => r.is_active).length;
  const recipesMissingCost = allRecipes.filter(r => r.is_active && (r.selling_price == null)).length;
  const recipesNoIngredients = coverage
    ? allRecipes.filter(r => r.is_active && !coverage.withIngredients.has(r.id)).length
    : 0;
  const recipesNoProcedures = coverage
    ? allRecipes.filter(r => r.is_active && !coverage.withProcedures.has(r.id)).length
    : 0;
  const recentIngredients = activeIngredients.filter(i => now - new Date(i.updated_at).getTime() < weekMs).length;
  const recentRecipes = allRecipes.filter(r => now - new Date(r.updated_at).getTime() < weekMs).length;

  return (
    <RecipesShell
      title={t('recipes.dashboard.title')}
      description={t('recipes.dashboard.subtitle')}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Carrot} label={t('recipes.dashboard.totalIngredients')} value={activeIngredients.length} />
        <StatCard icon={CookingPot} label={t('recipes.dashboard.totalRecipes')} value={totalRecipes} />
        <StatCard icon={CheckCircle2} label={t('recipes.dashboard.activeRecipes')} value={activeRecipes} />
        <StatCard icon={AlertCircle} label={t('recipes.dashboard.recipesMissingCost')} value={recipesMissingCost} />
        <StatCard icon={ListChecks} label={t('recipes.dashboard.recipesNoIngredients')} value={recipesNoIngredients} />
        <StatCard icon={FileWarning} label={t('recipes.dashboard.recipesNoProcedures')} value={recipesNoProcedures} />
        <StatCard icon={Clock} label={t('recipes.dashboard.recentIngredients')} value={recentIngredients} subtitle="7d" />
        <StatCard icon={Clock} label={t('recipes.dashboard.recentRecipes')} value={recentRecipes} subtitle="7d" />
      </div>
      <div className="mt-8 rounded-lg border bg-card p-6 text-center">
        <h3 className="text-lg font-heading font-semibold">{t('recipes.dashboard.overviewTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('recipes.dashboard.overviewDesc')}</p>
      </div>
    </RecipesShell>
  );
}
