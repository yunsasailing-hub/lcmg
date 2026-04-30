import { useMemo, useState } from 'react';
import { Loader2, Search, Camera, StickyNote, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChecklistPhotoPreview } from '@/components/checklists/ChecklistPhotoPreview';
import { useAuth } from '@/hooks/useAuth';
import {
  useMaintenanceTasks,
  useCompleteMaintenanceTask,
  type EnrichedMaintenanceTask,
  todayLocalISO,
} from '@/hooks/useMaintenanceTasks';
import { uploadToAppFilesBucket } from '@/lib/appFilesStorage';

const DEPARTMENTS = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];

export default function MaintenanceTasksList() {
  const { profile, hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const isManager = hasRole('manager');
  const { data: tasks = [], isLoading } = useMaintenanceTasks();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [active, setActive] = useState<EnrichedMaintenanceTask | null>(null);

  // Permission scoping: RLS already restricts, but apply manager branch
  // filter explicitly so they don't see foreign branches if RLS evolves.
  const visible = useMemo(() => {
    return tasks.filter(t => {
      if (isOwner) return true;
      if (isManager) return profile?.branch_id ? t.asset_branch_id === profile.branch_id : false;
      // staff
      return t.assigned_staff_id === profile?.user_id
        || (!!t.assigned_department && t.assigned_department === profile?.department);
    });
  }, [tasks, isOwner, isManager, profile]);

  const branches = useMemo(() => {
    const m = new Map<string, string>();
    visible.forEach(t => { if (t.asset_branch_id && t.asset_branch_name) m.set(t.asset_branch_id, t.asset_branch_name); });
    return Array.from(m.entries());
  }, [visible]);

  const assets = useMemo(() => {
    const m = new Map<string, string>();
    visible.forEach(t => { if (t.asset_id && t.asset_name) m.set(t.asset_id, `${t.asset_code ?? ''} ${t.asset_name}`.trim()); });
    return Array.from(m.entries());
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible.filter(t => {
      if (q && !`${t.title} ${t.asset_name ?? ''} ${t.asset_code ?? ''}`.toLowerCase().includes(q)) return false;
      if (branchFilter !== 'all' && t.asset_branch_id !== branchFilter) return false;
      if (deptFilter !== 'all' && t.assigned_department !== deptFilter && t.asset_department !== deptFilter) return false;
      if (assetFilter !== 'all' && t.asset_id !== assetFilter) return false;
      return true;
    });
  }, [visible, search, branchFilter, deptFilter, assetFilter]);

  const today = todayLocalISO();
  const todays = filtered.filter(t => t.status === 'Pending' && t.due_date === today);
  const overdue = filtered.filter(t => t.status === 'Overdue' || (t.status === 'Pending' && t.due_date < today));
  const completed = filtered.filter(t => t.status === 'Done');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" className="pl-8" />
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {branches.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={assetFilter} onValueChange={setAssetFilter}>
          <SelectTrigger><SelectValue placeholder="Equipment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All equipment</SelectItem>
            {assets.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…</div>
      ) : (
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">Today ({todays.length})</TabsTrigger>
            <TabsTrigger value="overdue">Overdue ({overdue.length})</TabsTrigger>
            <TabsTrigger value="done">Completed ({completed.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="mt-3"><TaskGrid items={todays} onOpen={setActive} /></TabsContent>
          <TabsContent value="overdue" className="mt-3"><TaskGrid items={overdue} onOpen={setActive} /></TabsContent>
          <TabsContent value="done" className="mt-3"><TaskGrid items={completed} onOpen={setActive} /></TabsContent>
        </Tabs>
      )}

      {active && (
        <TaskCompletionDialog
          task={active}
          onOpenChange={(v) => { if (!v) setActive(null); }}
        />
      )}
    </div>
  );
}

function TaskGrid({ items, onOpen }: { items: EnrichedMaintenanceTask[]; onOpen: (t: EnrichedMaintenanceTask) => void }) {
  if (!items.length) {
    return <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">No tasks to show.</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map(t => <TaskCard key={t.id} task={t} onOpen={() => onOpen(t)} />)}
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: EnrichedMaintenanceTask; onOpen: () => void }) {
  return (
    <Card className="p-3 cursor-pointer hover:border-primary/40 transition" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{task.title}</div>
          <div className="text-xs text-muted-foreground truncate">
            {task.asset_code ? `${task.asset_code} — ` : ''}{task.asset_name ?? 'Unknown asset'}
          </div>
        </div>
        <StatusBadge status={task.status} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{task.due_time?.slice(0, 5)}</span>
        {task.asset_branch_name && <Badge variant="secondary" className="text-[10px]">{task.asset_branch_name}</Badge>}
        {task.assigned_department && <Badge variant="outline" className="text-[10px] capitalize">{task.assigned_department}</Badge>}
        {task.assigned_staff_name && <Badge variant="outline" className="text-[10px]">{task.assigned_staff_name}</Badge>}
        {task.note_required && <Badge variant="outline" className="text-[10px] gap-1"><StickyNote className="h-3 w-3" />Note</Badge>}
        {task.photo_required && <Badge variant="outline" className="text-[10px] gap-1"><Camera className="h-3 w-3" />Photo</Badge>}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'Done') return <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><CheckCircle2 className="h-3 w-3" />Done</Badge>;
  if (status === 'Overdue') return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Overdue</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function TaskCompletionDialog({
  task, onOpenChange,
}: { task: EnrichedMaintenanceTask; onOpenChange: (v: boolean) => void }) {
  const { profile } = useAuth();
  const complete = useCompleteMaintenanceTask();
  const [note, setNote] = useState(task.note ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(task.photo_url ?? null);
  const [uploading, setUploading] = useState(false);

  const isDone = task.status === 'Done';

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadToAppFilesBucket(file, 'maintenance', {
        branchName: task.asset_branch_name ?? undefined,
        category: task.asset_department ?? undefined,
        assetOrEquipment: task.asset_code ?? task.asset_name ?? undefined,
      });
      setPhotoUrl(res.publicUrl);
      toast.success('Photo uploaded');
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    if (task.note_required && !note.trim()) {
      toast.error('A note is required to complete this task');
      return;
    }
    if (task.photo_required && !photoUrl) {
      toast.error('A photo is required to complete this task');
      return;
    }
    if (!profile?.user_id) {
      toast.error('You must be signed in');
      return;
    }
    try {
      await complete.mutateAsync({ id: task.id, note, photo_url: photoUrl, user_id: profile.user_id });
      toast.success('Task marked as done');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save');
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border p-3 space-y-1">
            <div><span className="text-muted-foreground">Equipment:</span> {task.asset_code ? `${task.asset_code} — ` : ''}{task.asset_name}</div>
            <div><span className="text-muted-foreground">Branch:</span> {task.asset_branch_name ?? '—'}</div>
            <div><span className="text-muted-foreground">Due:</span> {task.due_date} {task.due_time?.slice(0, 5)}</div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span> <StatusBadge status={task.status} />
            </div>
          </div>

          <div>
            <Label>Note {task.note_required && <span className="text-destructive">*</span>}</Label>
            <Textarea
              rows={3}
              value={note}
              disabled={isDone}
              onChange={e => setNote(e.target.value)}
              placeholder={task.note_required ? 'Required' : 'Optional'}
            />
          </div>

          <div>
            <Label>Photo {task.photo_required && <span className="text-destructive">*</span>}</Label>
            {photoUrl ? (
              <div className="mt-1">
                <ChecklistPhotoPreview imageUrl={photoUrl} altText={task.title} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">No photo attached.</div>
            )}
            {!isDone && (
              <div className="mt-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
                />
                {uploading && <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</div>}
              </div>
            )}
          </div>

          {isDone && task.completed_at && (
            <div className="text-xs text-muted-foreground">
              Completed at {new Date(task.completed_at).toLocaleString()}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!isDone && (
            <Button onClick={handleComplete} disabled={complete.isPending || uploading}>
              {complete.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Mark as Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}