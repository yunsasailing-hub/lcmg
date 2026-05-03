import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, Plus, Pencil, Archive, Wrench,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import {
  useMaintenanceRepairs,
  useUpsertMaintenanceRepair,
  REPAIR_STATUSES,
  REPAIR_SEVERITIES,
  type EnrichedMaintenanceRepair,
  type MaintenanceRepairStatus,
  type MaintenanceRepairSeverity,
} from '@/hooks/useMaintenanceRepairs';
import RepairFormDialog from './RepairFormDialog';
import { WORK_AREAS } from '@/hooks/useWorkToBeDone';

const SEVERITY_BADGE: Record<MaintenanceRepairSeverity, string> = {
  Low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  High: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  Critical: 'bg-destructive/15 text-destructive border-destructive/40',
};

const STATUS_BADGE: Record<MaintenanceRepairStatus, string> = {
  Reported: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  'In Progress': 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  Done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Archived: 'bg-muted text-muted-foreground border-border',
  Resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Cancelled: 'bg-muted text-muted-foreground border-border',
};

const STATUS_RANK: Record<string, number> = {
  Reported: 0, 'In Progress': 1, Done: 2, Resolved: 2, Archived: 3, Cancelled: 4,
};

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

function shortCode(id: string) {
  return `REP-${id.slice(0, 6).toUpperCase()}`;
}

type SortKey = 'reported_at' | 'branch' | 'department' | 'work_area' | 'status' | 'source' | 'cost';

interface Props {
  filterByAssetId?: string;
  presetAssetId?: string;
  hideHeaderAdd?: boolean;
  openRepairId?: string | null;
  onConsumeOpenRepair?: () => void;
}

export default function RepairsList({ filterByAssetId, presetAssetId, hideHeaderAdd, openRepairId, onConsumeOpenRepair }: Props) {
  const { profile, hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const isManager = hasRole('manager');
  const canManage = isOwner || isManager;

  const { data: repairs = [], isLoading } = useMaintenanceRepairs(filterByAssetId);
  const upsert = useUpsertMaintenanceRepair();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [workAreaFilter, setWorkAreaFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [open, setOpen] = useState<{ mode: 'new' | 'edit' | 'report'; row?: EnrichedMaintenanceRepair } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<EnrichedMaintenanceRepair | null>(null);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (k: SortKey) => {
    if (sortKey !== k) { setSortKey(k); setSortDir(k === 'reported_at' || k === 'cost' ? 'desc' : 'asc'); return; }
    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  };

  useEffect(() => {
    if (!openRepairId || !repairs.length) return;
    const target = repairs.find(r => r.id === openRepairId);
    if (target) {
      setOpen({ mode: 'edit', row: target });
      onConsumeOpenRepair?.();
    }
  }, [openRepairId, repairs, onConsumeOpenRepair]);

  const branches = useMemo(() => {
    const m = new Map<string, string>();
    repairs.forEach(r => { if (r.asset_branch_id && r.asset_branch_name) m.set(r.asset_branch_id, r.asset_branch_name); });
    return Array.from(m.entries());
  }, [repairs]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    repairs.forEach(r => {
      const d = (r as any).department ?? r.asset_department;
      if (d) set.add(d);
    });
    return Array.from(set).sort();
  }, [repairs]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    repairs.forEach(r => set.add(r.source || 'Manual'));
    return Array.from(set).sort();
  }, [repairs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = repairs.filter(r => {
      if (statusFilter === 'active' && (r.status === 'Archived' || r.status === 'Cancelled')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'active' && r.status !== statusFilter) return false;
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (!filterByAssetId && branchFilter !== 'all' && r.asset_branch_id !== branchFilter) return false;
      if (deptFilter !== 'all' && ((r as any).department ?? r.asset_department) !== deptFilter) return false;
      if (workAreaFilter !== 'all' && (r as any).work_area !== workAreaFilter) return false;
      if (sourceFilter !== 'all' && (r.source || 'Manual') !== sourceFilter) return false;
      if (q && !`${r.title} ${r.asset_name ?? ''} ${r.asset_code ?? ''} ${r.issue_description ?? ''}`
        .toLowerCase().includes(q)) return false;
      return true;
    });

    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        switch (sortKey) {
          case 'reported_at': return (new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()) * dir;
          case 'branch': return ((a.asset_branch_name ?? '').localeCompare(b.asset_branch_name ?? '')) * dir;
          case 'department': {
            const ad = ((a as any).department ?? a.asset_department ?? '') as string;
            const bd = ((b as any).department ?? b.asset_department ?? '') as string;
            return ad.localeCompare(bd) * dir;
          }
          case 'work_area': return (((a as any).work_area ?? '').localeCompare((b as any).work_area ?? '')) * dir;
          case 'status': return ((STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)) * dir;
          case 'source': return ((a.source || 'Manual').localeCompare(b.source || 'Manual')) * dir;
          case 'cost': return ((Number(a.cost_amount) || 0) - (Number(b.cost_amount) || 0)) * dir;
        }
      });
    } else {
      list.sort((a, b) => {
        const ar = STATUS_RANK[a.status] ?? 99;
        const br = STATUS_RANK[b.status] ?? 99;
        const aActive = ar < 3 ? 0 : 1;
        const bActive = br < 3 ? 0 : 1;
        const td = new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
        if (td !== 0) return td;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }
    return list;
  }, [repairs, search, statusFilter, severityFilter, branchFilter, deptFilter, workAreaFilter, sourceFilter, filterByAssetId, sortKey, sortDir]);

  const canAdd = canManage || (!!profile?.user_id);

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k
      ? <ArrowUpDown className="h-3 w-3 opacity-30" />
      : sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  const SH = ({ k, label }: { k: SortKey; label: string }) => (
    <button type="button" onClick={() => handleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
      {label}<SortIcon k={k} />
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search repairs…" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {REPAIR_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-9 sm:w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {REPAIR_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {!filterByAssetId && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-9 sm:w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 sm:w-36"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All depts</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={workAreaFilter} onValueChange={setWorkAreaFilter}>
            <SelectTrigger className="h-9 sm:w-44"><SelectValue placeholder="Work Area" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All work areas</SelectItem>
              {WORK_AREAS.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 sm:w-40"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {!hideHeaderAdd && canAdd && (
            <Button onClick={() => setOpen({ mode: canManage ? 'new' : 'report' })}>
              <Plus className="h-4 w-4 mr-1" />{canManage ? 'New Repair' : 'Report Issue'}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading repairs…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-md p-6 text-center flex flex-col items-center gap-2">
          <Wrench className="h-6 w-6 text-muted-foreground/60" />
          No repairs to show.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10">Code</TableHead>
                <TableHead className="h-10">Title</TableHead>
                <TableHead className="h-10"><SH k="branch" label="Branch" /></TableHead>
                <TableHead className="h-10"><SH k="department" label="Dept" /></TableHead>
                <TableHead className="h-10"><SH k="work_area" label="Work Area" /></TableHead>
                <TableHead className="h-10">Area / Equipment</TableHead>
                <TableHead className="h-10"><SH k="reported_at" label="Intervention Date" /></TableHead>
                <TableHead className="h-10"><SH k="status" label="Status" /></TableHead>
                <TableHead className="h-10"><SH k="source" label="Source" /></TableHead>
                <TableHead className="h-10">Assigned</TableHead>
                <TableHead className="h-10"><SH k="cost" label="Cost" /></TableHead>
                <TableHead className="h-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const dept = ((r as any).department ?? r.asset_department) as string | null;
                const equip = r.asset_code
                  ? `${r.asset_code} — ${r.asset_name ?? ''}`
                  : (r.asset_name ?? r.area_or_equipment ?? '—');
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen({ mode: 'edit', row: r })}>
                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">{shortCode(r.id)}</TableCell>
                    <TableCell className="py-2 font-medium max-w-[16rem] truncate">{r.title}</TableCell>
                    <TableCell className="py-2 text-xs">{r.asset_branch_name ?? '—'}</TableCell>
                    <TableCell className="py-2 text-xs capitalize">{dept ?? '—'}</TableCell>
                    <TableCell className="py-2 text-xs">{(r as any).work_area ?? '—'}</TableCell>
                    <TableCell className="py-2 text-xs max-w-[14rem] truncate">{equip}</TableCell>
                    <TableCell className="py-2 text-xs">{fmtDate(r.reported_at)}</TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={STATUS_BADGE[r.status]}>{r.status}</Badge>
                        <Badge variant="outline" className={`${SEVERITY_BADGE[r.severity]} text-[10px] px-1.5`}>{r.severity}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs">{r.source || 'Manual'}</TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {r.assigned_to_name ?? r.technician_name ?? '—'}
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      {r.cost_amount != null && Number(r.cost_amount) > 0
                        ? `${Number(r.cost_amount).toLocaleString()} ${r.currency}`
                        : '—'}
                    </TableCell>
                    <TableCell className="py-2 text-right" onClick={e => e.stopPropagation()}>
                      {canManage ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setOpen({ mode: 'edit', row: r })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {isOwner && r.status !== 'Archived' && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(r)}>
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {open && (
        <RepairFormDialog
          open={!!open}
          onOpenChange={v => { if (!v) setOpen(null); }}
          initial={open.mode === 'edit' ? open.row : null}
          presetAssetId={presetAssetId ?? null}
          reportOnly={open.mode === 'report'}
        />
      )}

      <AlertDialog open={!!confirmArchive} onOpenChange={v => !v && setConfirmArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive repair record?</AlertDialogTitle>
            <AlertDialogDescription>The repair will be hidden from the active list. You can still find it by filtering by status “Archived”.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmArchive) return;
                try {
                  await upsert.mutateAsync({
                    id: confirmArchive.id,
                    asset_id: confirmArchive.asset_id,
                    title: confirmArchive.title,
                    status: 'Archived' as MaintenanceRepairStatus,
                    updated_by: profile?.user_id ?? null,
                  } as any);
                  toast.success('Repair archived');
                } catch (e: any) {
                  toast.error(e?.message ?? 'Archive failed');
                } finally {
                  setConfirmArchive(null);
                }
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
