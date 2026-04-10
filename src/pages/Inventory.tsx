import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Package } from 'lucide-react';

export default function Inventory() {
  return (
    <AppShell>
      <PageHeader title="Inventory" description="Stock levels & order management" />
      <EmptyState icon={Package} title="No inventory items yet" description="Inventory items will appear here once added." />
    </AppShell>
  );
}
