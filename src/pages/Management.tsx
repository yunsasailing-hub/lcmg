import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Settings } from 'lucide-react';

export default function Management() {
  return (
    <AppShell>
      <PageHeader title="Management" description="Team, branches & system settings" />
      <EmptyState icon={Settings} title="Management area" description="Team management and settings will be built here." />
    </AppShell>
  );
}
