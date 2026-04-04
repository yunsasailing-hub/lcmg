import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { ClipboardCheck } from 'lucide-react';

export default function Checklists() {
  return (
    <AppShell>
      <PageHeader title="Checklists" description="Daily opening & closing task lists" />
      <EmptyState icon={ClipboardCheck} title="No checklists yet" description="Checklists will appear here once created." />
    </AppShell>
  );
}
