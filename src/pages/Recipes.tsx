import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { CookingPot } from 'lucide-react';

export default function Recipes() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader title={t('pages.recipes.title')} description={t('pages.recipes.subtitle')} />
      <EmptyState icon={CookingPot} title={t('pages.recipes.emptyTitle')} description={t('pages.recipes.emptyDesc')} />
    </AppShell>
  );
}
