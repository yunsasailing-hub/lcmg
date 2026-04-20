import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import {
  ChevronLeft, ChevronDown, ChevronUp, Circle, CircleCheck, AlertTriangle,
  Clock, CheckCircle2, Filter, CalendarIcon, User, Trash2, Square, CheckSquare, X,
} from 'lucide-react';
import { useOverdueWarnings, type AppNotification } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  useAllChecklists,
  useTemplateTasks,
  useTaskCompletions,
  useDeleteInstance,
  useBranches,
  type ChecklistFilters,
  type ChecklistStatus,
  type Department,
  type ChecklistType,
} from '@/hooks/useChecklists';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Constants } from '@/integrations/supabase/types';

const statusConfig: Record<ChecklistStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; className?: string }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  late: { label: 'Late', variant: 'destructive', className: 'bg-warning text-warning-foreground hover:bg-warning/80' },
  escalated: { label: 'Escalated', variant: 'destructive' },
  completed: { label: 'Done', variant: 'default', className: 'bg-success text-success-foreground hover:bg-success/80' },
  verified: { label: 'Verified', variant: 'default', className: 'bg-info text-info-foreground hover:bg-info/80' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

import { formatVN } from '@/lib/timezone';

function formatDueTime(dueDatetime: string | null): string | null {
  if (!dueDatetime) return null;
  return formatVN(dueDatetime);
}

// ─── Stats Row ───

function StatsRow({ checklists }: { checklists: any[] }) {
  const stats = useMemo(() => {
    const total = checklists.length;
    const pending = checklists.filter(c => c.status === 'pending').length;
    const done = checklists.filter(c => c.status === 'completed').length;
    const verified = checklists.filter(c => c.status === 'verified').length;
    return { total, pending, done, verified };
  }, [checklists]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Total', value: stats.total, color: 'text-foreground' },
        { label: 'Pending', value: stats.pending, color: 'text-warning-foreground', bg: 'bg-warning/10' },
        { label: 'Done', value: stats.done, color: 'text-success', bg: 'bg-success/10' },
        { label: 'Verified', value: stats.verified, color: 'text-info', bg: 'bg-info/10' },
      ].map(s => (
        <div key={s.label} className={cn('rounded-lg border bg-card p-3 text-center', s.bg)}>
          <p className={cn('text-2xl font-heading font-bold', s.color)}>{s.value}</p>
          <p className="text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Filters ───

function Filters({
  filters, setFilters, isOwner,
}: {
  filters: ChecklistFilters;
  setFilters: (f: ChecklistFilters) => void;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: branches } = useBranches();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between">
          <span className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Date */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('justify-start text-left font-normal', !filters.date && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.date ? format(new Date(filters.date + 'T00:00:00'), 'PP') : 'Any date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.date ? new Date(filters.date + 'T00:00:00') : undefined}
                onSelect={d => setFilters({ ...filters, date: d ? format(d, 'yyyy-MM-dd') : undefined })}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Branch (owner only) */}
          {isOwner && (
            <Select value={filters.branch_id || 'all'} onValueChange={v => setFilters({ ...filters, branch_id: v === 'all' ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* Department */}
          <Select value={filters.department || 'all'} onValueChange={v => setFilters({ ...filters, department: v === 'all' ? undefined : v as Department })}>
            <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {Constants.public.Enums.department.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={filters.status || 'all'} onValueChange={v => setFilters({ ...filters, status: v === 'all' ? undefined : v as ChecklistStatus })}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Constants.public.Enums.checklist_status.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {Object.values(filters).some(Boolean) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>Clear filters</Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Photo Lightbox ───

function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 sm:p-8 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image preview"
        className="absolute top-3 right-3 sm:top-5 sm:right-5 rounded-full bg-background/90 text-foreground p-2 shadow-lg hover:bg-background"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt="Checklist photo enlarged"
        className="max-h-full max-w-full object-contain rounded-md select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}

// ─── Submitter Name Loader ───

import { supabase } from '@/integrations/supabase/client';
import { formatVNDateTime } from '@/lib/timezone';

function useSubmitterName(userId: string | null | undefined) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!userId) { setName(null); return; }
    supabase.from('profiles').select('full_name').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (active) setName(data?.full_name ?? null); });
    return () => { active = false; };
  }, [userId]);
  return name;
}

// ─── Checklist Detail (read-only) ───

function ManagerDetail({ instanceId, templateId, instance, onBack, isOwner }: {
  instanceId: string;
  templateId: string;
  instance: any;
  onBack: () => void;
  isOwner: boolean;
}) {
  const { data: tasks } = useTemplateTasks(templateId);
  const { data: completions, isLoading } = useTaskCompletions(instanceId);
  const deleteInstance = useDeleteInstance();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const completionMap = useMemo(() => {
    const map: Record<string, any> = {};
    completions?.forEach(c => { map[c.task_id] = c; });
    return map;
  }, [completions]);

  const tpl = instance.template as any;
  const assignee = instance.assignee as any;
  const submitterId = (instance as any).assigned_to ?? null;
  const submitterName = useSubmitterName(submitterId) ?? assignee?.full_name ?? null;

  const isSubmitted = !!instance.submitted_at || ['completed', 'verified'].includes(instance.status);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-heading font-semibold truncate">{tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize flex-wrap">
            <span>{instance.checklist_type} · {instance.department} · {format(new Date(instance.scheduled_date + 'T00:00:00'), 'PP')}</span>
            {instance.due_datetime && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal normal-case">
                <Clock className="h-3 w-3 mr-0.5" />
                Due {formatDueTime(instance.due_datetime)}
              </Badge>
            )}
          </div>
        </div>
        {isSubmitted ? (
          <Badge variant="default" className="bg-success text-success-foreground hover:bg-success/80">Submitted</Badge>
        ) : (
          <Badge variant={statusConfig[instance.status as ChecklistStatus].variant} className={statusConfig[instance.status as ChecklistStatus].className}>
            {statusConfig[instance.status as ChecklistStatus].label}
          </Badge>
        )}
      </div>

      {/* Assignee */}
      {assignee && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{assignee.full_name || 'Unassigned'}</span>
        </div>
      )}

      {/* Tasks (read-only) */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : (
        <div className="space-y-2">
          {tasks?.map(task => {
            const c = completionMap[task.id];
            const done = !!c?.is_completed;

            return (
              <div key={task.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <p className={cn('text-sm font-medium flex-1', done && 'line-through text-muted-foreground')}>{task.title}</p>
                  {done
                    ? <CircleCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    : <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
                </div>
                {c?.photo_url && (
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(c.photo_url)}
                    className="block rounded-md overflow-hidden border cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Open photo preview"
                  >
                    <img src={c.photo_url} alt="Task photo" className="h-20 w-20 object-cover" />
                  </button>
                )}
                {c?.comment && <p className="text-xs text-muted-foreground italic">💬 {c.comment}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {(instance as any).notes && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">📝 Notes</p>
          <p className="text-sm text-foreground">{(instance as any).notes}</p>
        </div>
      )}

      {/* Submission status row (replaces verify/reject area) */}
      <div className="rounded-lg border bg-card p-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Status</span>
          <Badge variant="default" className="bg-success text-success-foreground hover:bg-success/80">Submitted</Badge>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Submitted at</span>
          <span className="font-medium text-foreground">
            {instance.submitted_at ? formatVNDateTime(instance.submitted_at) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Submitted by</span>
          <span className="font-medium text-foreground truncate">{submitterName || 'Unknown'}</span>
        </div>
      </div>

      {/* Owner-only: Delete checklist record */}
      {isOwner && (
        <div className="pt-2 border-t">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Record
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this checklist record?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove only this submitted checklist record from history. The original template and other records will not be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteInstance.mutate(instanceId, {
                    onSuccess: () => { toast.success('Record deleted'); onBack(); },
                    onError: () => toast.error('Failed to delete record'),
                  })}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {lightboxSrc && <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

// ─── Grouping Helpers ───

interface DeptMonthGroup {
  department: string;
  months: { key: string; label: string; items: any[] }[];
}

function groupByDepartmentAndMonth(checklists: any[]): DeptMonthGroup[] {
  // Build dept → monthKey → items
  const deptMap: Record<string, Record<string, any[]>> = {};

  for (const c of checklists) {
    const dept = (c.department as string) || 'unknown';
    const submittedDate = c.submitted_at || c.scheduled_date;
    const d = new Date(submittedDate);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    if (!deptMap[dept]) deptMap[dept] = {};
    if (!deptMap[dept][monthKey]) deptMap[dept][monthKey] = [];
    deptMap[dept][monthKey].push(c);
  }

  // Sort departments alphabetically
  const departments = Object.keys(deptMap).sort();

  return departments.map(dept => {
    const monthKeys = Object.keys(deptMap[dept]).sort().reverse(); // newest first
    const months = monthKeys.map(key => {
      const [y, m] = key.split('-');
      const label = format(new Date(Number(y), Number(m) - 1, 1), 'MMMM yyyy');
      const items = deptMap[dept][key].sort((a: any, b: any) => {
        const da = a.submitted_at || a.scheduled_date;
        const db = b.submitted_at || b.scheduled_date;
        return new Date(db).getTime() - new Date(da).getTime();
      });
      return { key, label, items };
    });
    return { department: dept, months };
  });
}

// ─── Overdue Warning Cards ───

function OverdueWarningCards() {
  const { data: warnings = [] } = useOverdueWarnings();

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.slice(0, 5).map(w => (
        <div
          key={w.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3',
            w.notification_type === 'warning'
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-warning/40 bg-warning/5'
          )}
        >
          <AlertTriangle className={cn(
            'h-4 w-4 shrink-0 mt-0.5',
            w.notification_type === 'warning' ? 'text-destructive' : 'text-warning-foreground'
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{w.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{w.message}</p>
          </div>
        </div>
      ))}
      {warnings.length > 5 && (
        <p className="text-xs text-muted-foreground text-center">
          +{warnings.length - 5} more overdue alerts
        </p>
      )}
    </div>
  );
}

// ─── Main ───

export default function ManagerDashboard() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState<ChecklistFilters>({});
  const { data: checklists, isLoading } = useAllChecklists(filters);
  const [selected, setSelected] = useState<any>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupByDepartmentAndMonth(checklists || []), [checklists]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) for (const m of g.months) for (const item of m.items) ids.push(item.id);
    return ids;
  }, [groups]);

  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const someSelected = allVisibleIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  };

  const deleteInstance = useDeleteInstance();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      for (const id of ids) {
        await new Promise<void>((resolve, reject) => {
          deleteInstance.mutate(id, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
      }
      toast.success(`${ids.length} checklist record${ids.length !== 1 ? 's' : ''} deleted successfully.`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to delete some records');
    } finally {
      setBulkDeleting(false);
    }
  };

  if (selected) {
    return (
      <ManagerDetail
        instanceId={selected.id}
        templateId={selected.template_id}
        instance={selected}
        onBack={() => setSelected(null)}
        isOwner={isOwner}
      />
    );
  }

  const isOverdue = (instance: any) =>
    instance.status === 'pending' && instance.scheduled_date < today;

  const toggleMonth = (key: string) =>
    setCollapsedMonths(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-4">
      {/* Overdue Warning Cards */}
      <OverdueWarningCards />

      {/* Stats */}
      <StatsRow checklists={checklists || []} />

      {/* Filters */}
      <Filters filters={filters} setFilters={setFilters} isOwner={isOwner} />

      {/* Selection bar (owner only) */}
      {isOwner && !isLoading && !!checklists?.length && (
        <div className="flex items-center gap-3 px-1 flex-wrap">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={toggleSelectAll}
            aria-label="Select all"
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </span>
          {selectedIds.size > 0 && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="h-7 text-xs">
                    <Trash2 className="h-3 w-3 mr-1" /> Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} checklist record{selectedIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove only the selected submitted checklists and will not affect templates or assignments.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleBulkDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={bulkDeleting}
                    >
                      {bulkDeleting ? 'Deleting…' : 'Confirm Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
                Cancel Selection
              </Button>
            </>
          )}
        </div>
      )}

      {/* Grouped List */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : !checklists?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground text-sm">No checklists match your filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.department} className="space-y-3">
              {/* Department header */}
              <h3 className="text-sm font-heading font-semibold uppercase tracking-wider text-foreground border-b pb-1 flex items-center gap-2">
                {group.department}
                <Badge variant="outline" className="text-[10px] px-1.5 font-normal normal-case tracking-normal">
                  {group.months.reduce((sum, m) => sum + m.items.length, 0)}
                </Badge>
              </h3>

              {group.months.map(month => {
                const collapseKey = `${group.department}-${month.key}`;
                const isCollapsed = !!collapsedMonths[collapseKey];

                return (
                  <div key={month.key} className="space-y-1.5">
                    {/* Month sub-header */}
                    <button
                      onClick={() => toggleMonth(collapseKey)}
                      className="flex items-center gap-2 w-full text-left py-1 px-1 rounded hover:bg-accent/50 transition-colors"
                    >
                      {isCollapsed
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-sm font-medium text-muted-foreground">
                        {month.label}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 ml-1">
                        {month.items.length}
                      </Badge>
                    </button>

                    {/* Checklist items */}
                    {!isCollapsed && (
                      <div className="space-y-1.5 pl-5">
                        {month.items.map((instance: any) => {
                          const tpl = instance.template as any;
                          const assignee = instance.assignee as any;
                          const cfg = statusConfig[instance.status as ChecklistStatus];
                          const overdue = isOverdue(instance);
                          const StatusIcon = instance.status === 'pending' ? (overdue ? AlertTriangle : Clock)
                            : instance.status === 'rejected' ? AlertTriangle
                            : instance.status === 'verified' ? CheckCircle2
                            : CheckCircle2;

                          const isItemSelected = selectedIds.has(instance.id);

                          return (
                            <div
                              key={instance.id}
                              className={cn(
                                'w-full flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent',
                                overdue && 'border-destructive/60',
                                isOwner && isItemSelected && 'ring-1 ring-primary/40 bg-primary/5',
                              )}
                            >
                              {isOwner && (
                                <Checkbox
                                  checked={isItemSelected}
                                  onCheckedChange={() => toggleSelect(instance.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Select ${tpl?.title || 'checklist'}`}
                                  className="shrink-0"
                                />
                              )}
                              <button
                                onClick={() => setSelected(instance)}
                                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                              >
                              <StatusIcon className={cn(
                                'h-4 w-4 shrink-0',
                                overdue ? 'text-destructive' : instance.status === 'rejected' ? 'text-destructive' : instance.status === 'pending' ? 'text-muted-foreground' : 'text-success',
                              )} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-foreground truncate">
                                  {tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {assignee?.full_name || 'Unassigned'}
                                  {instance.due_datetime && (
                                    <span className="ml-1">· Due {formatDueTime(instance.due_datetime)}</span>
                                  )}
                                  {instance.submitted_at && ` · ${format(new Date(instance.submitted_at), 'PP p')}`}
                                  {!instance.submitted_at && ` · ${format(new Date(instance.scheduled_date + 'T00:00:00'), 'PP')}`}
                                  {overdue && <span className="text-destructive font-semibold ml-1">OVERDUE</span>}
                                </p>
                              </div>
                              <Badge variant={cfg.variant} className={cn(cfg.className, 'text-[10px]')}>{cfg.label}</Badge>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}