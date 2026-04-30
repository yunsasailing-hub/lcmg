import { useMemo, useState } from 'react';
import { Loader2, Search, Plus, Pencil, Trash2, Wrench, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChecklistPhotoPreview } from '@/components/checklists/ChecklistPhotoPreview';
import { useAuth } from '@/hooks/useAuth';
import {
  useMaintenanceRepairs,
  useDeleteMaintenanceRepair,
  REPAIR_STATUSES,
  REPAIR_SEVERITIES,
  type EnrichedMaintenanceRepair,
  type MaintenanceRepairStatus,
  type MaintenanceRepairSeverity,
} from '@/hooks/useMaintenanceRepairs';
import RepairFormDialog from './RepairFormDialog';

const SEVERITY_BADGE: Record<MaintenanceRepairSeverity, string> = {
  Low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  High: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  Critical: 'bg-destructive/15 text-destructive border-destructive/40',
};

const STATUS_BADGE: Record<MaintenanceRepairStatus, string> = {
  Reported: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  'In Progress': 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  Resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Cancelled: 'bg-muted text-muted-foreground border-border',
};

function fmtDateTime(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

interface Props {
  /** Restrict to a single equipment (used by asset detail section). */
  filterByAssetId?: string;
  /** Pre-select equipment in the form (used by asset detail section). */
  presetAssetId?: string;
  /** Hide the top "New repair" button (parent provides one). */
  hideHeaderAdd?: boolean;
}

export default function RepairsList({ filterByAssetId, presetAssetId, hideHeaderAdd }: Props) {
  const { profile, hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const isManager = hasRole('manager');
  const canManage = isOwner || isManager;

  const { data: repairs = [], isLoading } = useMaintenanceRepairs(filterByAssetId);
  const del = useDeleteMaintenanceRepair();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [open, setOpen] = useState<{ mode: 'new' | 'edit' | 'report'; row?: EnrichedMaintenanceRepair } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EnrichedMaintenanceRepair | null>(null);

  const branches = useMemo(() => {
    const m = new Map<string, string>();
    repairs.forEach(r => { if (r.asset_branch_id && r.asset_branch_name) m.set(r.asset_branch_id, r.asset_branch_name); });
    return Array.from(m.entries());
  }, [repairs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repairs.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (!filterByAssetId && branchFilter !== 'all' && r.asset_branch_id !== branchFilter) return false;
      if (q && !`${r.title} ${r.asset_name ?? ''} ${r.asset_code ?? ''} ${r.issue_description ?? ''}`
        .toLowerCase().includes(q)) return false;
      return true;
    });
  }, [repairs, search, statusFilter, severityFilter, branchFilter, filterByAssetId]);

  const canAdd = canManage || (!!profile?.user_id); // staff can also report

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search repairs…" />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {REPAIR_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="sm:w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {REPAIR_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {!filterByAssetId && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="sm:w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(r => (
            <Card key={r.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.asset_code ? `${r.asset_code} — ` : ''}{r.asset_name ?? '—'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className={STATUS_BADGE[r.status]}>{r.status}</Badge>
                  <Badge variant="outline" className={SEVERITY_BADGE[r.severity]}>{r.severity}</Badge>
                </div>
              </div>

              {r.issue_description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{r.issue_description}</p>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>Reported: {fmtDateTime(r.reported_at)}</span>
                {r.completed_at && <span>Completed: {fmtDateTime(r.completed_at)}</span>}
                {r.reported_by_name && <span>By: {r.reported_by_name}</span>}
                {r.technician_name && <span>Tech: {r.technician_name}</span>}
                {r.cost_amount != null && <span>Cost: {Number(r.cost_amount).toLocaleString()} {r.currency}</span>}
                {r.downtime_hours != null && <span>Downtime: {r.downtime_hours}h</span>}
              </div>

              {(r.before_photo_url || r.after_photo_url) && (
                <div className="grid grid-cols-2 gap-2">
                  {r.before_photo_url && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Camera className="h-3 w-3" />Before</div>
                      <ChecklistPhotoPreview imageUrl={r.before_photo_url} altText={`${r.title} before`} />
                    </div>
                  )}
                  {r.after_photo_url && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Camera className="h-3 w-3" />After</div>
                      <ChecklistPhotoPreview imageUrl={r.after_photo_url} altText={`${r.title} after`} />
                    </div>
                  )}
                </div>
              )}

              {canManage && (
                <div className="flex gap-1 pt-1 border-t">
                  <Button size="sm" variant="outline" onClick={() => setOpen({ mode: 'edit', row: r })}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                  </Button>
                  {isOwner && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(r)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" />Delete
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
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

      <AlertDialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete repair record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await del.mutateAsync(confirmDelete.id);
                  toast.success('Repair deleted');
                } catch (e: any) {
                  toast.error(e?.message ?? 'Delete failed');
                } finally {
                  setConfirmDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}