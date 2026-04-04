import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import StaffChecklistView from '@/components/checklists/StaffChecklistView';

export default function Checklists() {
  return (
    <AppShell>
      <PageHeader title="Checklists" description="Daily opening & closing task lists" />
      <StaffChecklistView />
    </AppShell>
  );
}
