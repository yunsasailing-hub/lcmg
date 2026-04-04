import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Wrench } from 'lucide-react';

export default function Maintenance() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader title={t('maintenance.title')} description={t('maintenance.description')} />
      <EmptyState icon={Wrench} title={t('maintenance.empty')} description={t('maintenance.emptyDesc')} />
    </AppShell>
  );
}
