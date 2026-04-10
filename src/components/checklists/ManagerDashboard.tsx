import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  ChevronLeft, ChevronDown, ChevronUp, Circle, CircleCheck, AlertTriangle,
  Clock, CheckCircle2, ShieldCheck, Filter, CalendarIcon, User, Trash2,
} from 'lucide-react';
import GroupedChecklistList from '@/components/checklists/GroupedChecklistList';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  useAllChecklists, useTemplateTasks, useTaskCompletions, useVerifyChecklist, useDeleteInstance, useBranches,
  type ChecklistFilters, type ChecklistStatus, type Department,
} from '@/hooks/useChecklists';
import { Constants } from '@/integrations/supabase/types';

function useStatusConfig(): Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; className?: string }> {
  const { t } = useTranslation();
  return {
    pending: { label: t('status.pending'), variant: 'secondary' },
    completed: { label: t('status.completed'), variant: 'default', className: 'bg-success text-success-foreground hover:bg-success/80' },
    verified: { label: t('status.verified'), variant: 'default', className: 'bg-info text-info-foreground hover:bg-info/80' },
    rejected: { label: t('status.rejected'), variant: 'destructive' },
  };
}

function StatsRow({ checklists }: { checklists: any[] }) {
  const { t } = useTranslation();
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
        { label: t('checklists.total'), value: stats.total, color: 'text-foreground' },
        { label: t('status.pending'), value: stats.pending, color: 'text-warning-foreground', bg: 'bg-warning/10' },
        { label: t('status.completed'), value: stats.done, color: 'text-success', bg: 'bg-success/10' },
        { label: t('status.verified'), value: stats.verified, color: 'text-info', bg: 'bg-info/10' },
      ].map(s => (
        <div key={s.label} className={cn('rounded-lg border bg-card p-3 text-center', s.bg)}>
          <p className={cn('text-2xl font-heading font-bold', s.color)}>{s.value}</p>
          <p className="text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

function Filters({ filters, setFilters, isOwner }: { filters: ChecklistFilters; setFilters: (f: ChecklistFilters) => void; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const { data: branches } = useBranches();
  const { t } = useTranslation();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between">
          <span className="flex items-center gap-2"><Filter className="h-4 w-4" /> {t('checklists.filters')}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('justify-start text-left font-normal', !filters.date && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.date ? format(new Date(filters.date + 'T00:00:00'), 'PP') : t('checklists.anyDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filters.date ? new Date(filters.date + 'T00:00:00') : undefined}
                onSelect={d => setFilters({ ...filters, date: d ? format(d, 'yyyy-MM-dd') : undefined })} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {isOwner && (
            <Select value={filters.branch_id || 'all'} onValueChange={v => setFilters({ ...filters, branch_id: v === 'all' ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder={t('checklists.allBranches')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('checklists.allBranches')}</SelectItem>
                {branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Select value={filters.department || 'all'} onValueChange={v => setFilters({ ...filters, department: v === 'all' ? undefined : v as Department })}>
            <SelectTrigger><SelectValue placeholder={t('checklists.allDepartments')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('checklists.allDepartments')}</SelectItem>
              {Constants.public.Enums.department.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.status || 'all'} onValueChange={v => setFilters({ ...filters, status: v === 'all' ? undefined : v as ChecklistStatus })}>
            <SelectTrigger><SelectValue placeholder={t('checklists.allStatuses')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('checklists.allStatuses')}</SelectItem>
              {Constants.public.Enums.checklist_status.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {Object.values(filters).some(Boolean) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>{t('checklists.clearFilters')}</Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ManagerDetail({ instanceId, templateId, instance, onBack }: {
  instanceId: string; templateId: string; instance: any; onBack: () => void;
}) {
  const { data: tasks } = useTemplateTasks(templateId);
  const { data: completions, isLoading } = useTaskCompletions(instanceId);
  const verify = useVerifyChecklist();
  const deleteInstance = useDeleteInstance();
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const { t } = useTranslation();
  const statusCfg = useStatusConfig();
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
      onSuccess: () => { toast.success(t('checklists.verified')); onBack(); },
      onError: () => toast.error(t('checklists.failVerify')),
    });
  };

  const handleReject = () => {
    if (!rejectionNote.trim()) { toast.error(t('checklists.rejectReason')); return; }
    verify.mutate({ instanceId, action: 'rejected', rejectionNote: rejectionNote.trim() }, {
      onSuccess: () => { toast.success(t('checklists.rejected')); onBack(); },
      onError: () => toast.error(t('checklists.failReject')),
    });
  };

  const handleDelete = () => {
    deleteInstance.mutate(instanceId, {
      onSuccess: () => { toast.success(t('checklists.instanceDeleted')); onBack(); },
      onError: () => toast.error(t('checklists.failDeleteInstance')),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-heading font-semibold truncate">{tpl?.title ?? t('checklists.templateDeleted')}</h2>
          <p className="text-xs text-muted-foreground capitalize">
            {instance.checklist_type} · {instance.department} · {format(new Date(instance.scheduled_date + 'T00:00:00'), 'PP')}
          </p>
        </div>
        <Badge variant={statusCfg[instance.status as ChecklistStatus].variant} className={statusCfg[instance.status as ChecklistStatus].className}>
          {statusCfg[instance.status as ChecklistStatus].label}
        </Badge>
      </div>

      {assignee && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{assignee.full_name || t('checklists.unassigned')}</span>
        </div>
      )}

      {instance.status === 'rejected' && instance.rejection_note && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{instance.rejection_note}</AlertDescription></Alert>
      )}

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
                  {done ? <CircleCheck className="h-5 w-5 text-success shrink-0 mt-0.5" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
                </div>
                {c?.photo_url && <div><img src={c.photo_url} alt="Task photo" className="h-20 w-20 rounded-md object-cover border" /></div>}
                {c?.comment && <p className="text-xs text-muted-foreground italic">💬 {c.comment}</p>}
              </div>
            );
          })}
        </div>
      )}

      {(instance as any).notes && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">📝 {t('checklists.notes')}</p>
          <p className="text-sm text-foreground">{(instance as any).notes}</p>
        </div>
      )}

      {canVerify && !rejecting && (
        <div className="flex gap-3">
          <Button className="flex-1 bg-success text-success-foreground hover:bg-success/90" onClick={handleVerify} disabled={verify.isPending}>
            <ShieldCheck className="h-4 w-4 mr-2" /> {t('checklists.verify')}
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => setRejecting(true)} disabled={verify.isPending}>
            <AlertTriangle className="h-4 w-4 mr-2" /> {t('checklists.reject')}
          </Button>
        </div>
      )}

      {rejecting && (
        <div className="space-y-3 rounded-lg border border-destructive/50 p-4">
          <p className="text-sm font-medium text-destructive">{t('checklists.rejectReason')}</p>
          <Textarea value={rejectionNote} onChange={e => setRejectionNote(e.target.value)} placeholder={t('checklists.rejectPlaceholder')} className="min-h-[80px]" />
          <div className="flex gap-3">
            <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={verify.isPending}>{t('checklists.confirmReject')}</Button>
            <Button variant="outline" onClick={() => { setRejecting(false); setRejectionNote(''); }}>{t('checklists.cancel')}</Button>
          </div>
        </div>
      )}

      {/* Owner-only: Delete checklist record */}
      {isOwner && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-2" /> {t('checklists.deleteInstance')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('checklists.deleteInstanceTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('checklists.deleteInstanceDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('checklists.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleteInstance.isPending ? t('checklists.deleting') : t('checklists.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  const { hasRole } = useAuth();
  const { t } = useTranslation();
  const statusCfg = useStatusConfig();
  const isOwner = hasRole('owner');
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState<ChecklistFilters>({});
  const { data: checklists, isLoading } = useAllChecklists(filters);
  const [selected, setSelected] = useState<any>(null);

  if (selected) {
    return <ManagerDetail instanceId={selected.id} templateId={selected.template_id} instance={selected} onBack={() => setSelected(null)} />;
  }

  const isOverdue = (instance: any) => instance.status === 'pending' && instance.scheduled_date < today;

  return (
    <div className="space-y-4">
      <StatsRow checklists={checklists || []} />
      <Filters filters={filters} setFilters={setFilters} isOwner={isOwner} />

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : (
        <GroupedChecklistList
          checklists={checklists || []}
          statusCfg={statusCfg}
          onSelect={setSelected}
        />
      )}
    </div>
  );
}
