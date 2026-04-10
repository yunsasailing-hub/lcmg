import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Wrench } from 'lucide-react';

export default function Maintenance() {
  return (
    <AppShell>
      <PageHeader title="Maintenance" description="Equipment tracking & repair tickets" />
      <EmptyState icon={Wrench} title="No maintenance tickets" description="Maintenance requests will appear here." />
    </AppShell>
  );
}
