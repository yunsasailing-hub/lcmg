import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import StaffChecklistView from '@/components/checklists/StaffChecklistView';
import TemplateManager from '@/components/checklists/TemplateManager';
import PendingChecklistsView from '@/components/checklists/PendingChecklistsView';
import DoneArchiveView from '@/components/checklists/DoneArchiveView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';

export default function Checklists() {
  const { hasAnyRole, hasRole } = useAuth();
  const { t } = useTranslation();
  const isOwner = hasRole('owner');
  const isManager = hasAnyRole(['manager']);

  return (
    <AppShell>
      <PageHeader title={t('nav.checklists')} description={t('checklists.pageSubtitle')} />
      {isOwner || isManager ? (
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="my-checklists">{t('checklists.tabs.myChecklists')}</TabsTrigger>
            {isOwner && (
              <TabsTrigger value="templates">{t('checklists.tabs.templates')}</TabsTrigger>
            )}
            <TabsTrigger value="archive">Done Archive</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            <PendingChecklistsView />
          </TabsContent>
          <TabsContent value="my-checklists">
            <StaffChecklistView />
          </TabsContent>
          {isOwner && (
            <TabsContent value="templates">
              <TemplateManager />
            </TabsContent>
          )}
          <TabsContent value="archive">
            <DoneArchiveView />
          </TabsContent>
        </Tabs>
      ) : (
        <StaffChecklistView />
      )}
    </AppShell>
  );
}
