import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Pencil, Users, Filter } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
type Department = Database['public']['Enums']['department'];

interface ProfileEntry {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: Department | null;
  branch_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}
interface RoleEntry { id: string; user_id: string; role: AppRole; }
interface BranchEntry { id: string; name: string; }

async function callManageRoles(action: string, params: Record<string, unknown> = {}) {
  const res = await supabase.functions.invoke('manage-roles', { body: { action, ...params } });
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const roleBadgeColor: Record<AppRole, string> = {
  owner: 'bg-red-600',
  manager: 'bg-orange-500',
  staff: 'bg-gray-500',
};

const departments: Department[] = ['management', 'kitchen', 'pizza', 'service', 'bar', 'office'];

export default function UserManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editUser, setEditUser] = useState<ProfileEntry | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | null>>({});
  const [roleChangeUser, setRoleChangeUser] = useState<{ userId: string; currentRoles: AppRole[] } | null>(null);
  const [newRole, setNewRole] = useState<AppRole | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['role-management'],
    queryFn: () => callManageRoles('list'),
  });

  const profiles: ProfileEntry[] = data?.profiles || [];
  const roles: RoleEntry[] = data?.roles || [];
  const branches: BranchEntry[] = data?.branches || [];

  const userRolesMap = useMemo(() => {
    const map = new Map<string, AppRole[]>();
    roles.forEach((r) => {
      const existing = map.get(r.user_id) || [];
      existing.push(r.role);
      map.set(r.user_id, existing);
    });
    return map;
  }, [roles]);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const q = search.toLowerCase();
      if (q && !(p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.phone?.includes(q))) return false;
      if (filterBranch !== 'all' && p.branch_id !== filterBranch) return false;
      if (filterDept !== 'all' && p.department !== filterDept) return false;
      if (filterStatus !== 'all' && String(p.is_active) !== filterStatus) return false;
      if (filterRole !== 'all') {
        const ur = userRolesMap.get(p.user_id) || [];
        if (!ur.includes(filterRole as AppRole)) return false;
      }
      return true;
    });
  }, [profiles, search, filterBranch, filterDept, filterRole, filterStatus, userRolesMap]);

  const updateProfileMutation = useMutation({
    mutationFn: (params: { user_id: string; updates: Record<string, unknown> }) =>
      callManageRoles('update_profile', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-management'] });
      toast.success(t('userMgmt.profileUpdated'));
      setEditUser(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const assignRoleMutation = useMutation({
    mutationFn: (params: { user_id: string; role: AppRole }) => callManageRoles('assign', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-management'] });
      toast.success(t('management.roleAssigned'));
      setRoleChangeUser(null);
      setNewRole('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeRoleMutation = useMutation({
    mutationFn: (params: { user_id: string; role: AppRole }) => callManageRoles('remove', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-management'] });
      toast.success(t('management.roleRemoved'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const getBranchName = (id: string | null) => branches.find((b) => b.id === id)?.name || '—';

  const openEdit = (p: ProfileEntry) => {
    setEditUser(p);
    setEditForm({
      full_name: p.full_name || '',
      email: p.email || '',
      phone: p.phone || '',
      position: p.position || '',
      department: p.department || '',
      branch_id: p.branch_id || '',
    });
  };

  const saveEdit = () => {
    if (!editUser) return;
    const updates: Record<string, unknown> = {};
    if (editForm.full_name !== (editUser.full_name || '')) updates.full_name = editForm.full_name;
    if (editForm.email !== (editUser.email || '')) updates.email = editForm.email;
    if (editForm.phone !== (editUser.phone || '')) updates.phone = editForm.phone || null;
    if (editForm.position !== (editUser.position || '')) updates.position = editForm.position || null;
    if (editForm.department !== (editUser.department || '')) updates.department = editForm.department || null;
    if (editForm.branch_id !== (editUser.branch_id || '')) updates.branch_id = editForm.branch_id || null;
    if (Object.keys(updates).length === 0) { setEditUser(null); return; }
    updateProfileMutation.mutate({ user_id: editUser.user_id, updates });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" /> {t('userMgmt.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder={t('userMgmt.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-[140px]"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('checklists.allBranches')}</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('checklists.allDepartments')}</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{t(`departments.${d}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('userMgmt.allRoles')}</SelectItem>
                <SelectItem value="owner">{t('management.owner')}</SelectItem>
                <SelectItem value="manager">{t('management.manager')}</SelectItem>
                <SelectItem value="staff">{t('management.staff')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('userMgmt.allStatus')}</SelectItem>
                <SelectItem value="true">{t('userMgmt.active')}</SelectItem>
                <SelectItem value="false">{t('userMgmt.inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User list */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('management.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('userMgmt.noUsers')}</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const userRoles = userRolesMap.get(p.user_id) || [];
                const initials = (p.full_name || '?').slice(0, 2).toUpperCase();
                return (
                  <div key={p.user_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{p.full_name || 'Unnamed'}</p>
                          {!p.is_active && <Badge variant="outline" className="text-[10px]">{t('userMgmt.inactive')}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.position && `${p.position} · `}
                          {p.department ? t(`departments.${p.department}`) : ''}
                          {p.branch_id ? ` · ${getBranchName(p.branch_id)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {userRoles.map((role) => (
                        <Badge key={role} className={`${roleBadgeColor[role]} text-white text-[10px]`}>{t(`management.${role}`)}</Badge>
                      ))}
                      {userRoles.length === 0 && <Badge variant="outline" className="text-[10px]">{t('userMgmt.noRole')}</Badge>}
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRoleChangeUser({ userId: p.user_id, currentRoles: userRoles })}>
                        {t('userMgmt.changeRole')}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Profile Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('userMgmt.editUser')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>{t('login.fullName')}</Label><Input value={editForm.full_name || ''} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
            <div><Label>{t('login.email')}</Label><Input value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div><Label>{t('login.phone')}</Label><Input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <div><Label>{t('login.position')}</Label><Input value={editForm.position || ''} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} /></div>
            <div>
              <Label>{t('login.department')}</Label>
              <Select value={editForm.department || ''} onValueChange={(v) => setEditForm({ ...editForm, department: v })}>
                <SelectTrigger><SelectValue placeholder={t('login.selectDept')} /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d} value={d}>{t(`departments.${d}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('userMgmt.branch')}</Label>
              <Select value={editForm.branch_id || ''} onValueChange={(v) => setEditForm({ ...editForm, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder={t('userMgmt.selectBranch')} /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>{t('common.cancel')}</Button>
            <Button onClick={saveEdit} disabled={updateProfileMutation.isPending}>
              {updateProfileMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={!!roleChangeUser} onOpenChange={(open) => !open && setRoleChangeUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('userMgmt.changeRole')}</DialogTitle>
          </DialogHeader>
          {roleChangeUser && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">{t('userMgmt.currentRoles')}</Label>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {roleChangeUser.currentRoles.length > 0 ? roleChangeUser.currentRoles.map((r) => (
                    <div key={r} className="flex items-center gap-1">
                      <Badge className={`${roleBadgeColor[r]} text-white text-xs`}>{t(`management.${r}`)}</Badge>
                      <Button variant="ghost" size="sm" className="h-5 px-1 text-destructive text-[10px]"
                        onClick={() => removeRoleMutation.mutate({ user_id: roleChangeUser.userId, role: r })}>✕</Button>
                    </div>
                  )) : <span className="text-xs text-muted-foreground">{t('userMgmt.noRole')}</span>}
                </div>
              </div>
              <div>
                <Label>{t('userMgmt.addRole')}</Label>
                <div className="flex gap-2 mt-1">
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder={t('management.role')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">{t('management.owner')}</SelectItem>
                      <SelectItem value="manager">{t('management.manager')}</SelectItem>
                      <SelectItem value="staff">{t('management.staff')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!newRole || assignRoleMutation.isPending}
                    onClick={() => newRole && assignRoleMutation.mutate({ user_id: roleChangeUser.userId, role: newRole })}>
                    {t('checklists.assign')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
