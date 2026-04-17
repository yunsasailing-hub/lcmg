import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { GraduationCap } from 'lucide-react';

export default function Training() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <PageHeader title={t('pages.training.title')} description={t('pages.training.subtitle')} />
      <EmptyState icon={GraduationCap} title={t('pages.training.emptyTitle')} description={t('pages.training.emptyDesc')} />
    </AppShell>
  );
}
