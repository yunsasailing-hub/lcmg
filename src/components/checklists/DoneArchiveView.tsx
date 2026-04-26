import { useMemo, useState } from 'react';
import { CircleCheck, MapPin, User as UserIcon, Calendar, Camera, MessageSquare, EyeOff, Eye, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
import { TemplateCodeBadge } from '@/components/checklists/TemplateCodeBadge';

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
  selectable,
  selected,
  onToggleSelect,
  onHide,
  onUnhide,
}: {
  instance: any;
  ownerView?: boolean;
  onOpen: (i: any) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onHide?: (id: string) => void;
  onUnhide?: (id: string) => void;
}) {
  const tpl = instance.template;
  const cfg = statusConfig[instance.status] ?? { label: instance.status, className: '' };
  const branchLabel =
    instance.resolved_branch?.name
    ?? instance.branch?.name
    ?? (ownerView ? 'Unassigned — Needs Review' : 'Unknown / Legacy');
  const completedAt = instance.submitted_at ?? instance.completed_at ?? null;
  const isHidden = !!instance.archive_hidden_at;

  return (
    <div className="flex items-stretch gap-2 rounded-lg border bg-card hover:bg-muted/40 transition-colors px-2 py-2 sm:px-3 sm:py-2.5">
      {selectable && (
        <div className="flex items-start pt-1">
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => onToggleSelect?.(instance.id)}
            aria-label="Select archive record"
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => onOpen(instance)}
        className="flex-1 min-w-0 text-left flex flex-col gap-1.5"
      >
        <div className="flex items-center gap-2 min-w-0">
          <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="flex-1 min-w-0 font-heading font-semibold text-sm sm:text-base text-foreground leading-tight truncate">
            {tpl?.code ? (
              <>
                <span className="font-mono text-muted-foreground">{tpl.code}</span>
                <span className="text-muted-foreground"> · </span>
              </>
            ) : null}
            {tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}
          </p>
          {isHidden && (
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">
              Hidden
            </Badge>
          )}
          <Badge className={`${cfg.className} shrink-0 text-[10px] px-1.5 py-0`}>{cfg.label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] sm:text-xs text-muted-foreground pl-6">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /><span className="text-foreground font-medium">{branchLabel}</span></span>
          <span><span className="text-muted-foreground/70">Type:</span> <span className="text-foreground font-medium capitalize">{instance.checklist_type}</span></span>
          {instance.assignee?.full_name && (
            <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /><span className="text-foreground font-medium truncate max-w-[180px]">{instance.assignee.full_name}</span></span>
          )}
          {completedAt && (
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /><span className="text-foreground font-medium">{formatVNDateTime(completedAt)}</span></span>
          )}
        </div>
      </button>
      {ownerView && (
        <div className="flex items-start pt-1">
          {isHidden ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); onUnhide?.(instance.id); }}
              title="Unhide"
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              Unhide
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); onHide?.(instance.id); }}
              title="Hide from Archive"
            >
              <EyeOff className="h-3.5 w-3.5 mr-1" />
              Hide
            </Button>
          )}
        </div>
      )}
    </div>
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
            {tpl?.code ? (
              <>
                <span className="font-mono text-muted-foreground">{tpl.code}</span>
                <span className="text-muted-foreground"> · </span>
              </>
            ) : null}
            {tpl?.title ?? 'Checklist'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <TemplateCodeBadge code={tpl?.code} />
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
  const queryClient = useQueryClient();

  // No date filter → fetch all instances; we filter to done statuses below.
  const { data, isLoading } = useAllChecklists();

  const [openInstance, setOpenInstance] = useState<any | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [confirmUnhideId, setConfirmUnhideId] = useState<string | null>(null);

  const hideMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('checklist_instances')
        .update({ archive_hidden_at: new Date().toISOString(), archive_hidden_by: user!.id })
        .in('id', ids);
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) => {
      toast.success(ids.length === 1 ? 'Hidden from archive' : `${ids.length} records hidden`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to hide'),
  });

  const unhideMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('checklist_instances')
        .update({ archive_hidden_at: null, archive_hidden_by: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Restored to archive');
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to unhide'),
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const archived = useMemo(() => {
    let all = (data ?? []).filter((c: any) => DONE_STATUSES.includes(c.status));
    // Hide archive-hidden records by default. Owner toggle can show them.
    if (!(isOwner && showHidden)) {
      all = all.filter((c: any) => !c.archive_hidden_at);
    }
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
  }, [data, isOwner, showHidden, profile?.department, profile?.branch_id, user?.id]);

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

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
      {isOwner && (
        <div className="flex flex-wrap items-center gap-3 mb-3 px-1">
          <div className="flex items-center gap-2">
            <Switch id="show-hidden" checked={showHidden} onCheckedChange={setShowHidden} />
            <Label htmlFor="show-hidden" className="text-sm cursor-pointer">
              Show Hidden Archive Records
            </Label>
          </div>
          {selected.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setConfirmIds(Array.from(selected))}
              disabled={hideMutation.isPending}
            >
              {hideMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
              Hide Selected from Archive ({selected.size})
            </Button>
          )}
        </div>
      )}

      {!archived.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
            <CircleCheck className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-heading font-semibold text-foreground">Archive is empty</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Completed checklists will appear here, grouped by department, branch and month.
          </p>
        </div>
      ) : (
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
                                        selectable={isOwner && !it.archive_hidden_at}
                                        selected={selected.has(it.id)}
                                        onToggleSelect={toggleSelect}
                                        onHide={(id) => setConfirmIds([id])}
                                        onUnhide={(id) => setConfirmUnhideId(id)}
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
      )}

      <ArchiveDetailDialog
        instance={openInstance}
        open={!!openInstance}
        onClose={() => setOpenInstance(null)}
      />

      <AlertDialog open={!!confirmIds} onOpenChange={(v) => !v && setConfirmIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide from Archive</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmIds && confirmIds.length > 1
                ? 'Hide selected completed checklists from normal archive view?'
                : 'Hide this completed checklist from normal archive view?'}
              <br />
              <span className="text-xs mt-2 block">
                Records, photos, notes and history are preserved and remain available to Owners via "Show Hidden Archive Records".
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmIds) hideMutation.mutate(confirmIds);
                setConfirmIds(null);
              }}
            >
              Hide
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmUnhideId} onOpenChange={(v) => !v && setConfirmUnhideId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore to Archive</AlertDialogTitle>
            <AlertDialogDescription>
              Restore this checklist to the normal archive view?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmUnhideId) unhideMutation.mutate(confirmUnhideId);
                setConfirmUnhideId(null);
              }}
            >
              Unhide
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}