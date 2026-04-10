import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import UserManagement from '@/components/management/UserManagement';
import RoleManager from '@/components/management/RoleManager';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/shared/EmptyState';
import { ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Management() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');

  return (
    <AppShell>
      <PageHeader title="Management" description="Team, branches & system settings" />
      {isOwner ? (
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Team Members</TabsTrigger>
            <TabsTrigger value="roles">Role Manager</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>
          <TabsContent value="roles">
            <RoleManager />
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState icon={ShieldAlert} title="Access restricted" description="Only owners can manage roles and settings." />
      )}
    </AppShell>
  );
}
