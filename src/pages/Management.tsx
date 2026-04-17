import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import UserManagement from '@/components/management/UserManagement';
import RoleManager from '@/components/management/RoleManager';
import NotificationSettings from '@/components/management/NotificationSettings';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/shared/EmptyState';
import { ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Management() {
  const { hasRole } = useAuth();
  const { t } = useTranslation();
  const isOwner = hasRole('owner');

  return (
    <AppShell>
      <PageHeader title={t('management.title')} description={t('management.subtitle')} />
      {isOwner ? (
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">{t('management.teamMembers')}</TabsTrigger>
            <TabsTrigger value="roles">{t('management.roleManager')}</TabsTrigger>
            <TabsTrigger value="notifications">{t('management.notifications')}</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>
          <TabsContent value="roles">
            <RoleManager />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationSettings />
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState icon={ShieldAlert} title={t('management.accessRestricted')} description={t('management.accessRestrictedDesc')} />
      )}
    </AppShell>
  );
}
