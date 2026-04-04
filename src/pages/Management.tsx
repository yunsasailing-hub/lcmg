import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import RoleManager from '@/components/management/RoleManager';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/shared/EmptyState';
import { ShieldAlert } from 'lucide-react';

export default function Management() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');

  return (
    <AppShell>
      <PageHeader title="Management" description="Team, branches & system settings" />
      {isOwner ? (
        <RoleManager />
      ) : (
        <EmptyState icon={ShieldAlert} title="Access restricted" description="Only owners can manage roles and settings." />
      )}
    </AppShell>
  );
}
