import { useTranslation } from 'react-i18next';
import { Carrot, CookingPot, AlertCircle, Archive, Clock } from 'lucide-react';
import RecipesShell from '@/components/recipes/RecipesShell';
import StatCard from '@/components/shared/StatCard';
import { useIngredients } from '@/hooks/useIngredients';

export default function RecipesDashboard() {
  const { t } = useTranslation();
  const { data: activeIngredients = [] } = useIngredients(false);
  const { data: allIngredients = [] } = useIngredients(true);
  const inactiveCount = allIngredients.length - activeIngredients.length;
  const missingCost = activeIngredients.filter(i => i.last_purchase_price == null).length;
  const recentlyUpdated = activeIngredients.filter(i => {
    const d = new Date(i.updated_at);
    return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <RecipesShell title={t('pages.recipes.title')}>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Carrot} label={t('recipes.dashboard.totalIngredients')} value={activeIngredients.length} />
        <StatCard icon={CookingPot} label={t('recipes.dashboard.activeRecipes')} value={0} subtitle={t('recipes.placeholder.title')} />
        <StatCard icon={AlertCircle} label={t('recipes.dashboard.missingCost')} value={missingCost} />
        <StatCard icon={Archive} label={t('recipes.dashboard.inactiveItems')} value={inactiveCount} />
        <StatCard icon={Clock} label={t('recipes.dashboard.recentlyUpdated')} value={recentlyUpdated} subtitle="7d" />
      </div>
      <div className="mt-8 rounded-lg border bg-card p-6 text-center">
        <h3 className="text-lg font-heading font-semibold">{t('recipes.dashboard.placeholderTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('recipes.dashboard.placeholderDesc')}</p>
      </div>
    </RecipesShell>
  );
}
