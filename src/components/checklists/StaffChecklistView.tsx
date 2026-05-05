import { useEffect, useState, useMemo } from 'react';
import { Camera, ChevronLeft, CircleCheck, Circle, AlertTriangle, Clock, MessageSquare, Send, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { formatVN, formatVNDateDMY, formatVNTimeHM } from '@/lib/timezone';
import { optimizeChecklistImage, ImageTooLargeError } from '@/lib/imageCompression';
import { logSaveStep } from '@/lib/saveDebug';
import PhotoSaveDebugPanel from './PhotoSaveDebugPanel';
import {
  useMyChecklists,
  useInstanceTasks,
  useTaskCompletions,
  useUpsertCompletion,
  useSubmitChecklist,
  useUpdateInstanceNotes,
  uploadChecklistPhoto,
  type ChecklistStatus,
} from '@/hooks/useChecklists';
import { useRecentlySubmitted } from '@/hooks/useChecklists';
import { TemplateCodeBadge } from '@/components/checklists/TemplateCodeBadge';
import { ChecklistPhotoPreview } from '@/components/checklists/ChecklistPhotoPreview';

// ─── Status helpers ───

// PATCH 3 — unified labels: only "Pending" or "Overdue" for active states.
const statusConfig: Record<ChecklistStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; className?: string }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  late: { label: 'Overdue', variant: 'destructive' },
  escalated: { label: 'Overdue', variant: 'destructive' },
  completed: { label: 'Done', variant: 'default', className: 'bg-emerald-600 text-white hover:bg-emerald-600/80' },
  verified: { label: 'Verified', variant: 'default', className: 'bg-ring text-primary-foreground hover:bg-ring/80' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

function formatDueTime(dueDatetime: string | null): string | null {
  if (!dueDatetime) return null;
  return formatVN(dueDatetime);
}

// ─── List View ───

function ChecklistList({ onSelect }: { onSelect: (id: string, templateId: string) => void }) {
  const { data: checklists, isLoading } = useMyChecklists();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (!checklists?.length) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
            <Circle className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-heading font-semibold text-foreground">No checklists today</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">You don't have any checklists assigned for today.</p>
        </div>
        <RecentlySubmittedSection />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
      {checklists.map(instance => {
        const tpl = instance.template as any;
        const cfg = statusConfig[instance.status as ChecklistStatus];
        const StatusIcon = instance.status === 'pending' ? Circle
          : instance.status === 'rejected' ? AlertTriangle
          : CircleCheck;
        const branchName = (instance as any).branch?.name ?? 'Unknown / Legacy';
        const dueText = (instance as any).due_datetime ? formatDueTime((instance as any).due_datetime) : null;
        const inst: any = instance;
        const dateSource = inst.due_datetime ?? inst.scheduled_date ?? inst.assigned_date ?? inst.created_at ?? null;
        const dateDMY = dateSource ? formatVNDateDMY(dateSource) : null;
        const dueHM = inst.due_datetime ? formatVNTimeHM(inst.due_datetime) : null;

        return (
          <button
            key={instance.id}
            onClick={() => onSelect(instance.id, instance.template_id)}
            className="w-full flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5 sm:px-4 sm:py-3 text-left transition-colors hover:bg-accent active:bg-accent"
          >
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon className={`h-4 w-4 shrink-0 ${instance.status === 'rejected' || instance.status === 'escalated' ? 'text-destructive' : instance.status === 'pending' || instance.status === 'late' ? 'text-muted-foreground' : 'text-emerald-600'}`} />
              <p className="flex-1 min-w-0 font-heading font-semibold text-sm sm:text-base text-foreground leading-tight truncate">
                {tpl?.code ? (
                  <>
                    <span className="font-mono text-muted-foreground">{tpl.code}</span>
                    <span className="text-muted-foreground"> · </span>
                  </>
                ) : null}
                {tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}
              </p>
              <Badge variant={cfg.variant} className={`${cfg.className} shrink-0 text-[10px] px-1.5 py-0`}>{cfg.label}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] sm:text-xs text-muted-foreground pl-6">
              <span><span className="text-muted-foreground/70">Branch:</span> <span className="text-foreground font-medium">{branchName}</span></span>
              <span><span className="text-muted-foreground/70">Dept:</span> <span className="text-foreground font-medium capitalize">{instance.department}</span></span>
              <span><span className="text-muted-foreground/70">Type:</span> <span className="text-foreground font-medium capitalize">{instance.checklist_type}</span></span>
            </div>
            {(dateDMY || dueHM) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] sm:text-xs text-muted-foreground pl-6">
                {dateDMY && (
                  <span><span className="text-muted-foreground/70">Date:</span> <span className="text-foreground font-medium">{dateDMY}</span></span>
                )}
                {dueHM && (
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /><span className="text-muted-foreground/70">Due:</span> <span className="text-foreground font-medium">{dueHM}</span></span>
                )}
              </div>
            )}
          </button>
        );
      })}
      </div>
      <RecentlySubmittedSection />
    </div>
  );
}

// ─── Recently Submitted (view-only, last 24h) ───

function RecentlySubmittedSection() {
  const { data: items, isLoading } = useRecentlySubmitted();
  if (isLoading || !items?.length) return null;

  return (
    <section aria-label="Recently Submitted" className="border-t pt-4">
      <h3 className="text-sm font-heading font-semibold text-muted-foreground mb-2 px-1">
        Recently Submitted
      </h3>
      <div className="flex flex-col gap-2">
        {items.map((instance: any) => {
          const tpl = instance.template as any;
          const branchName = instance.branch?.name ?? 'Unknown / Legacy';
          const submittedAt = instance.submitted_at ? formatVN(instance.submitted_at) : null;
          return (
            <div
              key={instance.id}
              className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2 sm:px-4 sm:py-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <p className="flex-1 min-w-0 font-heading font-semibold text-sm text-foreground leading-tight truncate">
                  {tpl?.code ? (
                    <>
                      <span className="font-mono text-muted-foreground">{tpl.code}</span>
                      <span className="text-muted-foreground"> · </span>
                    </>
                  ) : null}
                  {tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground pl-6">
                <span><span className="text-muted-foreground/70">Branch:</span> <span className="text-foreground font-medium">{branchName}</span></span>
                <span><span className="text-muted-foreground/70">Dept:</span> <span className="text-foreground font-medium capitalize">{instance.department}</span></span>
                {submittedAt && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span className="text-foreground font-medium">Submitted {submittedAt}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Detail View ───

function ChecklistDetail({ instanceId, templateId, onBack }: { instanceId: string; templateId: string; onBack: () => void }) {
  const { user } = useAuth();
  const { data: checklists } = useMyChecklists();
  const { data: tasks } = useInstanceTasks(instanceId, templateId);
  const { data: completions, isLoading: loadingCompletions } = useTaskCompletions(instanceId);
  const upsert = useUpsertCompletion();
  const submit = useSubmitChecklist();
  const updateNotes = useUpdateInstanceNotes();

  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  const instance = checklists?.find(c => c.id === instanceId);
  const tpl = instance?.template as any;
  const { profile, roles } = useAuth();
  const showOwnerDebug = roles.includes('owner');

  // ─── Edit eligibility (department-aware, escalation ≠ lock) ───
  const isManagerOrOwner = roles.includes('owner') || roles.includes('manager');
  const assignedTo = (instance as any)?.assigned_to ?? null;
  const assignedDept = (instance as any)?.department ?? null;
  const myDept = profile?.department ?? null;
  const status = instance?.status;
  const manuallyLocked = !!(instance as any)?.manually_locked;
  // Only completed/verified or manually-locked checklists are read-only.
  const statusEditable = status !== 'completed' && status !== 'verified';
  const notLocked = !manuallyLocked;
  const isAssignedToMe = !!assignedTo && assignedTo === user?.id;
  const isDeptMatch = !!assignedDept && !!myDept && assignedDept === myDept;
  const accessOk = isAssignedToMe || isDeptMatch || isManagerOrOwner;
  const isEditable = !!instance && statusEditable && notLocked && accessOk;

  const [notes, setNotes] = useState((instance as any)?.notes || '');

  const completionMap = useMemo(() => {
    const map: Record<string, any> = {};
    completions?.forEach(c => { map[c.task_id] = c; });
    return map;
  }, [completions]);

  useEffect(() => {
    if (!tasks) return;
    console.log('[NoteRequiredDebug] checklist detail tasks =', tasks.map(task => {
      const taskKey = task.template_task_id ?? task.id;
      const c = completionMap[taskKey];
      return {
        title: task.title,
        photo_required: task.photo_required,
        note_required: task.note_required,
        comment_value: c?.comment ?? comments[taskKey] ?? '',
        photo_count: c?.photo_url ? 1 : 0,
      };
    }));
  }, [tasks, completionMap, comments]);

  const canSubmit = isEditable;

  // Visual readiness: all tasks complete + required photos present + required notes present.
  const readyToSubmit = useMemo(() => {
    if (!tasks || !tasks.length) return false;
    for (const task of tasks) {
      const taskKey = task.template_task_id ?? task.id;
      const c = completionMap[taskKey];
      if (!c?.is_completed) return false;
      if (task.photo_required === true && !c.photo_url) return false;
      if (task.note_required === true) {
        const noteText = (c?.comment ?? '').trim() || (comments[taskKey] ?? '').trim();
        if (!noteText) return false;
      }
    }
    return true;
  }, [tasks, completionMap, comments]);

  const handleToggle = (taskId: string, checked: boolean) => {
    upsert.mutate({
      instance_id: instanceId,
      task_id: taskId,
      is_completed: checked,
      completed_by: checked ? user!.id : null,
      completed_at: checked ? new Date().toISOString() : null,
    }, {
      onError: (err: any) => toast.error(err?.message || 'Failed to save checklist item'),
    });
  };

  const handlePhoto = async (taskId: string) => {
    // Resolve task title (preferred) and fall back to template name.
    const task = tasks?.find(tt => (tt.template_task_id ?? tt.id) === taskId);
    const taskTitle = (task as any)?.title?.trim?.() || null;
    const templateTitle = (tpl?.title as string | undefined)?.trim?.() || null;
    const readableName = taskTitle || templateTitle || null;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(taskId);
      logSaveStep({ step: 'captureStarted' });
      logSaveStep({ step: 'fileReceived', name: file.name, mime: file.type, size: file.size });
      const optimizingToast = toast.loading('Optimizing photo…');
      let optimized: { file: File; width: number; height: number; size: number } | null = null;
      try {
        logSaveStep({ step: 'optimizationStarted' });
        optimized = await optimizeChecklistImage(file);
        logSaveStep({
          step: 'optimizationSuccess',
          width: optimized.width,
          height: optimized.height,
          size: optimized.size,
          mime: optimized.file.type,
        });
      } catch (err) {
        logSaveStep({
          step: 'optimizationFailed',
          error: err instanceof Error ? err.message : String(err),
        });
        // Non-fatal: fall back to uploading the original file.
        optimized = {
          file,
          width: 0,
          height: 0,
          size: file.size,
        };
        if (!(err instanceof ImageTooLargeError)) {
          toast.warning('Could not optimize photo — uploading original.');
        }
      }

      try {
        toast.dismiss(optimizingToast);
        const uploadingToast = toast.loading('Uploading photo…');
        try {
          logSaveStep({
            step: 'uploadStarted',
            instanceId,
            taskId,
            userId: user!.id,
          });
          const { url, path } = await uploadChecklistPhoto(optimized!.file, user!.id, {
            branchName: (instance as any)?.branch?.name ?? null,
            scheduledDate: (instance as any)?.scheduled_date ?? null,
            readableName,
          });
          logSaveStep({ step: 'uploadSuccess', url });
          upsert.mutate({
            instance_id: instanceId,
            task_id: taskId,
            is_completed: completionMap[taskId]?.is_completed ?? false,
            photo_url: url,
          });
          toast.dismiss(uploadingToast);
          logSaveStep({ step: 'final', outcome: 'uploaded+saved' });
          toast.success('Photo uploaded.');
        } catch (uploadErr: any) {
          toast.dismiss(uploadingToast);
          logSaveStep({ step: 'uploadFailed', error: uploadErr?.message ?? String(uploadErr) });
          logSaveStep({ step: 'final', outcome: 'uploadFailed' });
          toast.error('Photo upload failed. Please try again.');
        }
      } catch (err) {
        toast.dismiss(optimizingToast);
        logSaveStep({ step: 'final', outcome: 'processingFailed' });
        toast.error('Photo upload failed. Please try again.');
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  const handleComment = (taskId: string) => {
    const text = comments[taskId]?.trim();
    if (!text) return;
    upsert.mutate({
      instance_id: instanceId,
      task_id: taskId,
      is_completed: completionMap[taskId]?.is_completed ?? false,
      comment: text,
    });
    setComments(prev => ({ ...prev, [taskId]: '' }));
    setExpandedComment(null);
  };

  const handleSubmit = () => {
    if (!tasks) {
      toast.error('Checklist tasks are still loading. Please try again.');
      return;
    }
    if (!tasks.length) {
      toast.error('No checklist tasks found.');
      return;
    }
    // Per-task validation with explicit messages
    for (const task of tasks) {
      const taskKey = task.template_task_id ?? task.id;
      const c = completionMap[taskKey];
      if (!c?.is_completed) {
        toast.error(`Please complete: ${task.title}`);
        return;
      }
      const photoRequired = task.photo_required === true;
      if (photoRequired && !c.photo_url) {
        toast.error(`Please add the required photo for: ${task.title}`);
        return;
      }
      const noteRequired = task.note_required === true;
      if (noteRequired) {
        const noteText = (c?.comment ?? '').trim() || (comments[taskKey] ?? '').trim();
        if (!noteText) {
          toast.error(`Please fill the required note for: ${task.title}`);
          return;
        }
      }
    }
    // Persist any pending draft notes for mandatory tasks before submit
    for (const task of tasks) {
      const taskKey = task.template_task_id ?? task.id;
      const draft = comments[taskKey]?.trim();
      if (draft && draft !== completionMap[taskKey]?.comment) {
        upsert.mutate({
          instance_id: instanceId,
          task_id: taskKey,
          is_completed: completionMap[taskKey]?.is_completed ?? false,
          comment: draft,
        });
      }
    }
    // Save notes before submitting
    if (notes.trim()) {
      updateNotes.mutate({ instanceId, notes: notes.trim() });
    }
    submit.mutate(instanceId, {
      onSuccess: () => {
        toast.success('Checklist submitted successfully.');
        onBack();
      },
      onError: (err: any) => toast.error(err?.message || 'Failed to submit checklist'),
    });
  };

  return (
    <div className="mx-auto max-w-6xl pb-[calc(env(safe-area-inset-bottom)+10rem)] lg:pb-6">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={onBack}>
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-heading font-semibold break-words">
                {tpl?.code ? (
                  <>
                    <span className="font-mono text-muted-foreground">{tpl.code}</span>
                    <span className="text-muted-foreground"> · </span>
                  </>
                ) : null}
                {tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}
              </h2>
              {instance && (() => {
                const cfg = statusConfig[instance.status as ChecklistStatus];
                return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
              })()}
              <TemplateCodeBadge code={tpl?.code} />
            </div>
            <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground mt-0.5">
              <span className="capitalize">{instance?.checklist_type} · {instance?.department}</span>
              <span>·</span>
              <span className="truncate">
                {(instance as any)?.branch?.name ?? 'Unknown / Legacy'}
              </span>
              {(instance as any)?.due_datetime && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3.5 w-3.5" />
                    Due {formatDueTime((instance as any).due_datetime)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
        {/* Left column — tasks */}
        <div className="lg:col-span-2 space-y-3">
          {instance?.status === 'rejected' && instance.rejection_note && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{instance.rejection_note}</AlertDescription>
            </Alert>
          )}

          {manuallyLocked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>This checklist was manually locked by manager.</AlertDescription>
            </Alert>
          )}

          {loadingCompletions ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {tasks?.map(task => {
                const taskKey = task.template_task_id ?? task.id;
                const c = completionMap[taskKey];
                const done = !!c?.is_completed;
                const photoRequired = task.photo_required === true;
                const noteRequired = task.note_required === true;
                const needsPhoto = photoRequired && !c?.photo_url;
                const currentNote = (c?.comment ?? '').trim() || (comments[taskKey] ?? '').trim();
                const needsNote = noteRequired && !currentNote;

                return (
                  <div
                    key={task.id}
                    className={`rounded-xl border bg-card p-4 md:p-5 space-y-3 transition-colors ${done ? 'bg-accent/30' : ''} ${(needsPhoto || needsNote) && done ? 'border-destructive/50' : ''}`}
                  >
                    <div className="flex items-start gap-3 md:gap-4">
                      <div className="flex-1 min-w-0">
                        <p className={`text-base md:text-lg font-medium leading-snug ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {task.title}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {photoRequired && (
                            <Badge variant="destructive" className="text-xs">📸 Photo required</Badge>
                          )}
                          {noteRequired && (
                            <Badge variant="destructive" className="text-xs">📝 Note required</Badge>
                          )}
                        </div>
                        {task.instruction && (
                          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{task.instruction}</p>
                        )}
                        {showOwnerDebug && (
                          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                            Debug: {task.title} · photo_required={String(task.photo_required)} · note_required={String(task.note_required)} · comment exists={c?.comment?.trim() || comments[taskKey]?.trim() ? 'yes' : 'no'} · photo exists={c?.photo_url ? 'yes' : 'no'}
                          </p>
                        )}
                      </div>
                      {/* Large tap target wrapping the checkbox */}
                      <button
                        type="button"
                        disabled={!isEditable}
                        onClick={() => isEditable && handleToggle(taskKey, !done)}
                        className="shrink-0 flex items-center justify-center h-14 w-14 md:h-16 md:w-16 rounded-xl border-2 border-input hover:bg-accent active:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                      >
                        <Checkbox
                          checked={done}
                          disabled={!isEditable}
                          className="h-7 w-7 md:h-8 md:w-8 pointer-events-none"
                        />
                      </button>
                    </div>

                    {isEditable && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 px-4"
                          disabled={uploading === taskKey}
                          onClick={() => handlePhoto(taskKey)}
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          {uploading === taskKey ? 'Uploading…' : c?.photo_url ? 'Replace photo' : 'Add photo'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 px-4"
                          onClick={() => setExpandedComment(expandedComment === taskKey ? null : taskKey)}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Comment
                        </Button>
                      </div>
                    )}

                    {c?.photo_url && (
                      <ChecklistPhotoPreview
                        imageUrl={c.photo_url}
                        altText="Task photo"
                        className="max-w-full md:max-w-md"
                      />
                    )}

                    {c?.comment && (
                      <p className="text-sm text-muted-foreground italic">💬 {c.comment}</p>
                    )}

                    {expandedComment === taskKey && isEditable && (
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Add a comment..."
                          value={comments[taskKey] || ''}
                          onChange={e => setComments(prev => ({ ...prev, [taskKey]: e.target.value }))}
                          className="min-h-[72px] text-base"
                        />
                        <Button size="icon" className="shrink-0 h-12 w-12" onClick={() => handleComment(taskKey)}>
                          <Send className="h-5 w-5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column — notes & submit (sticky on desktop/tablet landscape) */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-4">
            <div className="rounded-xl border bg-card p-4 md:p-5 space-y-2">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Notes (optional)</Label>
              </div>
              {isEditable ? (
                <Textarea
                  placeholder="Add any additional notes about this checklist..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="min-h-[120px] text-base"
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {(instance as any)?.notes || 'No notes added.'}
                </p>
              )}
            </div>

            <PhotoSaveDebugPanel />

            {isEditable && (
              <Button
                className={cn(
                  "hidden lg:flex w-full h-12 text-base transition-colors",
                  !readyToSubmit && !submit.isPending &&
                    "bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed"
                )}
                size="lg"
                disabled={submit.isPending}
                onClick={handleSubmit}
              >
                {submit.isPending ? 'Submitting…' : 'Submit Checklist'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Sticky bottom action bar — phone & tablet portrait. Sits ABOVE the mobile bottom nav (64px + safe area). */}
      {isEditable && (
        <div
          className="lg:hidden fixed left-0 right-0 z-40 border-t bg-background/95 backdrop-blur px-4 py-3"
          style={{
            bottom: 'calc(64px + env(safe-area-inset-bottom))',
            paddingBottom: '0.75rem',
          }}
        >
          <div className="mx-auto max-w-6xl">
            <Button
              className={cn(
                "w-full h-14 text-base transition-colors",
                !readyToSubmit && !submit.isPending &&
                  "bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed"
              )}
              size="lg"
              disabled={submit.isPending}
              onClick={handleSubmit}
            >
              {submit.isPending ? 'Submitting…' : 'Submit Checklist'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───

export default function StaffChecklistView() {
  const [selected, setSelected] = useState<{ instanceId: string; templateId: string } | null>(null);

  if (selected) {
    return <ChecklistDetail instanceId={selected.instanceId} templateId={selected.templateId} onBack={() => setSelected(null)} />;
  }

  return <ChecklistList onSelect={(instanceId, templateId) => setSelected({ instanceId, templateId })} />;
}
