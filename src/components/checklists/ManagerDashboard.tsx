import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  ChevronLeft, ChevronDown, ChevronUp, Circle, CircleCheck, AlertTriangle,
  Clock, CheckCircle2, ShieldCheck, Filter, CalendarIcon, User, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  useAllChecklists,
  useTemplateTasks,
  useTaskCompletions,
  useVerifyChecklist,
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
  completed: { label: 'Done', variant: 'default', className: 'bg-success text-success-foreground hover:bg-success/80' },
  verified: { label: 'Verified', variant: 'default', className: 'bg-info text-info-foreground hover:bg-info/80' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

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
  const verify = useVerifyChecklist();
  const deleteInstance = useDeleteInstance();
  const [rejecting, setRejecting] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');

  const completionMap = useMemo(() => {
    const map: Record<string, any> = {};
    completions?.forEach(c => { map[c.task_id] = c; });
    return map;
  }, [completions]);

  const tpl = instance.template as any;
  const assignee = instance.assignee as any;
  const canVerify = instance.status === 'completed';

  const handleVerify = () => {
    verify.mutate({ instanceId, action: 'verified' }, {
      onSuccess: () => { toast.success('Checklist verified!'); onBack(); },
      onError: () => toast.error('Failed to verify'),
    });
  };

  const handleReject = () => {
    if (!rejectionNote.trim()) { toast.error('Please provide a reason for rejection'); return; }
    verify.mutate({ instanceId, action: 'rejected', rejectionNote: rejectionNote.trim() }, {
      onSuccess: () => { toast.success('Checklist rejected'); onBack(); },
      onError: () => toast.error('Failed to reject'),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-heading font-semibold truncate">{tpl?.title ?? 'Checklist'}</h2>
          <p className="text-xs text-muted-foreground capitalize">
            {instance.checklist_type} · {instance.department} · {format(new Date(instance.scheduled_date + 'T00:00:00'), 'PP')}
          </p>
        </div>
        <Badge variant={statusConfig[instance.status as ChecklistStatus].variant} className={statusConfig[instance.status as ChecklistStatus].className}>
          {statusConfig[instance.status as ChecklistStatus].label}
        </Badge>
      </div>

      {/* Assignee */}
      {assignee && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{assignee.full_name || 'Unassigned'}</span>
        </div>
      )}

      {/* Rejection note */}
      {instance.status === 'rejected' && instance.rejection_note && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{instance.rejection_note}</AlertDescription>
        </Alert>
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
                  <div>
                    <img src={c.photo_url} alt="Task photo" className="h-20 w-20 rounded-md object-cover border" />
                  </div>
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

      {/* Verify / Reject actions */}
      {canVerify && !rejecting && (
        <div className="flex gap-3">
          <Button className="flex-1 bg-success text-success-foreground hover:bg-success/90" onClick={handleVerify} disabled={verify.isPending}>
            <ShieldCheck className="h-4 w-4 mr-2" /> Verify
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => setRejecting(true)} disabled={verify.isPending}>
            <AlertTriangle className="h-4 w-4 mr-2" /> Reject
          </Button>
        </div>
      )}

      {rejecting && (
        <div className="space-y-3 rounded-lg border border-destructive/50 p-4">
          <p className="text-sm font-medium text-destructive">Reason for rejection:</p>
          <Textarea
            value={rejectionNote}
            onChange={e => setRejectionNote(e.target.value)}
            placeholder="Explain what needs to be fixed..."
            className="min-h-[80px]"
          />
          <div className="flex gap-3">
            <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={verify.isPending}>
              Confirm Rejection
            </Button>
            <Button variant="outline" onClick={() => { setRejecting(false); setRejectionNote(''); }}>Cancel</Button>
          </div>
        </div>
      )}

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
    </div>
  );
}

// ─── Main ───

export default function ManagerDashboard() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState<ChecklistFilters>({ date: today });
  const { data: checklists, isLoading } = useAllChecklists(filters);
  const [selected, setSelected] = useState<any>(null);

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

  return (
    <div className="space-y-4">
      {/* Stats */}
      <StatsRow checklists={checklists || []} />

      {/* Filters */}
      <Filters filters={filters} setFilters={setFilters} isOwner={isOwner} />

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : !checklists?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground text-sm">No checklists match your filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {checklists.map(instance => {
            const tpl = instance.template as any;
            const assignee = instance.assignee as any;
            const cfg = statusConfig[instance.status as ChecklistStatus];
            const overdue = isOverdue(instance);
            const StatusIcon = instance.status === 'pending' ? (overdue ? AlertTriangle : Clock)
              : instance.status === 'rejected' ? AlertTriangle
              : instance.status === 'verified' ? ShieldCheck
              : CheckCircle2;

            return (
              <button
                key={instance.id}
                onClick={() => setSelected(instance)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent active:bg-accent',
                  overdue && 'border-destructive/60',
                )}
              >
                <StatusIcon className={cn(
                  'h-5 w-5 shrink-0',
                  overdue ? 'text-destructive' : instance.status === 'rejected' ? 'text-destructive' : instance.status === 'pending' ? 'text-muted-foreground' : 'text-success',
                )} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{tpl?.title ?? 'Checklist'}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {assignee?.full_name || 'Unassigned'} · {instance.department}
                    {overdue && <span className="text-destructive font-semibold ml-1">OVERDUE</span>}
                  </p>
                </div>
                <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
