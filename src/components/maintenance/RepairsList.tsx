import { useMemo, useState } from 'react';
import { Loader2, Search, Plus, Pencil, Archive, Wrench, Camera, User, Calendar, Banknote } from 'lucide-react';
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
  useUpsertMaintenanceRepair,
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
  Done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Archived: 'bg-muted text-muted-foreground border-border',
  // Legacy values retained so old rows still render correctly
  Resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Cancelled: 'bg-muted text-muted-foreground border-border',
};

function fmtDateTime(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
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
  const upsert = useUpsertMaintenanceRepair();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active'); // hide Archived by default
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [open, setOpen] = useState<{ mode: 'new' | 'edit' | 'report'; row?: EnrichedMaintenanceRepair } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<EnrichedMaintenanceRepair | null>(null);

  const branches = useMemo(() => {
    const m = new Map<string, string>();
    repairs.forEach(r => { if (r.asset_branch_id && r.asset_branch_name) m.set(r.asset_branch_id, r.asset_branch_name); });
    return Array.from(m.entries());
  }, [repairs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = repairs.filter(r => {
      if (statusFilter === 'active' && (r.status === 'Archived' || r.status === 'Cancelled')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'active' && r.status !== statusFilter) return false;
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (!filterByAssetId && branchFilter !== 'all' && r.asset_branch_id !== branchFilter) return false;
      if (q && !`${r.title} ${r.asset_name ?? ''} ${r.asset_code ?? ''} ${r.issue_description ?? ''}`
        .toLowerCase().includes(q)) return false;
      return true;
    });
    // Latest first
    return list.sort((a, b) =>
      new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime());
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
              <SelectItem value="active">Active</SelectItem>
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
                  <div className="text-[11px] font-mono text-muted-foreground truncate">
                    {r.asset_code ? `${r.asset_code} — ` : ''}{r.asset_name ?? '—'}
                  </div>
                  <div className="text-sm font-semibold truncate mt-0.5">{r.title}</div>
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
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(r.reported_at)}</span>
                {r.completed_at && <span>Done: {fmtDate(r.completed_at)}</span>}
                {r.reported_by_name && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{r.reported_by_name}</span>}
                {r.technician_name && <span>Tech: {r.technician_name}</span>}
                {r.cost_amount != null && Number(r.cost_amount) > 0 && (
                  <span className="inline-flex items-center gap-1"><Banknote className="h-3 w-3" />{Number(r.cost_amount).toLocaleString()} {r.currency}</span>
                )}
                {(r as any).cost_type && <span>· {(r as any).cost_type}</span>}
                {r.downtime_hours != null && <span>Downtime: {r.downtime_hours}h</span>}
              </div>

              {(() => {
                const photos = Array.isArray((r as any).photos) ? ((r as any).photos as string[]) : [];
                const legacy = [r.before_photo_url, r.after_photo_url].filter(Boolean) as string[];
                const all = [...photos, ...legacy];
                if (all.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {all.slice(0, 4).map((url, i) => (
                      <div key={`${url}-${i}`} className="h-14 w-14 rounded border overflow-hidden bg-muted/40">
                        <ChecklistPhotoPreview imageUrl={url} altText={`${r.title} #${i + 1}`} />
                      </div>
                    ))}
                    {all.length > 4 && (
                      <div className="h-14 w-14 rounded border bg-muted/40 flex items-center justify-center text-[11px] text-muted-foreground">
                        +{all.length - 4}
                      </div>
                    )}
                  </div>
                );
              })()}

              {canManage && (
                <div className="flex gap-1 pt-1 border-t">
                  <Button size="sm" variant="outline" onClick={() => setOpen({ mode: 'edit', row: r })}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                  </Button>
                  {isOwner && r.status !== 'Archived' && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(r)}>
                      <Archive className="h-3.5 w-3.5 mr-1" />Archive
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