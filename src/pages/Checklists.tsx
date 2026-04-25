import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import StaffChecklistView from '@/components/checklists/StaffChecklistView';
import ManagerDashboard from '@/components/checklists/ManagerDashboard';
import TemplateManager from '@/components/checklists/TemplateManager';
import PendingChecklistsView from '@/components/checklists/PendingChecklistsView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';

export default function Checklists() {
  const { hasAnyRole } = useAuth();
  const { t } = useTranslation();
  const isManager = hasAnyRole(['owner', 'manager']);

  return (
    <AppShell>
      <PageHeader title={t('nav.checklists')} description={t('checklists.pageSubtitle')} />
      {isManager ? (
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="my-checklists">{t('checklists.tabs.myChecklists')}</TabsTrigger>
            <TabsTrigger value="templates">{t('checklists.tabs.templates')}</TabsTrigger>
            <TabsTrigger value="dashboard">{t('checklists.tabs.dashboard')}</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            <PendingChecklistsView />
          </TabsContent>
          <TabsContent value="my-checklists">
            <StaffChecklistView />
          </TabsContent>
          <TabsContent value="templates">
            <TemplateManager />
          </TabsContent>
          <TabsContent value="dashboard">
            <ManagerDashboard />
          </TabsContent>
        </Tabs>
      ) : (
        <StaffChecklistView />
      )}
    </AppShell>
  );
}
