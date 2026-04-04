import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Shield, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface RoleEntry { id: string; user_id: string; role: AppRole; }
interface ProfileEntry { user_id: string; full_name: string | null; email: string | null; avatar_url: string | null; }

async function callManageRoles(action: string, params: Record<string, unknown> = {}) {
  const res = await supabase.functions.invoke('manage-roles', { body: { action, ...params } });
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const roleBadgeVariant: Record<AppRole, 'default' | 'secondary' | 'outline'> = {
  owner: 'default', manager: 'secondary', staff: 'outline',
};

export default function RoleManager() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState<AppRole | ''>('');

  const { data, isLoading } = useQuery({ queryKey: ['role-management'], queryFn: () => callManageRoles('list') });

  const assignMutation = useMutation({
    mutationFn: (params: { user_id: string; role: AppRole }) => callManageRoles('assign', params),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['role-management'] }); toast.success(t('management.roleAssigned')); setAssignUserId(''); setAssignRole(''); },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (params: { user_id: string; role: AppRole }) => callManageRoles('remove', params),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['role-management'] }); toast.success(t('management.roleRemoved')); },
    onError: (err: Error) => toast.error(err.message),
  });

  const roles: RoleEntry[] = data?.roles || [];
  const profiles: ProfileEntry[] = data?.profiles || [];
  const getProfile = (userId: string) => profiles.find((p) => p.user_id === userId);

  const userRolesMap = new Map<string, AppRole[]>();
  roles.forEach((r) => { const existing = userRolesMap.get(r.user_id) || []; existing.push(r.role); userRolesMap.set(r.user_id, existing); });

  const usersWithoutAllRoles = profiles.filter(
    (p) => !userRolesMap.has(p.user_id) || (userRolesMap.get(p.user_id)?.length || 0) < 3
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5" /> {t('management.assignRole')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={t('management.selectUser')} /></SelectTrigger>
              <SelectContent>
                {usersWithoutAllRoles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email || 'Unnamed user'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignRole} onValueChange={(v) => setAssignRole(v as AppRole)}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t('management.role')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">{t('management.owner')}</SelectItem>
                <SelectItem value="manager">{t('management.manager')}</SelectItem>
                <SelectItem value="staff">{t('management.staff')}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => assignMutation.mutate({ user_id: assignUserId, role: assignRole as AppRole })}
              disabled={!assignUserId || !assignRole || assignMutation.isPending}>
              {t('checklists.assign')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" /> {t('management.currentRoles')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{t('management.loading')}</p>
          ) : userRolesMap.size === 0 ? (
            <p className="text-muted-foreground text-sm">{t('management.noRoles')}</p>
          ) : (
            <div className="space-y-3">
              {Array.from(userRolesMap.entries()).map(([userId, userRoles]) => {
                const profile = getProfile(userId);
                const initials = (profile?.full_name || '?').slice(0, 2).toUpperCase();
                return (
                  <div key={userId} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
                      <div>
                        <p className="text-sm font-medium">{profile?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{profile?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {userRoles.map((role) => (
                        <div key={role} className="flex items-center gap-1">
                          <Badge variant={roleBadgeVariant[role]}>{role}</Badge>
                          <Button variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => removeMutation.mutate({ user_id: userId, role })} disabled={removeMutation.isPending}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
