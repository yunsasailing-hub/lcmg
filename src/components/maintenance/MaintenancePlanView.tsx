import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle, Clock, Camera, StickyNote, Wrench, ChevronDown, CalendarClock, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  useMaintenanceTasks,
  todayLocalISO,
  type EnrichedMaintenanceTask,
} from '@/hooks/useMaintenanceTasks';
import { useLastExecutionByTemplate, parseLocalDate } from '@/hooks/useLastExecutionByTemplate';
import { occurrencesInRange } from '@/lib/maintenanceSchedule';
import type { EarlyPreviewPayload } from './TaskCompletionDialog';
import type { Database } from '@/integrations/supabase/types';

type ScheduleTemplate = Database['public']['Tables']['maintenance_schedule_templates']['Row'];
type Frequency = Database['public']['Enums']['maintenance_schedule_frequency'];

type PlanItem = {
  key: string;
  // identity
  isReal: boolean;                 // true if backed by an existing maintenance_tasks row
  realTask?: EnrichedMaintenanceTask;
  preview?: EarlyPreviewPayload;
  // display
  title: string;
  asset_code: string | null;
  asset_name: string | null;
  asset_branch_name: string | null;
  department: string | null;
  due_date: string;                // YYYY-MM-DD (local)
  due_time: string | null;
  status: 'Overdue' | 'Due Today' | 'Upcoming' | 'Pending';
  note_required: boolean;
  photo_required: boolean;
  has_tech: boolean;
  description: string | null;
};

function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

/**
 * Hook: loads active schedule templates the current user is allowed to act on,
 * enriched with asset (code/name/branch). RLS already filters by branch for managers
 * and by branch+department for staff via the assets table; we additionally filter
 * client-side by assigned_staff_id / assigned_department for staff.
 */
function useAllSchedulesForPlan() {
  return useQuery({
    queryKey: ['maintenance_plan_schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_schedule_templates')
        .select('*')
        .eq('status', 'active');
      if (error) throw error;
      const rows = (data ?? []) as ScheduleTemplate[];
      const assetIds = Array.from(new Set(rows.map(r => r.asset_id)));
      const { data: assets } = assetIds.length
        ? await supabase
            .from('maintenance_assets')
            .select('id, name, code, branch_id, department')
            .in('id', assetIds)
        : { data: [] as Array<{ id: string; name: string; code: string; branch_id: string; department: string }> };
      const branchIds = Array.from(new Set((assets ?? []).map(a => a.branch_id).filter(Boolean)));
      const { data: branches } = branchIds.length
        ? await supabase.from('branches').select('id, name').in('id', branchIds)
        : { data: [] as { id: string; name: string }[] };
      const aMap = new Map((assets ?? []).map(a => [a.id, a]));
      const bMap = new Map((branches ?? []).map(b => [b.id, b.name]));
      return rows.map(r => {
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

export interface MaintenancePlanViewProps {
  /** Open a real task (existing maintenance_tasks row) in the completion dialog. */
  onOpenTask: (task: EnrichedMaintenanceTask) => void;
  /** Open an upcoming preview occurrence in the completion dialog (early-complete flow). */
  onOpenPreview?: (preview: EarlyPreviewPayload) => void;
}

export default function MaintenancePlanView({ onOpenTask, onOpenPreview }: MaintenancePlanViewProps) {
  const { profile, hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const isManager = hasRole('manager');

  const { data: tasks = [], isLoading: loadingTasks } = useMaintenanceTasks();
  const { data: schedules = [], isLoading: loadingScheds } = useAllSchedulesForPlan();
  const { data: lastExecMap } = useLastExecutionByTemplate();

  const [previewItem, setPreviewItem] = useState<PlanItem | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayISO = todayLocalISO();

  // Week boundaries (Mon-Sun)
  const w1Start = useMemo(() => startOfWeekMonday(today), [today]);
  const weeks = useMemo(() => {
    const arr = [] as { start: Date; end: Date; startISO: string; endISO: string }[];
    for (let i = 0; i < 4; i++) {
      const start = addDays(w1Start, i * 7);
      const end = addDays(start, 6);
      arr.push({ start, end, startISO: localISO(start), endISO: localISO(end) });
    }
    return arr;
  }, [w1Start]);

  // Visibility scoping
  const canSeeTask = (t: EnrichedMaintenanceTask): boolean => {
    if (isOwner) return true;
    if (isManager) return profile?.branch_id ? t.asset_branch_id === profile.branch_id : false;
    const mine = t.assigned_staff_id === profile?.user_id;
    const branchMatch = !!profile?.branch_id && t.asset_branch_id === profile.branch_id;
    const deptMatch = !!t.assigned_department && t.assigned_department === profile?.department;
    return mine || (deptMatch && branchMatch);
  };
  const canSeeSchedule = (s: ReturnType<typeof useAllSchedulesForPlan>['data'] extends (infer U)[] ? U : never): boolean => {
    if (isOwner) return true;
    if (isManager) return profile?.branch_id ? s.asset_branch_id === profile.branch_id : false;
    const mine = s.assigned_staff_id === profile?.user_id;
    const branchMatch = !!profile?.branch_id && s.asset_branch_id === profile.branch_id;
    const deptMatch = !!s.assigned_department && s.assigned_department === profile?.department;
    return mine || (deptMatch && branchMatch);
  };

  // Compose plan items from schedules across the next 30 days.
  const items: PlanItem[] = useMemo(() => {
    const out: PlanItem[] = [];

    // 1) All real tasks visible to user that are overdue or due in the 4-week window.
    const planEnd = weeks[3].end;
    const planEndISO = weeks[3].endISO;
    const visibleTasks = (tasks as EnrichedMaintenanceTask[]).filter(canSeeTask);
    const realByKey = new Map<string, EnrichedMaintenanceTask>();
    for (const t of visibleTasks) {
      // Skip completed tasks from the plan
      if (t.status === 'Done') continue;
      // Include overdue regardless of date; otherwise must be within window
      const isOverdueRow = t.status === 'Overdue' || (t.status === 'Pending' && t.due_date < todayISO);
      const inWindow = t.due_date >= todayISO && t.due_date <= planEndISO;
      if (!isOverdueRow && !inWindow) continue;
      const key = `${t.schedule_template_id}_${t.due_date}`;
      realByKey.set(key, t);
      out.push({
        key: `real_${t.id}`,
        isReal: true,
        realTask: t,
        title: t.title,
        asset_code: t.asset_code,
        asset_name: t.asset_name,
        asset_branch_name: t.asset_branch_name,
        department: t.assigned_department ?? t.asset_department,
        due_date: t.due_date,
        due_time: t.due_time,
        status: isOverdueRow ? 'Overdue' : t.due_date === todayISO ? 'Due Today' : 'Upcoming',
        note_required: !!t.note_required,
        photo_required: !!t.photo_required,
        has_tech: !!((t as any).cost_amount != null || (t as any).technical_note || (t as any).spare_parts),
        description: (t as any).template_description ?? null,
      });
    }

    // 2) Compute upcoming occurrences from schedule templates (preview only),
    //    skipping any (template, date) pair already represented as a real task.
    const visibleSchedules = (schedules as any[]).filter(canSeeSchedule);
    const planEndISOForPreview = weeks[3].endISO;
    for (const s of visibleSchedules) {
      const lastISO = lastExecMap?.get(s.id) ?? null;
      const lastDate = parseLocalDate(lastISO);
      const occISOs = occurrencesInRange(
        s.frequency as Frequency,
        s.custom_interval_days,
        new Date(s.created_at),
        lastDate,
        todayISO,
        planEndISOForPreview,
      );
      for (const dayISO of occISOs) {
        const key = `${s.id}_${dayISO}`;
        if (realByKey.has(key)) continue; // real task already exists for this day
        out.push({
          key: `prev_${key}`,
          isReal: false,
          preview: {
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
          title: s.title,
          asset_code: s.asset_code,
          asset_name: s.asset_name,
          asset_branch_name: s.asset_branch_name,
          department: s.assigned_department ?? s.asset_department,
          due_date: dayISO,
          due_time: s.due_time,
          status: dayISO === todayISO ? 'Due Today' : 'Upcoming',
          note_required: !!s.note_required,
          photo_required: !!s.photo_required,
          has_tech: false,
          description: s.description ?? null,
        });
      }
    }

    return out;
  }, [tasks, schedules, weeks, todayISO, today, profile, isOwner, isManager, lastExecMap]);

  // Group: Overdue + 4 weeks
  const groups = useMemo(() => {
    const overdue: PlanItem[] = [];
    const w: PlanItem[][] = [[], [], [], []];
    const sortFn = (a: PlanItem, b: PlanItem) => {
      if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
      return (a.due_time ?? '').localeCompare(b.due_time ?? '');
    };
    for (const it of items) {
      if (it.status === 'Overdue') { overdue.push(it); continue; }
      const wi = weeks.findIndex(wk => it.due_date >= wk.startISO && it.due_date <= wk.endISO);
      if (wi >= 0) w[wi].push(it);
    }
    overdue.sort(sortFn);
    w.forEach(arr => arr.sort(sortFn));
    return { overdue, weeks: w };
  }, [items, weeks]);

  if (loadingTasks || loadingScheds) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading 30-day plan…
      </div>
    );
  }

  const handleClick = (it: PlanItem) => {
    if (it.isReal && it.realTask) onOpenTask(it.realTask);
    else setPreviewItem(it);
  };

  return (
    <div className="space-y-3">
      <PlanGroup
        title="Overdue"
        accent="destructive"
        defaultOpen
        items={groups.overdue}
        onClick={handleClick}
      />
      <PlanGroup
        title="This Week"
        subtitle={fmtRange(weeks[0].start, weeks[0].end)}
        defaultOpen
        items={groups.weeks[0]}
        onClick={handleClick}
      />
      <PlanGroup
        title="Next Week"
        subtitle={fmtRange(weeks[1].start, weeks[1].end)}
        items={groups.weeks[1]}
        onClick={handleClick}
      />
      <PlanGroup
        title="Week 3"
        subtitle={fmtRange(weeks[2].start, weeks[2].end)}
        items={groups.weeks[2]}
        onClick={handleClick}
      />
      <PlanGroup
        title="Week 4"
        subtitle={fmtRange(weeks[3].start, weeks[3].end)}
        items={groups.weeks[3]}
        onClick={handleClick}
      />

      <PreviewDialog
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onCompleteEarly={(it) => {
          if (it.preview && onOpenPreview) {
            onOpenPreview(it.preview);
            setPreviewItem(null);
          }
        }}
      />
    </div>
  );
}

function PlanGroup({
  title, subtitle, items, onClick, defaultOpen, accent,
}: {
  title: string;
  subtitle?: string;
  items: PlanItem[];
  onClick: (it: PlanItem) => void;
  defaultOpen?: boolean;
  accent?: 'destructive';
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const headerCls = accent === 'destructive'
    ? 'border-destructive/40 bg-destructive/5'
    : 'bg-muted/40';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={`overflow-hidden border ${accent === 'destructive' ? 'border-destructive/40' : ''}`}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={`w-full flex items-center justify-between px-3 py-2 text-left ${headerCls} hover:bg-muted/60 transition`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {accent === 'destructive' && <AlertTriangle className="h-4 w-4 text-destructive" />}
              <div className="font-semibold truncate">
                {title}
                <span className="ml-2 text-xs font-normal text-muted-foreground">({items.length})</span>
              </div>
              {subtitle && <span className="text-xs text-muted-foreground truncate">· {subtitle}</span>}
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">No tasks.</div>
          ) : (
            <ul className="divide-y">
              {items.map(it => (
                <li key={it.key}>
                  <PlanRow item={it} onClick={() => onClick(it)} />
                </li>
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function StatusPill({ status }: { status: PlanItem['status'] }) {
  if (status === 'Overdue')
    return <Badge variant="destructive" className="gap-1 text-[10px] uppercase"><AlertTriangle className="h-3 w-3" />Overdue</Badge>;
  if (status === 'Due Today')
    return <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1 text-[10px]"><Clock className="h-3 w-3" />Due Today</Badge>;
  return <Badge variant="outline" className="gap-1 text-[10px]"><CalendarClock className="h-3 w-3" />Upcoming</Badge>;
}

function PlanRow({ item, onClick }: { item: PlanItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition flex flex-col gap-1"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {item.asset_code && <span className="font-mono text-xs text-muted-foreground mr-1">{item.asset_code}</span>}
            {item.title}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {item.asset_name ?? '—'}
            {item.asset_branch_name ? ` · ${item.asset_branch_name}` : ''}
            {item.department ? <span className="capitalize"> · {item.department}</span> : null}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <StatusPill status={item.status} />
          <div className="text-[11px] text-muted-foreground whitespace-nowrap">
            {item.due_date}{item.due_time ? ` · ${item.due_time.slice(0, 5)}` : ''}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        {!item.isReal && (
          <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="h-3 w-3" />Preview</Badge>
        )}
        {item.note_required && <Badge variant="outline" className="gap-1 text-[10px]"><StickyNote className="h-3 w-3" />Note</Badge>}
        {item.photo_required && <Badge variant="outline" className="gap-1 text-[10px]"><Camera className="h-3 w-3" />Photo</Badge>}
        {item.has_tech && <Badge variant="outline" className="gap-1 text-[10px]"><Wrench className="h-3 w-3" />Tech</Badge>}
      </div>
    </button>
  );
}

function PreviewDialog({
  item, onClose, onCompleteEarly,
}: {
  item: PlanItem | null;
  onClose: () => void;
  onCompleteEarly?: (it: PlanItem) => void;
}) {
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
                <div><span className="text-muted-foreground">Equipment:</span> {item.asset_code ? `${item.asset_code} — ` : ''}{item.asset_name ?? '—'}</div>
                <div><span className="text-muted-foreground">Branch:</span> {item.asset_branch_name ?? '—'}</div>
                <div><span className="text-muted-foreground">Department:</span> <span className="capitalize">{item.department ?? '—'}</span></div>
                <div><span className="text-muted-foreground">Due:</span> {item.due_date}{item.due_time ? ` · ${item.due_time.slice(0, 5)}` : ''}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {item.note_required && <Badge variant="outline" className="gap-1 text-[10px]"><StickyNote className="h-3 w-3" />Note required</Badge>}
                {item.photo_required && <Badge variant="outline" className="gap-1 text-[10px]"><Camera className="h-3 w-3" />Photo required</Badge>}
              </div>
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                This task is scheduled for a future date. You may complete it early if the work has already been done.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
              {onCompleteEarly && item.preview && (
                <Button onClick={() => onCompleteEarly(item)}>Complete Early</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}