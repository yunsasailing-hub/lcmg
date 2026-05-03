import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2, Plus, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useBranchesAll } from '@/hooks/useMaintenance';
import { useActiveUsersForAssignment } from '@/hooks/useChecklists';
import {
  useUpsertWtbd,
  useDeleteWtbd,
  useWtbdUpdates,
  useAddWtbdUpdate,
  WTBD_PRIORITIES,
  WTBD_STATUSES,
  WTBD_OCCASIONS,
  WORK_AREAS,
  DEFAULT_WORK_AREA,
  type EnrichedWtbd,
  type WtbdPriority,
  type WtbdStatus,
  type WtbdTargetOccasion,
  type WorkArea,
} from '@/hooks/useWorkToBeDone';
import type { Database } from '@/integrations/supabase/types';

type Department = Database['public']['Enums']['department'];
const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: EnrichedWtbd | null;
}

export default function WorkToBeDoneFormDialog({ open, onOpenChange, initial }: Props) {
  const { profile, hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const isManager = hasRole('manager');
  const { data: branches = [] } = useBranchesAll();
  const { data: users = [] } = useActiveUsersForAssignment({ enabled: open });
  const upsert = useUpsertWtbd();
  const del = useDeleteWtbd();

  const isLocked = !!initial && (initial.status === 'Completed' || initial.status === 'Cancelled');
  const canDelete = isOwner;

  const { data: updates = [], isLoading: updatesLoading } = useWtbdUpdates(initial?.id);
  const addUpdate = useAddWtbdUpdate();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [updatePhoto, setUpdatePhoto] = useState<File | null>(null);

  const handleSaveUpdate = async () => {
    if (!initial) return;
    if (!updateNote.trim()) return toast.error('Update note is required');
    if (!profile?.user_id) return toast.error('Not signed in');
    try {
      await addUpdate.mutateAsync({
        jobId: initial.id,
        note: updateNote.trim(),
        photo: updatePhoto,
        userId: profile.user_id,
      });
      toast.success('Progress update added');
      setUpdateNote('');
      setUpdatePhoto(null);
      setUpdateOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add update');
    }
  };

  const fmtDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
      });
    } catch { return iso; }
  };

  const [form, setForm] = useState(() => ({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    branch_id: initial?.branch_id ?? (isManager ? profile?.branch_id ?? '' : ''),
    department: (initial?.department ?? profile?.department ?? '') as Department | '',
    area_or_equipment: initial?.area_or_equipment ?? '',
    priority: (initial?.priority ?? 'Medium') as WtbdPriority,
    status: (initial?.status ?? 'Open') as WtbdStatus,
    target_occasion: (initial?.target_occasion ?? 'No fixed date') as WtbdTargetOccasion,
    work_area: (initial?.work_area ?? DEFAULT_WORK_AREA) as WorkArea,
    due_date: initial?.due_date ?? '',
    assigned_to: initial?.assigned_to ?? '',
    notes: initial?.notes ?? '',
    final_note: initial?.final_note ?? '',
  }));

  const update = (k: keyof typeof form, v: any) => setForm(s => ({ ...s, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim()) return toast.error('Title required');
    if (!form.branch_id) return toast.error('Branch required');
    if (!form.department) return toast.error('Department required');
    if (!form.work_area) return toast.error('Work Area required');
    const requiresFinalNote = (form.status === 'Cancelled') && !form.final_note.trim();
    if (requiresFinalNote) return toast.error('Cancellation reason / final note required');

    const wasActive = !initial || ['Open','Postponed','In Progress'].includes(initial.status);
    const completedAt = form.status === 'Completed'
      ? (initial?.completed_at ?? new Date().toISOString())
      : null;
    const cancelledAt = form.status === 'Cancelled'
      ? (initial?.cancelled_at ?? new Date().toISOString())
      : null;

    try {
      await upsert.mutateAsync({
        id: initial?.id,
        title: form.title.trim(),
        description: form.description || null,
        branch_id: form.branch_id,
        department: form.department as Department,
        area_or_equipment: form.area_or_equipment || null,
        priority: form.priority,
        status: form.status,
        target_occasion: form.target_occasion,
        work_area: form.work_area,
        due_date: form.due_date || null,
        assigned_to: form.assigned_to || null,
        notes: form.notes || null,
        final_note: form.final_note || null,
        completed_at: completedAt,
        cancelled_at: cancelledAt,
        created_by: initial?.created_by ?? profile?.user_id,
        updated_by: profile?.user_id,
      } as any);
      toast.success(initial ? 'Updated' : 'Created');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (!confirm('Delete this job permanently?')) return;
    try {
      await del.mutateAsync(initial.id);
      toast.success('Deleted');
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Work To Be Done' : 'Add Work To Be Done'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => update('title', e.target.value)} disabled={isLocked} />
          </div>
          <div>
            <Label>Branch *</Label>
            <Select value={form.branch_id} onValueChange={v => update('branch_id', v)} disabled={isLocked || (!isOwner)}>
              <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department *</Label>
            <Select value={form.department} onValueChange={v => update('department', v)} disabled={isLocked}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority *</Label>
            <Select value={form.priority} onValueChange={v => update('priority', v as WtbdPriority)} disabled={isLocked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WTBD_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status *</Label>
            <Select value={form.status} onValueChange={v => update('status', v as WtbdStatus)} disabled={isLocked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WTBD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Target occasion</Label>
            <Select value={form.target_occasion} onValueChange={v => update('target_occasion', v as WtbdTargetOccasion)} disabled={isLocked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WTBD_OCCASIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={form.due_date ?? ''} onChange={e => update('due_date', e.target.value)} disabled={isLocked} />
          </div>
          <div className="sm:col-span-2">
            <Label>Area / Equipment</Label>
            <Input value={form.area_or_equipment} onChange={e => update('area_or_equipment', e.target.value)} disabled={isLocked} />
          </div>
          <div className="sm:col-span-2">
            <Label>Assigned person</Label>
            <Select value={form.assigned_to || 'none'} onValueChange={v => update('assigned_to', v === 'none' ? '' : v)} disabled={isLocked}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={3} value={form.description} onChange={e => update('description', e.target.value)} disabled={isLocked} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} disabled={isLocked} />
          </div>
          {(form.status === 'Completed' || form.status === 'Cancelled') && (
            <div className="sm:col-span-2">
              <Label>{form.status === 'Cancelled' ? 'Cancellation reason / final note *' : 'Final note'}</Label>
              <Textarea rows={2} value={form.final_note} onChange={e => update('final_note', e.target.value)} disabled={isLocked} />
            </div>
          )}

          {initial && (
            <div className="sm:col-span-2 mt-2 border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Progress Updates / Situation History</div>
                {!isLocked && !updateOpen && (
                  <Button size="sm" variant="outline" onClick={() => setUpdateOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add Update
                  </Button>
                )}
              </div>

              {updateOpen && (
                <div className="rounded-md border p-3 space-y-2 mb-3 bg-muted/30">
                  <Textarea
                    rows={3}
                    placeholder="Describe progress, blockers, or notes..."
                    value={updateNote}
                    onChange={e => setUpdateNote(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={e => setUpdatePhoto(e.target.files?.[0] ?? null)}
                      className="text-xs"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setUpdateOpen(false); setUpdateNote(''); setUpdatePhoto(null); }}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveUpdate} disabled={addUpdate.isPending || !updateNote.trim()}>
                      {addUpdate.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                      Save Update
                    </Button>
                  </div>
                </div>
              )}

              {updatesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : updates.length === 0 ? (
                <p className="text-xs text-muted-foreground">No progress update yet.</p>
              ) : (
                <ol className="space-y-2">
                  {updates.map(u => (
                    <li key={u.id} className="rounded-md border p-2.5 bg-card">
                      <div className="text-xs text-muted-foreground mb-1">
                        {fmtDateTime(u.created_at)} — {u.author_username || 'Unknown'}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">{u.update_note}</div>
                      {u.photo_url && (
                        <a href={u.photo_url} target="_blank" rel="noreferrer" className="inline-block mt-2">
                          <img
                            src={u.photo_url}
                            alt="Update"
                            loading="lazy"
                            className="h-20 w-20 object-cover rounded-md border hover:opacity-90"
                          />
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {initial && canDelete && (
            <Button variant="outline" onClick={handleDelete} className="mr-auto text-destructive">
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!isLocked && (
            <Button onClick={handleSave} disabled={upsert.isPending}>Save</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}