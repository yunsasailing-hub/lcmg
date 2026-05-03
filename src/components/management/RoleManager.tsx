import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Shield, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { invokeManageRoles } from '@/lib/manageRoles';
import { useAuth } from '@/hooks/useAuth';

type AppRole = Database['public']['Enums']['app_role'];

interface RoleEntry {
  id: string;
  user_id: string;
  role: AppRole;
}

interface ProfileEntry {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

async function callManageRoles(action: string, params: Record<string, unknown> = {}) {
  return invokeManageRoles(action, params);
}

const roleBadgeVariant: Record<AppRole, 'default' | 'secondary' | 'outline'> = {
  administrator: 'default',
  owner: 'default',
  manager: 'secondary',
  staff: 'outline',
};

export default function RoleManager() {
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState<AppRole | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['role-management'],
    queryFn: () => callManageRoles('list'),
    enabled: isAuthenticated && !authLoading,
    retry: false,
  });

  const assignMutation = useMutation({
    mutationFn: (params: { user_id: string; role: AppRole }) =>
      callManageRoles('assign', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-management'] });
      toast.success('Role assigned');
      setAssignUserId('');
      setAssignRole('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (params: { user_id: string; role: AppRole }) =>
      callManageRoles('remove', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-management'] });
      toast.success('Role removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const roles: RoleEntry[] = data?.roles || [];
  const profiles: ProfileEntry[] = data?.profiles || [];

  const getProfile = (userId: string) =>
    profiles.find((p) => p.user_id === userId);

  // Group roles by user
  const userRolesMap = new Map<string, AppRole[]>();
  roles.forEach((r) => {
    const existing = userRolesMap.get(r.user_id) || [];
    existing.push(r.role);
    userRolesMap.set(r.user_id, existing);
  });

  // Users without roles (for assignment)
  const usersWithoutAllRoles = profiles.filter(
    (p) => !userRolesMap.has(p.user_id) || (userRolesMap.get(p.user_id)?.length || 0) < 3
  );

  return (
    <div className="space-y-6">
      {/* Assign Role */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5" /> Assign Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {usersWithoutAllRoles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || p.email || 'Unnamed user'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignRole} onValueChange={(v) => setAssignRole(v as AppRole)}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="administrator">Administrator</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => assignMutation.mutate({ user_id: assignUserId, role: assignRole as AppRole })}
              disabled={!assignUserId || !assignRole || assignMutation.isPending}
            >
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Roles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" /> Current Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : userRolesMap.size === 0 ? (
            <p className="text-muted-foreground text-sm">No roles assigned yet.</p>
          ) : (
            <div className="space-y-3">
              {Array.from(userRolesMap.entries()).map(([userId, userRoles]) => {
                const profile = getProfile(userId);
                const initials = (profile?.full_name || '?').slice(0, 2).toUpperCase();
                return (
                  <div
                    key={userId}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{profile?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{profile?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {userRoles.map((role) => (
                        <div key={role} className="flex items-center gap-1">
                          <Badge variant={roleBadgeVariant[role]}>{role}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeMutation.mutate({ user_id: userId, role })}
                            disabled={removeMutation.isPending}
                          >
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
