import { useState, useMemo } from 'react';
import { Camera, ChevronLeft, CircleCheck, Circle, AlertTriangle, Clock, MessageSquare, Send, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { formatVN } from '@/lib/timezone';
import {
  useMyChecklists,
  useTemplateTasks,
  useTaskCompletions,
  useUpsertCompletion,
  useSubmitChecklist,
  useUpdateInstanceNotes,
  uploadChecklistPhoto,
  type ChecklistStatus,
  type PhotoRequirement,
} from '@/hooks/useChecklists';

// ─── Status helpers ───

const statusConfig: Record<ChecklistStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; className?: string }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  late: { label: 'Late', variant: 'destructive', className: 'bg-warning text-warning-foreground hover:bg-warning/80' },
  escalated: { label: 'Escalated', variant: 'destructive' },
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
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
          <Circle className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-heading font-semibold text-foreground">No checklists today</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">You don't have any checklists assigned for today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {checklists.map(instance => {
        const tpl = instance.template as any;
        const cfg = statusConfig[instance.status as ChecklistStatus];
        const StatusIcon = instance.status === 'pending' ? Circle
          : instance.status === 'rejected' ? AlertTriangle
          : CircleCheck;

        return (
          <button
            key={instance.id}
            onClick={() => onSelect(instance.id, instance.template_id)}
            className="w-full flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent active:bg-accent"
          >
            <StatusIcon className={`h-5 w-5 shrink-0 ${instance.status === 'rejected' || instance.status === 'escalated' ? 'text-destructive' : instance.status === 'pending' || instance.status === 'late' ? 'text-muted-foreground' : 'text-emerald-600'}`} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="capitalize">{instance.checklist_type}</span>
                <span>·</span>
                <span className="capitalize">{instance.department}</span>
                {(instance as any).due_datetime && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      Due {formatDueTime((instance as any).due_datetime)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>
          </button>
        );
      })}
    </div>
  );
}

// ─── Detail View ───

function ChecklistDetail({ instanceId, templateId, onBack }: { instanceId: string; templateId: string; onBack: () => void }) {
  const { user } = useAuth();
  const { data: checklists } = useMyChecklists();
  const { data: tasks } = useTemplateTasks(templateId);
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

  // ─── Edit eligibility (department-aware) ───
  const isManagerOrOwner = roles.includes('owner') || roles.includes('manager');
  const assignedTo = (instance as any)?.assigned_to ?? null;
  const assignedDept = (instance as any)?.department ?? null;
  const myDept = profile?.department ?? null;
  const statusOpen = instance?.status === 'pending' || instance?.status === 'rejected';
  const isAssignedToMe = !!assignedTo && assignedTo === user?.id;
  const isDeptMatch = !!assignedDept && !!myDept && assignedDept === myDept;
  const isEditable = !!instance && statusOpen && (isAssignedToMe || isDeptMatch || isManagerOrOwner);

  const [notes, setNotes] = useState((instance as any)?.notes || '');

  // ─── DEBUG: edit-eligibility diagnostics ───
  const debugInfo = useMemo(() => {
    if (!instance) return null;
    const reasons: string[] = [];
    if (!statusOpen) {
      if (instance.status === 'completed' || instance.status === 'verified') reasons.push('Checklist already completed');
      else if (instance.status === 'escalated') reasons.push('Checklist locked / escalated by manager');
      else reasons.push(`Status "${instance.status}" is not editable`);
    } else if (!isAssignedToMe && !isDeptMatch && !isManagerOrOwner) {
      reasons.push('You are not assigned to this checklist');
    }
    const info = {
      assigned_user_id: assignedTo,
      assigned_department: assignedDept,
      current_user_id: user?.id ?? null,
      current_user_department: myDept,
      role: roles.join(', ') || '(none)',
      editable: isEditable,
      blockReasons: reasons,
    };
    // eslint-disable-next-line no-console
    console.log('[ChecklistDebug]', info);
    return info;
  }, [instance, user, profile, roles, isEditable, statusOpen, isAssignedToMe, isDeptMatch, isManagerOrOwner, assignedTo, assignedDept, myDept]);

  const completionMap = useMemo(() => {
    const map: Record<string, any> = {};
    completions?.forEach(c => { map[c.task_id] = c; });
    return map;
  }, [completions]);

  const canSubmit = useMemo(() => {
    if (!tasks || !isEditable) return false;
    return tasks.every(task => {
      const c = completionMap[task.id];
      if (!c?.is_completed) return false;
      if (task.photo_requirement === 'mandatory' && !c.photo_url) return false;
      return true;
    });
  }, [tasks, completionMap, isEditable]);

  const handleToggle = (taskId: string, current: boolean) => {
    if (!isEditable) return;
    upsert.mutate({
      instance_id: instanceId,
      task_id: taskId,
      is_completed: !current,
      completed_by: !current ? user!.id : null,
      completed_at: !current ? new Date().toISOString() : null,
    });
  };

  const handlePhoto = async (taskId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(taskId);
      try {
        const url = await uploadChecklistPhoto(file, user!.id);
        upsert.mutate({
          instance_id: instanceId,
          task_id: taskId,
          is_completed: completionMap[taskId]?.is_completed ?? false,
          photo_url: url,
        });
      } catch {
        toast.error('Failed to upload photo');
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
    if (!canSubmit) {
      toast.error('Please complete all tasks and upload required photos.');
      return;
    }
    // Save notes before submitting
    if (notes.trim()) {
      updateNotes.mutate({ instanceId, notes: notes.trim() });
    }
    submit.mutate(instanceId, {
      onSuccess: () => {
        toast.success('Checklist submitted!');
        onBack();
      },
      onError: () => toast.error('Failed to submit checklist'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-heading font-semibold truncate">{tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="capitalize">{instance?.checklist_type} · {instance?.department}</span>
            {(instance as any)?.due_datetime && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  Due at {formatDueTime((instance as any).due_datetime)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {instance?.status === 'rejected' && instance.rejection_note && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{instance.rejection_note}</AlertDescription>
        </Alert>
      )}

      {/* ─── DEBUG BANNER (temporary) ─── */}
      {debugInfo && (
        <div className="rounded-lg border border-dashed border-warning bg-warning/10 p-3 text-xs space-y-1 font-mono">
          <p className="font-semibold text-warning-foreground">
            🐞 You are logged as: {profile?.full_name ?? '(no name)'} — {debugInfo.role} — {debugInfo.current_user_department ?? '(no dept)'}
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>Assigned user ID:</span><span className="truncate">{debugInfo.assigned_user_id ?? '—'}</span>
            <span>Assigned department:</span><span>{debugInfo.assigned_department ?? '—'}</span>
            <span>Logged-in user ID:</span><span className="truncate">{debugInfo.current_user_id ?? '—'}</span>
            <span>Logged-in department:</span><span>{debugInfo.current_user_department ?? '—'}</span>
            <span>Role:</span><span>{debugInfo.role}</span>
            <span>Status:</span><span>{instance?.status}</span>
            <span>Is editable:</span><span>{String(debugInfo.editable)}</span>
          </div>
          {debugInfo.blockReasons.length > 0 && (
            <div className="pt-1 mt-1 border-t border-warning/40">
              <p className="font-semibold text-destructive">Block reasons:</p>
              <ul className="list-disc list-inside text-destructive">
                {debugInfo.blockReasons.map(r => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {loadingCompletions ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks?.map(task => {
            const c = completionMap[task.id];
            const done = !!c?.is_completed;
            const needsPhoto = task.photo_requirement === 'mandatory' && !c?.photo_url;
            const photoReq = task.photo_requirement as PhotoRequirement;

            return (
              <div
                key={task.id}
                className={`rounded-lg border bg-card p-3 space-y-2 ${needsPhoto && done ? 'border-destructive/50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</p>
                    {photoReq === 'mandatory' && (
                      <p className="text-xs text-destructive mt-0.5">📸 Photo required</p>
                    )}
                    {photoReq === 'optional' && (
                      <p className="text-xs text-muted-foreground mt-0.5">📷 Photo optional</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isEditable && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={uploading === task.id}
                          onClick={() => handlePhoto(task.id)}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setExpandedComment(expandedComment === task.id ? null : task.id)}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Checkbox
                      checked={done}
                      onCheckedChange={() => {
                        // eslint-disable-next-line no-console
                        console.log('Checkbox clicked', task.id, { done, isEditable });
                        handleToggle(task.id, done);
                      }}
                      disabled={false}
                      className="h-5 w-5 ml-1 relative z-10 cursor-pointer"
                    />
                    {!isEditable && (
                      <span className="text-[10px] text-destructive ml-1">(forced)</span>
                    )}
                  </div>
                </div>

                {c?.photo_url && (
                  <div>
                    <img src={c.photo_url} alt="Task photo" className="h-16 w-16 rounded-md object-cover border" />
                  </div>
                )}

                {c?.comment && (
                  <p className="text-xs text-muted-foreground italic">💬 {c.comment}</p>
                )}

                {expandedComment === task.id && isEditable && (
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={comments[task.id] || ''}
                      onChange={e => setComments(prev => ({ ...prev, [task.id]: e.target.value }))}
                      className="min-h-[60px] text-sm"
                    />
                    <Button size="icon" className="shrink-0 h-10 w-10" onClick={() => handleComment(task.id)}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Notes field */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Notes (optional)</Label>
        </div>
        {isEditable ? (
          <Textarea
            placeholder="Add any additional notes about this checklist..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="min-h-[80px] text-sm"
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {(instance as any)?.notes || 'No notes added.'}
          </p>
        )}
      </div>

      {isEditable && (
        <Button
          className="w-full"
          size="lg"
          disabled={!canSubmit || submit.isPending}
          onClick={handleSubmit}
        >
          {submit.isPending ? 'Submitting…' : 'Submit Checklist'}
        </Button>
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
