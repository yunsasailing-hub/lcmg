import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import StaffChecklistView from '@/components/checklists/StaffChecklistView';
import ManagerDashboard from '@/components/checklists/ManagerDashboard';
import TemplateManager from '@/components/checklists/TemplateManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';

export default function Checklists() {
  const { hasAnyRole } = useAuth();
  const isManager = hasAnyRole(['owner', 'manager']);

  return (
    <AppShell>
      <PageHeader title="Checklists" description="Daily opening & closing task lists" />
      {isManager ? (
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <ManagerDashboard />
          </TabsContent>
          <TabsContent value="templates">
            <TemplateManager />
          </TabsContent>
        </Tabs>
      ) : (
        <StaffChecklistView />
      )}
    </AppShell>
  );
}
