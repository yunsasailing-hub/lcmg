import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CalendarClock, ClipboardCheck, Wrench, Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { todayVN, formatVN } from '@/lib/timezone';
import {
  useMaintenanceTasks,
  type EnrichedMaintenanceTask,
} from '@/hooks/useMaintenanceTasks';
import { useLastExecutionByTemplate, parseLocalDate } from '@/hooks/useLastExecutionByTemplate';
import { occurrencesInRange } from '@/lib/maintenanceSchedule';
import TaskCompletionDialog, { type EarlyPreviewPayload } from '@/components/maintenance/TaskCompletionDialog';
import type { Database } from '@/integrations/supabase/types';

type Frequency = Database['public']['Enums']['maintenance_schedule_frequency'];

type ActionItem = {
  key: string;
  type: 'checklist' | 'maintenance';
  title: string;
  branchName: string | null;
  department: string | null;
  dueISO: string;          // YYYY-MM-DD
  dueDatetime: string | null;
  dueTime: string | null;  // HH:MM[:SS]
  status: 'Overdue' | 'Due Today' | 'Upcoming';
  // navigation / interaction payload
  isPreview?: boolean;
  earlyPayload?: EarlyPreviewPayload;
  onOpen?: () => void;
  description?: string | null;
};

function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}

/** Staff checklists due today or earlier (overdue) — assigned to me or my department. */
function useStaffOpenChecklists() {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ['staff-action-dashboard', 'checklists', user?.id, profile?.department],
    enabled: !!user,
    queryFn: async () => {
      // Two queries OR'd by app code (RLS already gates rows).
      const today = todayVN();
      const base = supabase
        .from('checklist_instances')
        .select('id, template_id, scheduled_date, due_datetime, status, department, branch_id, assigned_to, branch:branches(id, name), template:checklist_templates(title, code)')
        .not('status', 'in', '(completed,verified)')
        .is('archive_hidden_at', null)
        .lte('scheduled_date', today);

      const [{ data: mine }, { data: dept }] = await Promise.all([
        base.eq('assigned_to', user!.id),
        profile?.department
          ? supabase
              .from('checklist_instances')
              .select('id, template_id, scheduled_date, due_datetime, status, department, branch_id, assigned_to, branch:branches(id, name), template:checklist_templates(title, code)')
              .not('status', 'in', '(completed,verified)')
              .is('archive_hidden_at', null)
              .lte('scheduled_date', today)
              .eq('department', profile.department)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const map = new Map<string, any>();
      for (const r of [...(mine ?? []), ...(dept ?? [])]) map.set(r.id, r);
      return Array.from(map.values());
    },
  });
}

/** Active maintenance schedule templates visible to staff (for the 7-day preview). */
function useStaffSchedules() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['staff-action-dashboard', 'schedules', profile?.user_id, profile?.department, profile?.branch_id],
    enabled: !!profile?.user_id,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('maintenance_schedule_templates')
        .select('*')
        .eq('status', 'active');
      const list = rows ?? [];
      if (!list.length) return [] as any[];
      const assetIds = Array.from(new Set(list.map(r => r.asset_id)));
      const { data: assets } = await supabase
        .from('maintenance_assets')
        .select('id, name, code, branch_id, department')
        .in('id', assetIds);
      const branchIds = Array.from(new Set((assets ?? []).map(a => a.branch_id).filter(Boolean)));
      const { data: branches } = branchIds.length
        ? await supabase.from('branches').select('id, name').in('id', branchIds)
        : { data: [] as { id: string; name: string }[] };
      const aMap = new Map((assets ?? []).map(a => [a.id, a]));
      const bMap = new Map((branches ?? []).map(b => [b.id, b.name]));
      return list.map(r => {
        const a = aMap.get(r.asset_id);
        return {
          ...r,
          asset_code: a?.code ?? null,
          asset_name: a?.name ?? null,
          asset_branch_id: a?.branch_id ?? null,
          asset_branch_name: a ? bMap.get(a.branch_id) ?? null : null,
          asset_department: a?.department ?? null,
        };
      });
    },
  });
}

export default function StaffActionDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: checklists = [], isLoading: loadingChk } = useStaffOpenChecklists();
  const { data: maintTasks = [], isLoading: loadingMT } = useMaintenanceTasks();
  const { data: schedules = [], isLoading: loadingSch } = useStaffSchedules();
  const { data: lastExecMap } = useLastExecutionByTemplate();

  const [previewTask, setPreviewTask] = useState<ActionItem | null>(null);
  const [earlyPayload, setEarlyPayload] = useState<EarlyPreviewPayload | null>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayISO = todayVN();
  const horizonISO = localISO(addDays(today, 7));

  // Filter maintenance tasks to staff scope (assigned to me OR my dept)
  const myMaintTasks = useMemo(() => {
    return (maintTasks as EnrichedMaintenanceTask[]).filter(t => {
      if (t.status === 'Done') return false;
      const mine = t.assigned_staff_id === profile?.user_id;
      const dept = !!t.assigned_department && t.assigned_department === profile?.department;
      const branchMatch = !!profile?.branch_id && t.asset_branch_id === profile.branch_id;
      return mine || (dept && branchMatch);
    });
  }, [maintTasks, profile]);

  // ----- Build sections -----
  const items: ActionItem[] = useMemo(() => {
    const out: ActionItem[] = [];

    // Checklists -> overdue or due today
    for (const c of checklists as any[]) {
      const dueISO = c.scheduled_date as string;
      const isOverdue = dueISO < todayISO || c.status === 'late' || c.status === 'escalated';
      const status: ActionItem['status'] = isOverdue ? 'Overdue' : 'Due Today';
      const code = c.template?.code ? `${c.template.code} · ` : '';
      out.push({
        key: `chk_${c.id}`,
        type: 'checklist',
        title: `${code}${c.template?.title ?? 'Checklist'}`,
        branchName: c.branch?.name ?? null,
        department: c.department ?? null,
        dueISO,
        dueDatetime: c.due_datetime ?? null,
        dueTime: null,
        status,
        onOpen: () => navigate('/checklists'),
      });
    }

    // Real maintenance tasks (overdue + today)
    const realKeys = new Set<string>();
    for (const t of myMaintTasks) {
      const isOverdue = t.status === 'Overdue' || (t.status === 'Pending' && t.due_date < todayISO);
      const isToday = t.due_date === todayISO;
      if (!isOverdue && !isToday) continue;
      realKeys.add(`${t.schedule_template_id}_${t.due_date}`);
      out.push({
        key: `mt_${t.id}`,
        type: 'maintenance',
        title: `${t.asset_code ? `${t.asset_code} · ` : ''}${t.title}`,
        branchName: t.asset_branch_name,
        department: t.assigned_department ?? t.asset_department,
        dueISO: t.due_date,
        dueDatetime: null,
        dueTime: t.due_time,
        status: isOverdue ? 'Overdue' : 'Due Today',
        onOpen: () => navigate('/maintenance'),
      });
    }

    // Schedule preview — next 7 days (excluding today/overdue real tasks)
    const visibleScheds = (schedules as any[]).filter(s => {
      const mine = s.assigned_staff_id === profile?.user_id;
      const dept = !!s.assigned_department && s.assigned_department === profile?.department;
      const branchMatch = !!profile?.branch_id && s.asset_branch_id === profile.branch_id;
      return mine || (dept && branchMatch);
    });
    for (const s of visibleScheds) {
      const lastISO = lastExecMap?.get(s.id) ?? null;
      const lastDate = parseLocalDate(lastISO);
      const tomorrowISO = localISO(addDays(today, 1));
      const occISOs = occurrencesInRange(
        s.frequency as Frequency,
        s.custom_interval_days,
        new Date(s.created_at),
        lastDate,
        tomorrowISO,
        horizonISO,
      );
      for (const dayISO of occISOs) {
        const key = `${s.id}_${dayISO}`;
        if (realKeys.has(key)) continue;
        out.push({
          key: `prev_${key}`,
          type: 'maintenance',
          title: `${s.asset_code ? `${s.asset_code} · ` : ''}${s.title}`,
          branchName: s.asset_branch_name,
          department: s.assigned_department ?? s.asset_department,
          dueISO: dayISO,
          dueDatetime: null,
          dueTime: s.due_time,
          status: 'Upcoming',
          isPreview: true,
          earlyPayload: {
            schedule_template_id: s.id,
            asset_id: s.asset_id,
            title: s.title,
            due_date: dayISO,
            due_time: s.due_time,
            assigned_staff_id: s.assigned_staff_id,
            assigned_department: s.assigned_department,
            asset_code: s.asset_code,
            asset_name: s.asset_name,
            asset_branch_name: s.asset_branch_name,
            asset_department: s.asset_department,
            template_description: s.description ?? null,
            note_required: !!s.note_required,
            photo_required: !!s.photo_required,
          },
          description: s.description ?? null,
        });
      }
    }
    return out;
  }, [checklists, myMaintTasks, schedules, todayISO, horizonISO, today, profile, navigate, lastExecMap]);

  const overdue = useMemo(
    () => items.filter(i => i.status === 'Overdue').sort((a, b) => a.dueISO.localeCompare(b.dueISO)),
    [items],
  );
  const dueToday = useMemo(
    () => items.filter(i => i.status === 'Due Today').sort((a, b) => {
      const at = a.dueDatetime ?? `${a.dueISO}T${a.dueTime ?? '23:59'}`;
      const bt = b.dueDatetime ?? `${b.dueISO}T${b.dueTime ?? '23:59'}`;
      return at.localeCompare(bt);
    }),
    [items],
  );
  const upcoming = useMemo(
    () => items.filter(i => i.status === 'Upcoming').sort((a, b) => {
      if (a.dueISO !== b.dueISO) return a.dueISO.localeCompare(b.dueISO);
      return (a.dueTime ?? '').localeCompare(b.dueTime ?? '');
    }),
    [items],
  );

  const isLoading = loadingChk || loadingMT || loadingSch;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your tasks…
      </div>
    );
  }

  if (overdue.length === 0 && dueToday.length === 0 && upcoming.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-heading font-semibold">All clear — no tasks due now.</h3>
        <p className="mt-1 text-sm text-muted-foreground">You're all caught up. Enjoy your day.</p>
      </Card>
    );
  }

  const handleClick = (it: ActionItem) => {
    if (it.isPreview) setPreviewTask(it);
    else it.onOpen?.();
  };

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <Section title="Overdue" count={overdue.length} accent="destructive" icon={AlertTriangle}>
          {overdue.map(it => <ActionRow key={it.key} item={it} onClick={() => handleClick(it)} />)}
        </Section>
      )}
      {dueToday.length > 0 && (
        <Section title="Due Today" count={dueToday.length} accent="warning" icon={Clock}>
          {dueToday.map(it => <ActionRow key={it.key} item={it} onClick={() => handleClick(it)} />)}
        </Section>
      )}
      {upcoming.length > 0 && (
        <Section title="Next 7 Days · Maintenance" count={upcoming.length} icon={CalendarClock}>
          {upcoming.map(it => <ActionRow key={it.key} item={it} onClick={() => handleClick(it)} />)}
        </Section>
      )}

      <PreviewDialog item={previewTask} onClose={() => setPreviewTask(null)} />
      {earlyPayload && (
        <TaskCompletionDialog
          preview={earlyPayload}
          onOpenChange={(v) => { if (!v) setEarlyPayload(null); }}
        />
      )}
    </div>
  );
}

function Section({
  title, count, accent, icon: Icon, children,
}: {
  title: string;
  count: number;
  accent?: 'destructive' | 'warning';
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  const headerCls =
    accent === 'destructive' ? 'text-destructive'
    : accent === 'warning' ? 'text-amber-600 dark:text-amber-400'
    : 'text-foreground';
  return (
    <div>
      <div className={`flex items-center gap-2 mb-3 ${headerCls}`}>
        <Icon className="h-4 w-4" />
        <h2 className="text-base font-heading font-semibold">
          {title} <span className="text-muted-foreground font-normal">({count})</span>
        </h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: ActionItem['status'] }) {
  if (status === 'Overdue')
    return <Badge variant="destructive" className="gap-1 text-[10px] uppercase"><AlertTriangle className="h-3 w-3" />Overdue</Badge>;
  if (status === 'Due Today')
    return <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1 text-[10px]"><Clock className="h-3 w-3" />Due Today</Badge>;
  return <Badge variant="outline" className="gap-1 text-[10px]"><CalendarClock className="h-3 w-3" />Upcoming</Badge>;
}

function TypeBadge({ type }: { type: ActionItem['type'] }) {
  if (type === 'checklist')
    return <Badge variant="secondary" className="gap-1 text-[10px]"><ClipboardCheck className="h-3 w-3" />Checklist</Badge>;
  return <Badge variant="secondary" className="gap-1 text-[10px]"><Wrench className="h-3 w-3" />Maintenance</Badge>;
}

function ActionRow({ item, onClick }: { item: ActionItem; onClick: () => void }) {
  const dueText =
    item.dueDatetime ? formatVN(item.dueDatetime)
    : item.dueTime ? `${item.dueISO} · ${item.dueTime.slice(0, 5)}`
    : item.dueISO;
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-sm font-semibold leading-tight truncate">{item.title}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={item.type} />
            <StatusPill status={item.status} />
            {item.isPreview && (
              <Badge variant="outline" className="gap-1 text-[10px]"><Lock className="h-3 w-3" />Preview</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {item.branchName ?? '—'}
            {item.department && <> · <span className="capitalize">{item.department}</span></>}
            {' · '}{dueText}
          </div>
        </div>
        <Button
          size="lg"
          variant={item.isPreview ? 'outline' : 'default'}
          className="w-full sm:w-auto sm:min-w-[110px] h-11"
          onClick={onClick}
        >
          {item.isPreview ? 'Preview' : 'Open'}
        </Button>
      </div>
    </Card>
  );
}

function PreviewDialog({ item, onClose }: { item: ActionItem | null; onClose: () => void }) {
  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                {item.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {item.description?.trim() ? (
                <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap">{item.description}</div>
              ) : (
                <div className="text-muted-foreground italic">No job description provided.</div>
              )}
              <div className="rounded-md border p-3 space-y-1 text-xs">
                <div><span className="text-muted-foreground">Branch:</span> {item.branchName ?? '—'}</div>
                <div><span className="text-muted-foreground">Department:</span> <span className="capitalize">{item.department ?? '—'}</span></div>
                <div><span className="text-muted-foreground">Due:</span> {item.dueISO}{item.dueTime ? ` · ${item.dueTime.slice(0, 5)}` : ''}</div>
              </div>
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                This task will be available for completion on its due date.
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}