import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import StaffChecklistView from '@/components/checklists/StaffChecklistView';
import ManagerDashboard from '@/components/checklists/ManagerDashboard';
import TemplateManager from '@/components/checklists/TemplateManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';

export default function Checklists() {
  const { hasAnyRole } = useAuth();
  const { t } = useTranslation();
  const isManager = hasAnyRole(['owner', 'manager']);

  return (
    <AppShell>
      <PageHeader title={t('checklists.title')} description={t('checklists.description')} />
      {isManager ? (
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">{t('checklists.dashboard')}</TabsTrigger>
            <TabsTrigger value="my">{t('checklists.myChecklists')}</TabsTrigger>
            <TabsTrigger value="templates">{t('checklists.templates')}</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <ManagerDashboard />
          </TabsContent>
          <TabsContent value="my">
            <StaffChecklistView />
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
