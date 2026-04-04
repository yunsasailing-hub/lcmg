import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import RoleManager from '@/components/management/RoleManager';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/shared/EmptyState';
import { ShieldAlert } from 'lucide-react';

export default function Management() {
  const { hasRole } = useAuth();
  const { t } = useTranslation();
  const isOwner = hasRole('owner');

  return (
    <AppShell>
      <PageHeader title={t('management.title')} description={t('management.description')} />
      {isOwner ? (
        <RoleManager />
      ) : (
        <EmptyState icon={ShieldAlert} title={t('management.restricted')} description={t('management.restrictedDesc')} />
      )}
    </AppShell>
  );
}
