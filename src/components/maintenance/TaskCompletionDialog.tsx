import { useState } from 'react';
import {
  Loader2, Camera, StickyNote, CheckCircle2, AlertTriangle, Clock, User, CalendarCheck,
  Trash2, Upload, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import {
  useCompleteMaintenanceTask,
  useCompleteEarlyMaintenance,
  todayLocalISO,
  type EnrichedMaintenanceTask,
} from '@/hooks/useMaintenanceTasks';
import { uploadToAppFilesBucket } from '@/lib/appFilesStorage';
import type { Database } from '@/integrations/supabase/types';

/** Enough metadata to materialize a maintenance_tasks row when completing a preview occurrence early. */
export interface EarlyPreviewPayload {
  schedule_template_id: string;
  asset_id: string;
  title: string;
  due_date: string;
  due_time: string;
  assigned_staff_id: string | null;
  assigned_department: Database['public']['Enums']['department'] | null;
  // Display-only context
  asset_code: string | null;
  asset_name: string | null;
  asset_branch_name: string | null;
  asset_department: string | null;
  asset_type_name?: string | null;
  template_description: string | null;
  note_required: boolean;
  photo_required: boolean;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'Done')
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1 px-2 py-0.5 text-[11px] font-semibold"><CheckCircle2 className="h-3.5 w-3.5" />Done</Badge>;
  if (status === 'Overdue')
    return <Badge variant="destructive" className="gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"><AlertTriangle className="h-3.5 w-3.5" />Overdue</Badge>;
  if (status === 'Upcoming')
    return <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[11px] font-semibold"><Clock className="h-3.5 w-3.5" />Upcoming</Badge>;
  return <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1 px-2 py-0.5 text-[11px] font-semibold"><Clock className="h-3.5 w-3.5" />Pending</Badge>;
}

export interface TaskCompletionDialogProps {
  /** Existing maintenance task row, when present. */
  task?: EnrichedMaintenanceTask | null;
  /** Preview payload for completing an upcoming occurrence early. */
  preview?: EarlyPreviewPayload | null;
  onOpenChange: (v: boolean) => void;
}

export default function TaskCompletionDialog({ task, preview, onOpenChange }: TaskCompletionDialogProps) {
  const { profile } = useAuth();
  const complete = useCompleteMaintenanceTask();
  const completeEarly = useCompleteEarlyMaintenance();

  const isPreview = !task && !!preview;
  const isDone = task?.status === 'Done';

  // Display fields work for both modes.
  const title = task?.title ?? preview!.title;
  const description = task?.template_description ?? preview?.template_description ?? null;
  const assetCode = task?.asset_code ?? preview?.asset_code ?? null;
  const assetName = task?.asset_name ?? preview?.asset_name ?? null;
  const assetTypeName = (task as any)?.asset_type_name ?? preview?.asset_type_name ?? null;
  const branchName = task?.asset_branch_name ?? preview?.asset_branch_name ?? null;
  const department = task?.assigned_department ?? task?.asset_department ?? preview?.assigned_department ?? preview?.asset_department ?? null;
  const dueDate = task?.due_date ?? preview!.due_date;
  const dueTime = task?.due_time ?? preview!.due_time;
  const status: string = isPreview ? 'Upcoming' : (task?.status ?? 'Pending');
  const noteRequired = task?.note_required ?? preview?.note_required ?? false;
  const photoRequired = task?.photo_required ?? preview?.photo_required ?? false;

  const initialAdv = (task ?? {}) as any;
  const [note, setNote] = useState(task?.note ?? '');
  const [uploading, setUploading] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [executionDate, setExecutionDate] = useState<string>(
    initialAdv.execution_date ?? todayLocalISO(),
  );
  const [advOpen, setAdvOpen] = useState(false);
  const [costAmount, setCostAmount] = useState<string>(
    initialAdv.cost_amount != null ? String(initialAdv.cost_amount) : '',
  );
  const [costType, setCostType] = useState<'Internal' | 'External' | ''>(
    (initialAdv.cost_type as 'Internal' | 'External' | null) ?? '',
  );
  const [externalCompany, setExternalCompany] = useState<string>(initialAdv.external_company ?? '');
  const [externalContact, setExternalContact] = useState<string>(initialAdv.external_contact ?? '');
  const [spareParts, setSpareParts] = useState<string>(initialAdv.spare_parts ?? '');
  const [technicalNote, setTechnicalNote] = useState<string>(initialAdv.technical_note ?? '');
  const MAX_PHOTOS = 4;
  const [photos, setPhotos] = useState<string[]>(() => {
    const list: string[] = [];
    if (task?.photo_url) list.push(task.photo_url);
    if (Array.isArray(initialAdv.additional_photos)) {
      for (const u of initialAdv.additional_photos as string[]) {
        if (u && !list.includes(u)) list.push(u);
      }
    }
    return list.slice(0, MAX_PHOTOS);
  });

  const noteMissing = noteRequired && !note.trim();
  const photoMissing = photoRequired && photos.length === 0;

  const handleUpload = async (file: File) => {
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Up to ${MAX_PHOTOS} photos allowed`);
      return;
    }
    setUploading(true);
    try {
      const res = await uploadToAppFilesBucket(file, 'maintenance', {
        branchName: branchName ?? undefined,
        category: department ?? undefined,
        assetOrEquipment: assetCode ?? assetName ?? undefined,
      });
      setPhotos(prev => [...prev, res.publicUrl].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    setAttempted(true);
    if (noteMissing) { toast.error('A note is required to complete this task'); return; }
    if (photoMissing) { toast.error('A photo is required to complete this task'); return; }
    if (!profile?.user_id) { toast.error('You must be signed in'); return; }
    try {
      const costNum = costAmount.trim() === '' ? null : Number(costAmount);
      const [firstPhoto, ...restPhotos] = photos;
      const common = {
        note,
        photo_url: firstPhoto ?? null,
        user_id: profile.user_id,
        cost_amount: costNum != null && !isNaN(costNum) ? costNum : null,
        cost_type: costType || null,
        external_company: externalCompany,
        external_contact: externalContact,
        spare_parts: spareParts,
        technical_note: technicalNote,
        additional_photos: restPhotos,
        execution_date: executionDate || todayLocalISO(),
      };
      if (isPreview) {
        await completeEarly.mutateAsync({
          ...common,
          id: '', // not used for early path
          schedule_template_id: preview!.schedule_template_id,
          asset_id: preview!.asset_id,
          title: preview!.title,
          due_date: preview!.due_date,
          due_time: preview!.due_time,
          assigned_staff_id: preview!.assigned_staff_id,
          assigned_department: preview!.assigned_department,
        });
        toast.success('Maintenance completed early');
      } else {
        await complete.mutateAsync({ ...common, id: task!.id });
        toast.success('Maintenance task completed');
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save');
    }
  };

  const pending = complete.isPending || completeEarly.isPending;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {isPreview && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 text-xs text-amber-900 dark:text-amber-200">
              This task is scheduled for a future date. You may complete it early if the work has already been done.
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Job description</div>
            {description?.trim() ? (
              <div className="whitespace-pre-wrap text-sm">{description}</div>
            ) : (
              <div className="text-sm italic text-muted-foreground">No job description provided.</div>
            )}
          </div>

          <div>
            <Label htmlFor="execution-date">
              Execution date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="execution-date"
              type="date"
              value={executionDate}
              disabled={isDone}
              onChange={e => setExecutionDate(e.target.value)}
              required
            />
            <div className="text-xs text-muted-foreground mt-1">
              Defaults to today. Change if maintenance was performed on a different day.
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-1">
            <div><span className="text-muted-foreground">Equipment:</span> {assetCode ? `${assetCode} — ` : ''}{assetName}</div>
            {assetTypeName && (
              <div><span className="text-muted-foreground">Type:</span> {assetTypeName}</div>
            )}
            <div><span className="text-muted-foreground">Branch:</span> {branchName ?? '—'}</div>
            <div><span className="text-muted-foreground">Department:</span> <span className="capitalize">{department ?? '—'}</span></div>
            <div><span className="text-muted-foreground">Planned due:</span> {dueDate} {dueTime?.slice(0, 5)}</div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span> <StatusBadge status={status} />
            </div>
          </div>

          {!isDone && (noteRequired || photoRequired) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 text-xs space-y-1">
              <div className="font-semibold text-amber-900 dark:text-amber-200">Required to complete:</div>
              <ul className="space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
                {noteRequired && (<li className="flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" />Note Required</li>)}
                {photoRequired && (<li className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" />Photo Required</li>)}
              </ul>
            </div>
          )}

          <div>
            <Label>Note {noteRequired && <span className="text-destructive">*</span>}</Label>
            <Textarea
              rows={3}
              value={note}
              disabled={isDone}
              onChange={e => setNote(e.target.value)}
              placeholder={noteRequired ? 'Required' : 'Optional'}
              className={attempted && noteMissing ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {attempted && noteMissing && (
              <div className="text-xs text-destructive mt-1">Note is required.</div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>
                Photos {photoRequired && <span className="text-destructive">*</span>}
                <span className="ml-1 text-xs text-muted-foreground font-normal">({photos.length}/{MAX_PHOTOS})</span>
              </Label>
            </div>
            <div className={`mt-1 flex flex-wrap gap-2 ${attempted && photoMissing ? 'p-1 rounded border border-destructive' : ''}`}>
              {photos.map((url, i) => (
                <div key={`${url}-${i}`} className="relative h-20 w-20 rounded border bg-muted/40 overflow-hidden">
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img src={url} className="h-full w-full object-cover" />
                  {!isDone && (
                    <button
                      type="button"
                      onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 rounded-full bg-background/90 border p-0.5 hover:bg-destructive hover:text-destructive-foreground transition"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {!isDone && photos.length < MAX_PHOTOS && (
                <label className="h-20 w-20 rounded border border-dashed flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/40 cursor-pointer transition">
                  {uploading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Upload className="h-4 w-4" /><span className="text-[10px] mt-0.5">Add</span></>}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleUpload(f); }}
                  />
                </label>
              )}
            </div>
          </div>

          {!isPreview && isDone && (task?.completed_at || task?.completed_by_name) && (
            <div className="rounded-md border bg-muted/40 p-2.5 text-xs space-y-1">
              {(task as any).execution_date && (
                <div className="flex items-center gap-1.5"><CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />Execution date: <span className="font-medium">{(task as any).execution_date}</span></div>
              )}
              {task?.completed_by_name && (
                <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" />Completed by <span className="font-medium">{task.completed_by_name}</span></div>
              )}
              {task?.completed_at && (
                <div className="flex items-center gap-1.5"><CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />Completed at: <span className="font-medium">{new Date(task.completed_at).toLocaleString()}</span></div>
              )}
            </div>
          )}

          <Collapsible open={advOpen} onOpenChange={setAdvOpen} className="rounded-md border">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition"
              >
                <span>Advanced / Technical Details (optional)</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${advOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 pt-1 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <Label className="text-xs">Cost amount</Label>
                  <Input type="number" min={0} step="0.01" value={costAmount} disabled={isDone}
                    onChange={e => setCostAmount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Cost type</Label>
                  <Select value={costType || undefined}
                    onValueChange={v => setCostType(v as 'Internal' | 'External')}
                    disabled={isDone}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Internal">Internal</SelectItem>
                      <SelectItem value="External">External</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">External company</Label>
                  <Input value={externalCompany} disabled={isDone} onChange={e => setExternalCompany(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">External contact</Label>
                  <Input value={externalContact} disabled={isDone} onChange={e => setExternalContact(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Spare parts used</Label>
                <Input value={spareParts} disabled={isDone} onChange={e => setSpareParts(e.target.value)} placeholder="e.g. 1x filter, 2x gasket" />
              </div>
              <div>
                <Label className="text-xs">Technical note</Label>
                <Textarea rows={2} value={technicalNote} disabled={isDone} onChange={e => setTechnicalNote(e.target.value)} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!isDone && (
            <Button onClick={handleComplete} disabled={pending || uploading}>
              {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isPreview ? 'Complete Early' : 'Mark as Done'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}