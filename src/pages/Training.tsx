import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { GraduationCap } from 'lucide-react';

export default function Training() {
  return (
    <AppShell>
      <PageHeader title="Training" description="Staff training programs & certifications" />
      <EmptyState icon={GraduationCap} title="No training modules yet" description="Training programs will appear here once created." />
    </AppShell>
  );
}
