import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { CookingPot } from 'lucide-react';

export default function Recipes() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader title={t('recipes.title')} description={t('recipes.description')} />
      <EmptyState icon={CookingPot} title={t('recipes.empty')} description={t('recipes.emptyDesc')} />
    </AppShell>
  );
}
