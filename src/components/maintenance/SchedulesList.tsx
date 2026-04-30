import { useMemo, useState } from 'react';
import { Search, Plus, Pencil, Archive, ArchiveRestore, CalendarClock, FileText, Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    return schedules.filter(s => {
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
  }, [schedules, search, branchFilter, deptFilter, assetFilter, freqFilter, statusFilter, filterByAssetId]);

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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(s => (
            <Card key={s.id} className="hover:border-primary/40 transition-colors">
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
                  <div className="flex gap-1 pt-1">
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
