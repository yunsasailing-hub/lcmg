import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Wrench } from 'lucide-react';

export default function Maintenance() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader title={t('pages.maintenance.title')} description={t('pages.maintenance.subtitle')} />
      <EmptyState icon={Wrench} title={t('pages.maintenance.emptyTitle')} description={t('pages.maintenance.emptyDesc')} />
    </AppShell>
  );
}
