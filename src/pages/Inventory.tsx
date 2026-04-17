import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Package } from 'lucide-react';

export default function Inventory() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader title={t('pages.inventory.title')} description={t('pages.inventory.subtitle')} />
      <EmptyState icon={Package} title={t('pages.inventory.emptyTitle')} description={t('pages.inventory.emptyDesc')} />
    </AppShell>
  );
}
