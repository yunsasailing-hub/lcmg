import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { CookingPot } from 'lucide-react';

export default function Recipes() {
  return (
    <AppShell>
      <PageHeader title="Recipes" description="Recipe book & cost management" />
      <EmptyState icon={CookingPot} title="No recipes yet" description="Recipes will appear here once added." />
    </AppShell>
  );
}
