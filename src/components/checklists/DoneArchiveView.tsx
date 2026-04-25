import { useMemo, useState } from 'react';
import { CircleCheck, MapPin, User as UserIcon, Calendar, Camera, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { formatVN, formatVNDateTime } from '@/lib/timezone';
import {
  useAllChecklists,
  useTemplateTasks,
  useTaskCompletions,
  type ChecklistStatus,
} from '@/hooks/useChecklists';

const DONE_STATUSES: ChecklistStatus[] = ['completed', 'verified'];

const statusConfig: Record<string, { label: string; className: string }> = {
  completed: { label: 'Done', className: 'bg-emerald-600 text-white hover:bg-emerald-600/80' },
  verified: { label: 'Verified', className: 'bg-ring text-primary-foreground hover:bg-ring/80' },
};

function monthKey(dateStr: string) {
  // dateStr is yyyy-MM-dd; group by yyyy-MM
  return dateStr.slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
}

function ArchiveRow({
  instance,
  ownerView,
  onOpen,
}: {
  instance: any;
  ownerView?: boolean;
  onOpen: (i: any) => void;
}) {
  const tpl = instance.template;
  const cfg = statusConfig[instance.status] ?? { label: instance.status, className: '' };
  const branchLabel =
    instance.resolved_branch?.name
    ?? instance.branch?.name
    ?? (ownerView ? 'Unassigned — Needs Review' : 'Unknown / Legacy');
  const completedAt = instance.submitted_at ?? instance.completed_at ?? null;

  return (
    <button
      type="button"
      onClick={() => onOpen(instance)}
      className="w-full text-left flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/40 transition-colors"
    >
      <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground truncate">
          {tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
          <span className="capitalize">{instance.checklist_type}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            {branchLabel}
          </span>
          {instance.assignee?.full_name && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5 truncate">
                <UserIcon className="h-3 w-3" />
                {instance.assignee.full_name}
              </span>
            </>
          )}
          {completedAt && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <Calendar className="h-3 w-3" />
                {formatVNDateTime(completedAt)}
              </span>
            </>
          )}
        </div>
      </div>
      <Badge className={cfg.className}>{cfg.label}</Badge>
    </button>
  );
}

function ArchiveDetailDialog({
  instance,
  open,
  onClose,
}: {
  instance: any | null;
  open: boolean;
  onClose: () => void;
}) {
  const templateId = instance?.template_id ?? undefined;
  const instanceId = instance?.id ?? undefined;
  const { data: tasks } = useTemplateTasks(templateId);
  const { data: completions } = useTaskCompletions(instanceId);

  const completionMap = useMemo(() => {
    const map: Record<string, any> = {};
    completions?.forEach(c => { map[c.task_id] = c; });
    return map;
  }, [completions]);

  const tpl = instance?.template;
  const branchLabel =
    instance?.resolved_branch?.name ?? instance?.branch?.name ?? '—';
  const submittedAt = instance?.submitted_at ?? instance?.completed_at ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {tpl?.title ?? 'Checklist'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="capitalize">{instance?.checklist_type}</span>
              <span>·</span>
              <span className="capitalize">{instance?.department}</span>
              <span>·</span>
              <span>{branchLabel}</span>
              {instance?.assignee?.full_name && (
                <>
                  <span>·</span>
                  <span>By {instance.assignee.full_name}</span>
                </>
              )}
              {submittedAt && (
                <>
                  <span>·</span>
                  <span>{formatVNDateTime(submittedAt)}</span>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {!tasks || tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No tasks recorded for this checklist.
            </p>
          ) : (
            tasks.map((task: any) => {
              const c = completionMap[task.id];
              const done = !!c?.is_completed;
              return (
                <div key={task.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <CircleCheck
                      className={`h-5 w-5 shrink-0 mt-0.5 ${
                        done ? 'text-emerald-600' : 'text-muted-foreground/40'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${done ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                        {task.title}
                      </p>
                      {c?.completed_at && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatVN(c.completed_at)}
                        </p>
                      )}
                      {c?.comment && (
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="whitespace-pre-wrap break-words">{c.comment}</span>
                        </div>
                      )}
                      {c?.photo_url && (
                        <a
                          href={c.photo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Camera className="h-3 w-3" />
                          View photo
                        </a>
                      )}
                    </div>
                  </div>
                  {c?.photo_url && (
                    <img
                      src={c.photo_url}
                      alt={task.title}
                      loading="lazy"
                      className="mt-2 max-h-64 w-full object-contain rounded border bg-muted"
                    />
                  )}
                </div>
              );
            })
          )}

          {instance?.notes && (
            <div className="rounded-lg border bg-muted/30 p-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap break-words">{instance.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DoneArchiveView() {
  const { user, profile, hasRole } = useAuth();
  const isOwner = hasRole('owner');

  // No date filter → fetch all instances; we filter to done statuses below.
  const { data, isLoading } = useAllChecklists();

  const [openInstance, setOpenInstance] = useState<any | null>(null);

  const archived = useMemo(() => {
    const all = (data ?? []).filter((c: any) => DONE_STATUSES.includes(c.status));
    if (isOwner) return all;
    // Manager scope: department match OR own assignments.
    const myDept = profile?.department ?? null;
    const myBranch = profile?.branch_id ?? null;
    return all.filter((c: any) => {
      if (c.assigned_to === user?.id) return true;
      if (myDept && c.department === myDept) return true;
      // Branch-based fallback when manager has a branch
      if (myBranch && (c.resolved_branch?.id === myBranch || c.branch?.id === myBranch)) {
        return true;
      }
      return false;
    });
  }, [data, isOwner, profile?.department, profile?.branch_id, user?.id]);

  // Group: department → branch → month
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, any[]>>>();
    for (const it of archived) {
      const dept = it.department ?? 'unknown';
      const branchName =
        it.resolved_branch?.name
        ?? it.branch?.name
        ?? (isOwner ? 'Unassigned — Needs Review' : 'Unknown / Legacy');
      const mKey = monthKey(it.scheduled_date);
      if (!map.has(dept)) map.set(dept, new Map());
      const bm = map.get(dept)!;
      if (!bm.has(branchName)) bm.set(branchName, new Map());
      const mm = bm.get(branchName)!;
      if (!mm.has(mKey)) mm.set(mKey, []);
      mm.get(mKey)!.push(it);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dept, branches]) => ({
        dept,
        total: Array.from(branches.values()).reduce(
          (s, mm) => s + Array.from(mm.values()).reduce((ss, arr) => ss + arr.length, 0),
          0,
        ),
        branches: Array.from(branches.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([branch, months]) => ({
            branch,
            total: Array.from(months.values()).reduce((s, arr) => s + arr.length, 0),
            months: Array.from(months.entries())
              .sort(([a], [b]) => b.localeCompare(a)) // newest month first
              .map(([mk, list]) => ({
                key: mk,
                label: monthLabel(mk),
                list: list.sort((x, y) => {
                  const ax = x.submitted_at ?? x.completed_at ?? x.scheduled_date;
                  const ay = y.submitted_at ?? y.completed_at ?? y.scheduled_date;
                  return new Date(ay).getTime() - new Date(ax).getTime();
                }),
              })),
          })),
      }));
  }, [archived, isOwner]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (!archived.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
          <CircleCheck className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-heading font-semibold text-foreground">Archive is empty</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Completed checklists will appear here, grouped by department, branch and month.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
      {/* All accordions collapsed by default — uncontrolled with no defaultValue */}
      <Accordion type="multiple" className="space-y-2">
        {grouped.map(({ dept, total, branches }) => (
          <AccordionItem
            key={dept}
            value={dept}
            className="border rounded-lg bg-card overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-2 flex-1">
                <span className="font-heading font-semibold capitalize text-foreground">{dept}</span>
                <Badge variant="secondary" className="ml-1">{total}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-0">
              <Accordion type="multiple" className="space-y-1.5">
                {branches.map(({ branch, total: bTotal, months }) => {
                  const bKey = `${dept}::${branch}`;
                  return (
                    <AccordionItem
                      key={bKey}
                      value={bKey}
                      className="border rounded-md bg-background/50 overflow-hidden"
                    >
                      <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/40">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm font-medium text-foreground">{branch}</span>
                          <Badge variant="outline" className="ml-1">{bTotal}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-2 pb-2 pt-0">
                        <Accordion type="multiple" className="space-y-1">
                          {months.map(({ key, label, list }) => {
                            const mKey = `${bKey}::${key}`;
                            return (
                              <AccordionItem
                                key={mKey}
                                value={mKey}
                                className="border rounded bg-card overflow-hidden"
                              >
                                <AccordionTrigger className="px-3 py-1.5 hover:no-underline hover:bg-muted/40">
                                  <div className="flex items-center gap-2 flex-1">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-sm text-foreground">{label}</span>
                                    <Badge variant="outline" className="ml-1">{list.length}</Badge>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-2 pb-2 pt-0">
                                  <div className="flex flex-col gap-1.5">
                                    {list.map((it: any) => (
                                      <ArchiveRow
                                        key={it.id}
                                        instance={it}
                                        ownerView={isOwner}
                                        onOpen={setOpenInstance}
                                      />
                                    ))}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <ArchiveDetailDialog
        instance={openInstance}
        open={!!openInstance}
        onClose={() => setOpenInstance(null)}
      />
    </div>
  );
}