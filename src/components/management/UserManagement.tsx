import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label as UILabel } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Search, Filter, ChevronDown, ChevronUp, Pencil, Shield, UserCheck, UserX, ArrowUp, ArrowDown,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { Constants } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';
import { invokeManageRoles } from '@/lib/manageRoles';
import { useAuth } from '@/hooks/useAuth';

type AppRole = Database['public']['Enums']['app_role'];
type Department = Database['public']['Enums']['department'];

const ALL_BRANCHES_ID = '00000000-0000-0000-0000-000000000001';
const ALL_BRANCHES_LABEL = 'ALL BRANCHES';

interface EnrichedProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  position: string | null;
  department: Department | null;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  roles: AppRole[];
}

interface Branch {
  id: string;
  name: string;
}

async function callManageRoles(action: string, params: Record<string, unknown> = {}) {
  return invokeManageRoles(action, params);
}

const ROLE_BADGE: Record<AppRole, { label: string; className: string }> = {
  administrator: { label: 'Administrator', className: 'bg-purple-700 text-white hover:bg-purple-700/90' },
  owner: { label: 'Owner', className: 'bg-red-600 text-white hover:bg-red-600/90' },
  manager: { label: 'Manager', className: 'bg-orange-500 text-white hover:bg-orange-500/90' },
  staff: { label: 'Staff', className: 'bg-gray-500 text-white hover:bg-gray-500/90' },
};

// Normalize role from any source field, with safe fallback to staff.
function getRole(m: { roles?: AppRole[] | null; position?: string | null }): AppRole {
  // Prefer the highest role available
  const list = (m.roles || []).map(r => r.toString().toLowerCase());
  if (list.includes('administrator')) return 'administrator';
  if (list.includes('owner')) return 'owner';
  if (list.includes('manager')) return 'manager';
  if (list.length > 0) return 'staff';
  const raw =
    (m as unknown as { permission_level?: string }).permission_level ||
    m.position ||
    'staff';
  const value = raw.toString().toLowerCase();
  if (value.includes('administrator')) return 'administrator';
  if (value.includes('owner')) return 'owner';
  if (value.includes('manager')) return 'manager';
  return 'staff';
}

// ─── Edit User Dialog ───

function EditUserDialog({
  user,
  branches,
  open,
  onClose,
  canAssignAdministrator,
}: {
  user: EnrichedProfile;
  branches: Branch[];
  open: boolean;
  onClose: () => void;
  canAssignAdministrator: boolean;
}) {
  const queryClient = useQueryClient();
  const currentRole: AppRole = getRole(user);
  // Administrator can override the lock; for everyone else once a username is set it is locked.
  const hasExistingUsername = !!(user.username && user.username.trim() !== '');
  const usernameLocked = hasExistingUsername && !canAssignAdministrator;
  const isAdminOverride = hasExistingUsername && canAssignAdministrator;
  const [confirmAdminUsernameOpen, setConfirmAdminUsernameOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    email: user.email || '',
    username: user.username || '',
    phone: user.phone || '',
    position: user.position || '',
    department: user.department || '',
    branch_id: user.branch_id || '',
    role: currentRole as string,
  });
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;
  const validateUsername = (v: string): string | null => {
    const trimmed = v.trim();
    if (trimmed === '') return null; // empty allowed (warning shown separately)
    if (/\s/.test(v)) return 'Username cannot contain spaces.';
    if (v !== v.toLowerCase()) return 'Username must be lowercase only.';
    if (!USERNAME_RE.test(trimmed)) return 'Only letters, numbers, dash, underscore (3–32 chars).';
    return null;
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { role, email: _ignoredEmail, username, ...profileFields } = form;
      const payload: Record<string, any> = {
        user_id: user.user_id,
        ...profileFields,
        branch_id: profileFields.branch_id || null,
        department: profileFields.department || null,
      };
      // Send username if editable: setup phase (no existing) OR administrator override.
      if (!usernameLocked) {
        payload.username = username.trim().toLowerCase();
      }
      await callManageRoles('update_profile', payload);
      // Update role only if changed
      if (role && role !== currentRole) {
        await callManageRoles('set_role', { user_id: user.user_id, role });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-management'] });
      queryClient.invalidateQueries({ queryKey: ['role-management'] });
      toast.success('User updated');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const onUsernameChange = (v: string) => {
    update('username', v);
    setUsernameError(validateUsername(v));
  };

  const handleSave = () => {
    if (!usernameLocked) {
      const err = validateUsername(form.username);
      if (err) {
        setUsernameError(err);
        return;
      }
    }
    // Administrator changing an existing username → confirm first.
    if (
      isAdminOverride &&
      form.username.trim().toLowerCase() !== (user.username || '').trim().toLowerCase()
    ) {
      setConfirmAdminUsernameOpen(true);
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update profile details for {user.full_name || 'this user'}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Full Name</Label>
            <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} readOnly disabled className="bg-muted cursor-not-allowed" />
            <p className="text-xs text-muted-foreground mt-1">
              Email is a system login identity and cannot be changed here.
            </p>
          </div>
          <div>
            <Label>Username</Label>
            <Input
              value={form.username}
              onChange={e => !usernameLocked && onUsernameChange(e.target.value)}
              placeholder="e.g. john_doe"
              autoComplete="off"
              spellCheck={false}
              readOnly={usernameLocked}
              disabled={usernameLocked}
              className={usernameLocked ? 'bg-muted cursor-not-allowed font-mono' : ''}
            />
            {usernameLocked ? (
              <p className="text-xs text-muted-foreground mt-1">
                Username cannot be changed after creation.
              </p>
            ) : isAdminOverride ? (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ Changing username will affect login access.
              </p>
            ) : usernameError ? (
              <p className="text-xs text-destructive mt-1">{usernameError}</p>
            ) : form.username.trim() === '' ? (
              <p className="text-xs text-amber-600 mt-1">
                Username required before username login can be activated.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase letters, numbers, dash, underscore. Must be unique.
              </p>
            )}
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => update('phone', e.target.value)} />
          </div>
          <div>
            <Label>Position</Label>
            <Input value={form.position} onChange={e => update('position', e.target.value)} />
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.department || 'none'} onValueChange={v => update('department', v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No department</SelectItem>
                {Constants.public.Enums.department.map(d => (
                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch</Label>
            <Select value={form.branch_id || 'none'} onValueChange={v => update('branch_id', v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No branch</SelectItem>
                {[...branches]
                  .sort((a, b) => {
                    if (a.id === ALL_BRANCHES_ID) return -1;
                    if (b.id === ALL_BRANCHES_ID) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Permission Level</Label>
            <Select value={form.role} onValueChange={v => update('role', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(canAssignAdministrator || currentRole === 'administrator') && (
                  <SelectItem value="administrator">Administrator</SelectItem>
                )}
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || !!usernameError}>
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmAdminUsernameOpen} onOpenChange={setConfirmAdminUsernameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change username?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing username will affect login access. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmAdminUsernameOpen(false);
                updateMutation.mutate();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ─── Change Role Dialog ───

function ChangeRoleDialog({
  user,
  open,
  onClose,
  canAssignAdministrator,
}: {
  user: EnrichedProfile;
  open: boolean;
  onClose: () => void;
  canAssignAdministrator: boolean;
}) {
  const queryClient = useQueryClient();
  const currentRole = getRole(user);
  const [newRole, setNewRole] = useState<AppRole>(currentRole);

  const mutation = useMutation({
    mutationFn: () => callManageRoles('set_role', { user_id: user.user_id, role: newRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-management'] });
      queryClient.invalidateQueries({ queryKey: ['role-management'] });
      toast.success(`Role changed to ${newRole}`);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Role for {user.full_name || 'User'}</DialogTitle>
          <DialogDescription>Select a new role for this team member.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Current role: <Badge className={ROLE_BADGE[currentRole]?.className}>{ROLE_BADGE[currentRole]?.label || currentRole}</Badge>
          </p>
          <div>
            <Label>New Role</Label>
            <Select value={newRole} onValueChange={v => setNewRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(canAssignAdministrator || currentRole === 'administrator') && (
                  <SelectItem value="administrator">Administrator</SelectItem>
                )}
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || newRole === currentRole}>
            {mutation.isPending ? 'Saving…' : 'Change Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───

function CreateUserDialog({
  branches,
  open,
  onClose,
  canAssignAdministrator,
}: {
  branches: Branch[];
  open: boolean;
  onClose: () => void;
  canAssignAdministrator: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    username: '',
    phone: '',
    position: '',
    department: '',
    branch_id: '',
    role: 'staff' as string,
  });
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;

  const update = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  const validateUsername = (v: string): string | null => {
    const t = v.trim();
    if (t === '') return null;
    if (/\s/.test(v)) return 'Username cannot contain spaces.';
    if (v !== v.toLowerCase()) return 'Username must be lowercase only.';
    if (!USERNAME_RE.test(t)) return 'Only letters, numbers, dash, underscore (3–32 chars).';
    return null;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await callManageRoles('create_user', {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim().toLowerCase() || undefined,
        phone: form.phone.trim() || undefined,
        position: form.position.trim() || undefined,
        department: form.department || undefined,
        branch_id: form.branch_id || undefined,
        role: form.role,
      });
      if (res?.ok === false) throw new Error(res.error || 'Failed to create user');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-management'] });
      toast.success('User created');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit =
    form.full_name.trim() && form.email.trim() && form.password.length >= 6 && !usernameError;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>Administrator-only: create a new team member.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Full Name *</Label>
            <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} />
          </div>
          <div>
            <Label>Password * (min 6)</Label>
            <Input type="text" value={form.password} onChange={e => update('password', e.target.value)} />
          </div>
          <div>
            <Label>Username</Label>
            <Input
              value={form.username}
              onChange={e => { update('username', e.target.value); setUsernameError(validateUsername(e.target.value)); }}
              placeholder="e.g. john_doe"
              autoComplete="off"
              spellCheck={false}
            />
            {usernameError ? (
              <p className="text-xs text-destructive mt-1">{usernameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase letters, numbers, dash, underscore. Required for username login.
              </p>
            )}
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => update('phone', e.target.value)} />
          </div>
          <div>
            <Label>Position</Label>
            <Input value={form.position} onChange={e => update('position', e.target.value)} />
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.department || 'none'} onValueChange={v => update('department', v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No department</SelectItem>
                {Constants.public.Enums.department.map(d => (
                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch</Label>
            <Select value={form.branch_id || 'none'} onValueChange={v => update('branch_id', v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No branch</SelectItem>
                {[...branches]
                  .sort((a, b) => {
                    if (a.id === ALL_BRANCHES_ID) return -1;
                    if (b.id === ALL_BRANCHES_ID) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Permission Level</Label>
            <Select value={form.role} onValueChange={v => update('role', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {canAssignAdministrator && <SelectItem value="administrator">Administrator</SelectItem>}
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdministrator = hasRole('administrator' as AppRole);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<{ department?: string; branch_id?: string; role?: string; status?: string }>({});
  const [hideInactive, setHideInactive] = useState(true);
  const [editingUser, setEditingUser] = useState<EnrichedProfile | null>(null);
  const [changingRole, setChangingRole] = useState<EnrichedProfile | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  type SortKey = 'name' | 'username' | 'role' | 'department' | 'branch' | 'status';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const isMobile = useIsMobile();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['user-management'],
    queryFn: () => callManageRoles('list_full'),
    retry: false,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ user_id, is_active }: { user_id: string; is_active: boolean }) => {
      setTogglingUserId(user_id);
      return callManageRoles('toggle_active', { user_id, is_active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-management'] });
      toast.success('User status updated');
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setTogglingUserId(null),
  });

  const profiles: EnrichedProfile[] = data?.profiles || [];
  const branches: Branch[] = data?.branches || [];

  const branchMap = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach(b => { map[b.id] = b.name; });
    return map;
  }, [branches]);

  // Sort branches for selectors: ALL BRANCHES first, then alphabetical
  const sortedBranches = useMemo(() => {
    const arr = [...branches];
    arr.sort((a, b) => {
      if (a.id === ALL_BRANCHES_ID) return -1;
      if (b.id === ALL_BRANCHES_ID) return 1;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [branches]);

  const filtered = useMemo(() => {
    let result = profiles;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.username || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q)
      );
    }

    // Filters
    if (filters.department) result = result.filter(p => p.department === filters.department);
    if (filters.branch_id) result = result.filter(p => p.branch_id === filters.branch_id);
    if (filters.role) result = result.filter(p => p.roles.includes(filters.role as AppRole));
    if (filters.status === 'active') result = result.filter(p => p.is_active);
    if (filters.status === 'inactive') result = result.filter(p => !p.is_active);

    return result;
  }, [profiles, search, filters]);

  const ROLE_RANK: Record<string, number> = { administrator: 0, owner: 1, manager: 2, staff: 3 };
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case 'name':
          av = (a.full_name || '').toLowerCase();
          bv = (b.full_name || '').toLowerCase();
          break;
        case 'username':
          // Missing usernames sort last
          av = (a.username || '\uffff').toLowerCase();
          bv = (b.username || '\uffff').toLowerCase();
          break;
        case 'role':
          av = ROLE_RANK[getRole(a)] ?? 99;
          bv = ROLE_RANK[getRole(b)] ?? 99;
          break;
        case 'department':
          av = (a.department || '').toLowerCase();
          bv = (b.department || '').toLowerCase();
          break;
        case 'branch':
          // ALL BRANCHES sorts first, then alphabetical, empty last
          {
            const rank = (id: string | null) => {
              if (id === ALL_BRANCHES_ID) return '0';
              if (!id) return '2';
              return '1' + (branchMap[id] || '').toLowerCase();
            };
            av = rank(a.branch_id);
            bv = rank(b.branch_id);
          }
          break;
        case 'status':
          av = a.is_active === false ? 1 : 0;
          bv = b.is_active === false ? 1 : 0;
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir, branchMap]);

  // Apply Hide Inactive AFTER search/filters/sorting
  const visible = useMemo(() => {
    if (!hideInactive) return sorted;
    return sorted.filter(p => p.is_active !== false);
  }, [sorted, hideInactive]);

  const SortIndicator = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === 'asc' ? <ArrowUp className="inline h-3 w-3 ml-1" /> : <ArrowDown className="inline h-3 w-3 ml-1" />
    ) : null;

  const renderActions = (user: EnrichedProfile) => (
    <div className="flex items-center gap-1 shrink-0">
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit user" onClick={() => setEditingUser(user)}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Change role" onClick={() => setChangingRole(user)}>
        <Shield className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title={user.is_active ? 'Deactivate' : 'Activate'}
        onClick={() => toggleActiveMutation.mutate({ user_id: user.user_id, is_active: !user.is_active })}
        disabled={togglingUserId === user.user_id}
      >
        {user.is_active ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-success" />}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-heading font-semibold">Team Members</h3>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, position..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 sm:py-0 sm:h-10 shrink-0">
          <Switch
            id="hide-inactive"
            checked={hideInactive}
            onCheckedChange={setHideInactive}
          />
          <UILabel htmlFor="hide-inactive" className="text-xs sm:text-sm cursor-pointer whitespace-nowrap">
            {hideInactive ? 'Inactive hidden' : 'Showing all'}
          </UILabel>
        </div>
      </div>

      {/* Filters */}
      <Collapsible open={filterOpen} onOpenChange={setFilterOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between">
            <span className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</span>
            {filterOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={filters.department || 'all'} onValueChange={v => setFilters(f => ({ ...f, department: v === 'all' ? undefined : v }))}>
              <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {Constants.public.Enums.department.map(d => (
                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.branch_id || 'all'} onValueChange={v => setFilters(f => ({ ...f, branch_id: v === 'all' ? undefined : v }))}>
              <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {sortedBranches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.role || 'all'} onValueChange={v => setFilters(f => ({ ...f, role: v === 'all' ? undefined : v }))}>
              <SelectTrigger><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="administrator">Administrator</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.status || 'all'} onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? undefined : v }))}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {Object.values(filters).some(Boolean) && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFilters({})}>Clear filters</Button>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Stats */}
      <p className="text-sm text-muted-foreground">
        {visible.length} user{visible.length !== 1 ? 's' : ''} found
        {hideInactive && sorted.length > visible.length && (
          <span className="ml-1">({sorted.length - visible.length} inactive hidden)</span>
        )}
      </p>

      {/* User List */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>{error instanceof Error ? error.message : 'Failed to load team members.'}</AlertDescription>
        </Alert>
      ) : visible.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No users match your criteria.</div>
      ) : isMobile ? (
        <div className="space-y-2">
          {visible.map(user => {
            const initials = (user.full_name || '?').slice(0, 2).toUpperCase();
            const primaryRole = getRole(user);
            const roleBadge = ROLE_BADGE[primaryRole];
            const branchName = user.branch_id ? branchMap[user.branch_id] : null;
            const isActive = user.is_active !== false;
            return (
              <div key={user.user_id} className={cn('rounded-lg border bg-card p-3', !isActive && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground truncate">{user.full_name || 'Unnamed'}</p>
                      {roleBadge && (
                        <Badge className={cn('text-[10px] px-1.5 py-0', roleBadge.className)}>{roleBadge.label}</Badge>
                      )}
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', !isActive && 'border-destructive text-destructive')}>
                        {isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                    <p className="text-xs truncate">
                      {user.username ? (
                        <span className="font-mono text-foreground">@{user.username}</span>
                      ) : (
                        <span className="text-amber-600">No username set</span>
                      )}
                    </p>
                    {user.phone && <p className="text-xs text-muted-foreground">{user.phone}</p>}
                    <p className="text-xs text-muted-foreground capitalize flex items-center gap-1 flex-wrap">
                      <span>{user.department || 'No department'}</span>
                      <span>·</span>
                      {user.branch_id === ALL_BRANCHES_ID ? (
                        <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">{ALL_BRANCHES_LABEL}</Badge>
                      ) : (
                        <span>{branchName || 'No branch'}</span>
                      )}
                    </p>
                    <div className="pt-1">{renderActions(user)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>
                  Name<SortIndicator k="name" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('username')}>
                  Username<SortIndicator k="username" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('role')}>
                  Role<SortIndicator k="role" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('department')}>
                  Department<SortIndicator k="department" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('branch')}>
                  Branch<SortIndicator k="branch" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                  Status<SortIndicator k="status" />
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(user => {
                const initials = (user.full_name || '?').slice(0, 2).toUpperCase();
                const primaryRole = getRole(user);
                const roleBadge = ROLE_BADGE[primaryRole];
                const branchName = user.branch_id ? branchMap[user.branch_id] : null;
                const isActive = user.is_active !== false;
                return (
                  <TableRow
                    key={user.user_id}
                    className={cn(
                      !isActive && 'opacity-60',
                      !user.username && 'bg-amber-50 dark:bg-amber-950/20'
                    )}
                  >
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{user.full_name || 'Unnamed'}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email || '—'}{user.phone ? ` · ${user.phone}` : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      {user.username ? (
                        <span className="font-mono text-xs whitespace-nowrap">@{user.username}</span>
                      ) : (
                        <span className="text-xs whitespace-nowrap text-amber-600 font-medium">⚠️ Missing</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge className={cn('text-[10px] px-1.5 py-0', roleBadge.className)}>{roleBadge.label}</Badge>
                    </TableCell>
                    <TableCell className="py-2 capitalize text-sm">
                      {user.department || <span className="text-muted-foreground">No department</span>}
                    </TableCell>
                    <TableCell className="py-2 text-sm">
                      {user.branch_id === ALL_BRANCHES_ID ? (
                        <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">{ALL_BRANCHES_LABEL}</Badge>
                      ) : (
                        branchName || <span className="text-muted-foreground">No branch</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', !isActive && 'border-destructive text-destructive')}>
                        {isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-right">{renderActions(user)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      {editingUser && (
        <EditUserDialog
          key={editingUser.user_id}
          user={editingUser}
          branches={branches}
          open
          onClose={() => setEditingUser(null)}
          canAssignAdministrator={isAdministrator}
        />
      )}
      {changingRole && (
        <ChangeRoleDialog
          key={changingRole.user_id}
          user={changingRole}
          open
          onClose={() => setChangingRole(null)}
          canAssignAdministrator={isAdministrator}
        />
      )}
    </div>
  );
}
