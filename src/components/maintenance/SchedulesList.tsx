import { useMemo, useState } from 'react';
import {
  Search, Plus, Pencil, Archive, ArchiveRestore, CalendarClock, FileText, Camera, Loader2,
  List as ListIcon, LayoutGrid, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import EmptyState from '@/components/shared/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import {
  useMaintenanceSchedules,
  useArchiveMaintenanceSchedule,
  type EnrichedScheduleTemplate,
  type MaintenanceScheduleFrequency,
  type MaintenanceScheduleStatus,
} from '@/hooks/useMaintenanceSchedules';
import { useMaintenanceAssets, useBranchesAll } from '@/hooks/useMaintenance';
import ScheduleFormDialog, { FREQ_LABEL } from './ScheduleFormDialog';
import type { Database } from '@/integrations/supabase/types';

type Department = Database['public']['Enums']['department'];
const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];
const FREQUENCIES: MaintenanceScheduleFrequency[] = [
  'daily', 'weekly', 'monthly', 'every_90_days', 'custom_interval',
];
const STATUSES: MaintenanceScheduleStatus[] = ['active', 'inactive', 'archived'];

const STATUS_BADGE: Record<MaintenanceScheduleStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  inactive: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

function fmtTime(t?: string | null) {
  if (!t) return '—';
  return t.slice(0, 5);
}

function fmtDate(d: Date | null) {
  if (!d) return '—';
  try { return d.toLocaleDateString(); } catch { return '—'; }
}

/**
 * Calculate the next due date for a schedule based on frequency, created_at and due_time.
 * Returns null when the schedule is not active or the calculation cannot be performed.
 */
function computeNextDue(s: EnrichedScheduleTemplate): Date | null {
  if (s.status !== 'active') return null;
  const created = s.created_at ? new Date(s.created_at) : null;
  if (!created || isNaN(created.getTime())) return null;
  const [hh, mm] = (s.due_time ?? '00:00').split(':').map(n => parseInt(n, 10));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh || 0, mm || 0, 0, 0);

  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  switch (s.frequency) {
    case 'daily':
      return today.getTime() >= now.getTime() ? today : addDays(today, 1);
    case 'weekly': {
      const target = created.getDay();
      let diff = (target - today.getDay() + 7) % 7;
      const candidate = addDays(today, diff);
      if (diff === 0 && candidate.getTime() < now.getTime()) return addDays(candidate, 7);
      return candidate;
    }
    case 'monthly': {
      const day = created.getDate();
      const tryMonth = (offset: number) => {
        const base = new Date(now.getFullYear(), now.getMonth() + offset, 1, hh || 0, mm || 0);
        const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        base.setDate(Math.min(day, last));
        return base;
      };
      const c = tryMonth(0);
      return c.getTime() >= now.getTime() ? c : tryMonth(1);
    }
    case 'every_90_days':
    case 'custom_interval': {
      const interval = s.frequency === 'every_90_days'
        ? 90
        : (s.custom_interval_days ?? 0);
      if (!interval || interval <= 0) return null;
      const startUtc = Date.UTC(created.getFullYear(), created.getMonth(), created.getDate());
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const elapsed = Math.floor((todayUtc - startUtc) / (24 * 3600 * 1000));
      const cycles = Math.max(0, Math.ceil(elapsed / interval));
      let candidate = addDays(
        new Date(created.getFullYear(), created.getMonth(), created.getDate(), hh || 0, mm || 0),
        cycles * interval,
      );
      if (candidate.getTime() < now.getTime()) candidate = addDays(candidate, interval);
      return candidate;
    }
    default:
      return null;
  }
}

function daysLeftLabel(next: Date | null): { text: string; tone: 'default' | 'warn' | 'muted' | 'danger' } {
  if (!next) return { text: 'Check', tone: 'danger' };
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime();
  const diff = Math.round((b - a) / (24 * 3600 * 1000));
  if (diff < 0) return { text: 'Check', tone: 'danger' };
  if (diff === 0) return { text: 'Today', tone: 'warn' };
  if (diff === 1) return { text: '1 day', tone: 'warn' };
  return { text: `${diff} days`, tone: 'default' };
}

interface SchedulesListProps {
  /** Optional preset asset id when launched from an Asset Detail page. */
  presetAssetId?: string | null;
  /** Optional initial form open trigger from outside (e.g. Asset Detail "Add Schedule"). */
  externalOpenTrigger?: number;
  /** Hide the "+ New Schedule" button shown in the toolbar (e.g. when caller renders its own). */
  hideHeaderAdd?: boolean;
  /** Restrict list to a single asset (e.g. inside the Equipment Detail page). */
  filterByAssetId?: string;
}

export default function SchedulesList({
  presetAssetId, externalOpenTrigger, hideHeaderAdd, filterByAssetId,
}: SchedulesListProps) {
  const { hasRole, profile } = useAuth();
  const isOwner = hasRole('owner');
  const isManager = hasRole('manager');
  const canCreate = isOwner || isManager;

  const { data: schedules = [], isLoading } = useMaintenanceSchedules();
  const { data: assets = [] } = useMaintenanceAssets();
  const { data: branches = [] } = useBranchesAll();
  const archive = useArchiveMaintenanceSchedule();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [assetFilter, setAssetFilter] = useState('all');
  const [freqFilter, setFreqFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'not_archived' | 'all' | MaintenanceScheduleStatus>('not_archived');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const isMobile = useIsMobile();

  type SortKey = 'asset_code' | 'asset_name' | 'branch' | 'department' | 'frequency' | 'next_due' | 'days_left' | 'status';
  const [sortKey, setSortKey] = useState<SortKey>('next_due');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (k: SortKey) => {
    if (sortKey !== k) { setSortKey(k); setSortDir('asc'); return; }
    setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
  };

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedScheduleTemplate | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EnrichedScheduleTemplate | null>(null);

  // External open trigger from Asset Detail "Add Schedule"
  useMemo(() => {
    if (externalOpenTrigger && externalOpenTrigger > 0) {
      setEditing(null);
      setFormOpen(true);
    }
  }, [externalOpenTrigger]);

  const canManage = (s: EnrichedScheduleTemplate) => {
    if (isOwner) return true;
    if (isManager && profile?.branch_id && s.asset_branch_id === profile.branch_id) return true;
    return false;
  };

  const filtered = useMemo(() => {
    const base = schedules.filter(s => {
      if (filterByAssetId && s.asset_id !== filterByAssetId) return false;
      if (statusFilter === 'not_archived' && s.status === 'archived') return false;
      if (statusFilter !== 'all' && statusFilter !== 'not_archived' && s.status !== statusFilter) return false;
      if (branchFilter !== 'all' && s.asset_branch_id !== branchFilter) return false;
      if (deptFilter !== 'all' && s.assigned_department !== deptFilter) return false;
      if (assetFilter !== 'all' && s.asset_id !== assetFilter) return false;
      if (freqFilter !== 'all' && s.frequency !== freqFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.title.toLowerCase().includes(q) &&
          !(s.asset_name ?? '').toLowerCase().includes(q) &&
          !(s.asset_code ?? '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
    const enriched = base.map(s => {
      const next = computeNextDue(s);
      return { s, next };
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    enriched.sort((a, b) => {
      const va: any = (() => {
        switch (sortKey) {
          case 'asset_code': return a.s.asset_code ?? '';
          case 'asset_name': return a.s.asset_name ?? '';
          case 'branch': return a.s.asset_branch_name ?? '';
          case 'department': return a.s.assigned_department ?? '';
          case 'frequency': return a.s.frequency ?? '';
          case 'status': return a.s.status ?? '';
          case 'next_due':
          case 'days_left':
            return a.next ? a.next.getTime() : Number.POSITIVE_INFINITY;
        }
      })();
      const vb: any = (() => {
        switch (sortKey) {
          case 'asset_code': return b.s.asset_code ?? '';
          case 'asset_name': return b.s.asset_name ?? '';
          case 'branch': return b.s.asset_branch_name ?? '';
          case 'department': return b.s.assigned_department ?? '';
          case 'frequency': return b.s.frequency ?? '';
          case 'status': return b.s.status ?? '';
          case 'next_due':
          case 'days_left':
            return b.next ? b.next.getTime() : Number.POSITIVE_INFINITY;
        }
      })();
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
    return enriched;
  }, [schedules, search, branchFilter, deptFilter, assetFilter, freqFilter, statusFilter, filterByAssetId, sortKey, sortDir]);

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    try {
      await archive.mutateAsync({
        id: archiveTarget.id,
        archive: archiveTarget.status !== 'archived',
      });
      toast.success(archiveTarget.status === 'archived' ? 'Schedule restored' : 'Schedule archived');
      setArchiveTarget(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      {!hideHeaderAdd && canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />New Schedule
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by title, asset name or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          {!filterByAssetId && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="sm:w-36"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="sm:w-36"><SelectValue placeholder="Dept" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
            </SelectContent>
          </Select>
          {!filterByAssetId && (
            <Select value={assetFilter} onValueChange={setAssetFilter}>
              <SelectTrigger className="sm:w-40"><SelectValue placeholder="Asset" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assets</SelectItem>
                {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.code}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={freqFilter} onValueChange={setFreqFilter}>
            <SelectTrigger className="sm:w-36"><SelectValue placeholder="Frequency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frequencies</SelectItem>
              {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
            <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="not_archived">Active + Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as 'list' | 'cards')}
        >
          <ToggleGroupItem value="list" aria-label="List view" className="h-9 px-3">
            <ListIcon className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">List</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="cards" aria-label="Cards view" className="h-9 px-3">
            <LayoutGrid className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Cards</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No schedules"
          description="No maintenance schedules match the filters."
        />
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(({ s, next }) => (
            <Card key={s.id} className="hover:border-primary/40 transition-colors cursor-pointer" onClick={() => { setEditing(s); setFormOpen(true); }}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      {s.asset_code ?? '—'} · {s.asset_name ?? '—'}
                    </div>
                    <div className="font-semibold truncate">{s.title}</div>
                  </div>
                  <Badge variant="outline" className={STATUS_BADGE[s.status]}>{s.status}</Badge>
                </div>

                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>
                    {FREQ_LABEL[s.frequency]}
                    {s.frequency === 'custom_interval' && s.custom_interval_days
                      ? ` (${s.custom_interval_days}d)` : ''}
                    {' · '}
                    Due {fmtTime(s.due_time)}
                  </div>
                  <div>
                    Next: {fmtDate(next)} · <span className="font-medium text-foreground">{daysLeftLabel(next).text}</span>
                  </div>
                  <div className="truncate">
                    {s.assigned_staff_name
                      ? <>👤 {s.assigned_staff_name}</>
                      : null}
                    {s.assigned_staff_name && s.assigned_department ? ' · ' : ''}
                    {s.assigned_department
                      ? <span className="capitalize">🏷 {s.assigned_department}</span>
                      : null}
                    {!s.assigned_staff_name && !s.assigned_department ? '—' : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {s.note_required && (
                    <Badge variant="secondary" className="font-normal text-[11px]">
                      <FileText className="h-3 w-3 mr-1" />Note
                    </Badge>
                  )}
                  {s.photo_required && (
                    <Badge variant="secondary" className="font-normal text-[11px]">
                      <Camera className="h-3 w-3 mr-1" />Photo
                    </Badge>
                  )}
                </div>

                {canManage(s) && (
                  <div className="flex gap-1 pt-1" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(s); setFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                    {(isOwner || s.status !== 'archived') && (
                      <Button size="sm" variant="outline" onClick={() => setArchiveTarget(s)}>
                        {s.status === 'archived'
                          ? <><ArchiveRestore className="h-3.5 w-3.5 mr-1" />Restore</>
                          : <><Archive className="h-3.5 w-3.5 mr-1" />Archive</>}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {filtered.map(({ s, next }) => {
            const dl = daysLeftLabel(next);
            return (
              <div
                key={s.id}
                role="button"
                onClick={() => { setEditing(s); setFormOpen(true); }}
                className="rounded-md border p-3 hover:bg-accent/40 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium truncate">
                      <span className="font-mono text-xs text-muted-foreground">{s.asset_code ?? '—'}</span> — {s.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {FREQ_LABEL[s.frequency]} · Due {fmtTime(s.due_time)} · <span className="text-foreground font-medium">{dl.text}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.asset_branch_name ?? '—'} · <span className="capitalize">{s.assigned_department ?? '—'}</span> · {s.status}
                    </div>
                  </div>
                  {canManage(s) && (
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {(isOwner || s.status !== 'archived') && (
                        <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(s)}>
                          {s.status === 'archived'
                            ? <ArchiveRestore className="h-3.5 w-3.5" />
                            : <Archive className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        (() => {
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
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-10"><SH k="asset_code" label="Code" /></TableHead>
                    <TableHead className="h-10"><SH k="asset_name" label="Equipment" /></TableHead>
                    <TableHead className="h-10">Title</TableHead>
                    <TableHead className="h-10"><SH k="branch" label="Branch" /></TableHead>
                    <TableHead className="h-10"><SH k="department" label="Dept" /></TableHead>
                    <TableHead className="h-10"><SH k="frequency" label="Frequency" /></TableHead>
                    <TableHead className="h-10">Due</TableHead>
                    <TableHead className="h-10"><SH k="next_due" label="Next Due" /></TableHead>
                    <TableHead className="h-10"><SH k="days_left" label="Days Left" /></TableHead>
                    <TableHead className="h-10">Assignment</TableHead>
                    <TableHead className="h-10">Req.</TableHead>
                    <TableHead className="h-10"><SH k="status" label="Status" /></TableHead>
                    <TableHead className="h-10 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(({ s, next }) => {
                    const dl = daysLeftLabel(next);
                    return (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => { setEditing(s); setFormOpen(true); }}>
                        <TableCell className="py-2 font-mono text-xs text-muted-foreground">{s.asset_code ?? '—'}</TableCell>
                        <TableCell className="py-2">{s.asset_name ?? '—'}</TableCell>
                        <TableCell className="py-2 font-medium max-w-[14rem] truncate">{s.title}</TableCell>
                        <TableCell className="py-2">{s.asset_branch_name ?? '—'}</TableCell>
                        <TableCell className="py-2 capitalize">{s.assigned_department ?? '—'}</TableCell>
                        <TableCell className="py-2 text-xs">
                          {FREQ_LABEL[s.frequency]}
                          {s.frequency === 'custom_interval' && s.custom_interval_days ? ` (${s.custom_interval_days}d)` : ''}
                        </TableCell>
                        <TableCell className="py-2 text-xs">{fmtTime(s.due_time)}</TableCell>
                        <TableCell className="py-2 text-xs">{fmtDate(next)}</TableCell>
                        <TableCell className="py-2 text-xs">
                          <span className={
                            dl.tone === 'danger' ? 'text-destructive font-medium'
                              : dl.tone === 'warn' ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : 'text-foreground'
                          }>{dl.text}</span>
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">
                          {s.assigned_staff_name ?? (s.assigned_department ? <span className="capitalize">{s.assigned_department}</span> : '—')}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex gap-1">
                            {s.note_required && <Badge variant="secondary" className="font-normal text-[10px] px-1.5"><FileText className="h-2.5 w-2.5 mr-0.5" />N</Badge>}
                            {s.photo_required && <Badge variant="secondary" className="font-normal text-[10px] px-1.5"><Camera className="h-2.5 w-2.5 mr-0.5" />P</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className={STATUS_BADGE[s.status]}>{s.status}</Badge>
                        </TableCell>
                        <TableCell className="py-2 text-right" onClick={e => e.stopPropagation()}>
                          {canManage(s) ? (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setFormOpen(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {(isOwner || s.status !== 'archived') && (
                                <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(s)}>
                                  {s.status === 'archived' ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                                </Button>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          );
        })()
      )}

      {formOpen && (
        <ScheduleFormDialog
          open={formOpen}
          onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
          initial={editing}
          presetAssetId={editing ? null : (presetAssetId ?? filterByAssetId ?? null)}
        />
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={(v) => !v && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.status === 'archived' ? 'Restore this schedule?' : 'Archive this schedule?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.status === 'archived'
                ? 'It will become visible again in default lists.'
                : 'It will be hidden from default lists but can be restored later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
