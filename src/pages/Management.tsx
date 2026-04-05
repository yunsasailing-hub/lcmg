import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import UserManager from '@/components/management/UserManager';
import RoleManager from '@/components/management/RoleManager';
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
      <PageHeader title={t('management.title')} description={t('management.description')} />
      {isOwner ? (
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">{t('userMgmt.title')}</TabsTrigger>
            <TabsTrigger value="roles">{t('userMgmt.quickRoles')}</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <UserManager />
          </TabsContent>
          <TabsContent value="roles">
            <RoleManager />
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState icon={ShieldAlert} title={t('management.restricted')} description={t('management.restrictedDesc')} />
      )}
    </AppShell>
  );
}
