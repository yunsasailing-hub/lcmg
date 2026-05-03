import { useMemo, useState } from 'react';
import {
  Loader2, Search, Camera, StickyNote, CheckCircle2, AlertTriangle, Clock, User, CalendarCheck,
  ArrowUp, ArrowDown, ArrowUpDown, Wrench, LayoutList, LayoutGrid,
} from 'lucide-react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Trash2, Upload } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useIsMobile } from '@/hooks/use-mobile';
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
          <TabsContent value="today" className="mt-3"><TaskView tab="today" items={todays} onOpen={setActive} /></TabsContent>
          <TabsContent value="overdue" className="mt-3"><TaskView tab="overdue" items={overdue} onOpen={setActive} /></TabsContent>
          <TabsContent value="done" className="mt-3"><TaskView tab="done" items={completed} onOpen={setActive} /></TabsContent>
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

type TabKey = 'today' | 'overdue' | 'done';
type SortKey =
  | 'asset_code' | 'asset_name' | 'title' | 'asset_branch_name'
  | 'assigned_department' | 'due_date' | 'due_time' | 'status' | 'completed_at';
type SortDir = 'asc' | 'desc';

function hasTechDetails(t: EnrichedMaintenanceTask): boolean {
  const a = t as any;
  return !!(a.cost_amount != null || a.cost_type || a.external_company || a.external_contact ||
    a.spare_parts || a.technical_note || (Array.isArray(a.additional_photos) && a.additional_photos.length));
}

function getDefaultSort(tab: TabKey): { key: SortKey; dir: SortDir } {
  if (tab === 'overdue') return { key: 'due_date', dir: 'asc' };
  if (tab === 'done') return { key: 'completed_at', dir: 'desc' };
  return { key: 'due_time', dir: 'asc' };
}

function sortValue(t: EnrichedMaintenanceTask, key: SortKey): string | number {
  switch (key) {
    case 'due_date': return t.due_date ? new Date(t.due_date).getTime() : 0;
    case 'due_time': return t.due_time ?? '';
    case 'completed_at': return t.completed_at ? new Date(t.completed_at).getTime() : 0;
    case 'asset_code': return t.asset_code ?? '';
    case 'asset_name': return t.asset_name ?? '';
    case 'title': return t.title ?? '';
    case 'asset_branch_name': return t.asset_branch_name ?? '';
    case 'assigned_department': return t.assigned_department ?? t.asset_department ?? '';
    case 'status': return t.status ?? '';
    default: return '';
  }
}

function TaskView({ tab, items, onOpen }: { tab: TabKey; items: EnrichedMaintenanceTask[]; onOpen: (t: EnrichedMaintenanceTask) => void }) {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const def = getDefaultSort(tab);
  const [sortKey, setSortKey] = useState<SortKey>(def.key);
  const [sortDir, setSortDir] = useState<SortDir>(def.dir);

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const dir = sortDir === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
    return arr;
  }, [items, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as 'list' | 'cards')} size="sm">
          <ToggleGroupItem value="list" aria-label="List view"><LayoutList className="h-4 w-4" /></ToggleGroupItem>
          <ToggleGroupItem value="cards" aria-label="Cards view"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!sorted.length ? (
        <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">No tasks to show.</div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(t => <TaskCard key={t.id} task={t} onOpen={() => onOpen(t)} />)}
        </div>
      ) : isMobile ? (
        <MobileTaskList items={sorted} onOpen={onOpen} />
      ) : (
        <TaskTable items={sorted} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} onOpen={onOpen} showCompleted={tab === 'done'} />
      )}
    </div>
  );
}

function SortHeader({
  label, k, sortKey, sortDir, onSort, className,
}: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; className?: string }) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground transition"
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? 'text-foreground' : 'text-muted-foreground/60'}`} />
      </button>
    </TableHead>
  );
}

function RequirementsBadges({ task }: { task: EnrichedMaintenanceTask }) {
  const tech = hasTechDetails(task);
  const photoCount = (task.photo_url ? 1 : 0) + (Array.isArray(task.additional_photos) ? task.additional_photos.length : 0);
  if (!task.note_required && !task.photo_required && !tech && photoCount === 0) {
    return <span className="text-muted-foreground/60 text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {task.note_required && <Badge variant="outline" className="text-[10px] gap-1"><StickyNote className="h-3 w-3" />Note</Badge>}
      {task.photo_required && <Badge variant="outline" className="text-[10px] gap-1"><Camera className="h-3 w-3" />Photo</Badge>}
      {tech && <Badge variant="outline" className="text-[10px] gap-1"><Wrench className="h-3 w-3" />Tech</Badge>}
      {task.status === 'Done' && photoCount > 0 && (
        <Badge variant="secondary" className="text-[10px] gap-1"><Camera className="h-3 w-3" />{photoCount} photo{photoCount === 1 ? '' : 's'}</Badge>
      )}
    </div>
  );
}

function TaskTable({
  items, sortKey, sortDir, onSort, onOpen, showCompleted,
}: {
  items: EnrichedMaintenanceTask[];
  sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void;
  onOpen: (t: EnrichedMaintenanceTask) => void;
  showCompleted: boolean;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader label="Code" k="asset_code" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Equipment" k="asset_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Task" k="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Branch" k="asset_branch_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Department" k="assigned_department" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Due date" k="due_date" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Due time" k="due_time" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <TableHead>Assignment</TableHead>
            <TableHead>Requirements</TableHead>
            {showCompleted && <TableHead>Completed by</TableHead>}
            {showCompleted && <SortHeader label="Completed at" k="completed_at" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(t => (
            <TableRow
              key={t.id}
              className="cursor-pointer"
              onClick={() => onOpen(t)}
            >
              <TableCell className="font-mono text-xs">{t.asset_code ?? '—'}</TableCell>
              <TableCell className="max-w-[180px] truncate">{t.asset_name ?? '—'}</TableCell>
              <TableCell className="max-w-[200px] truncate">{t.title}</TableCell>
              <TableCell>{t.asset_branch_name ?? '—'}</TableCell>
              <TableCell className="capitalize">{t.assigned_department ?? t.asset_department ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{t.due_date ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{t.due_time?.slice(0, 5) ?? '—'}</TableCell>
              <TableCell><StatusBadge status={t.status} /></TableCell>
              <TableCell className="text-xs">
                {t.assigned_staff_name ?? (t.assigned_department ? <span className="capitalize text-muted-foreground">{t.assigned_department}</span> : '—')}
              </TableCell>
              <TableCell><RequirementsBadges task={t} /></TableCell>
              {showCompleted && <TableCell className="text-xs">{t.completed_by_name ?? '—'}</TableCell>}
              {showCompleted && (
                <TableCell className="whitespace-nowrap text-xs">
                  {t.completed_at ? new Date(t.completed_at).toLocaleString() : '—'}
                </TableCell>
              )}
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); onOpen(t); }}
                >
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileTaskList({ items, onOpen }: { items: EnrichedMaintenanceTask[]; onOpen: (t: EnrichedMaintenanceTask) => void }) {
  return (
    <div className="rounded-md border divide-y">
      {items.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t)}
          className="w-full text-left p-3 hover:bg-muted/50 transition"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold truncate">
              <span className="font-mono text-xs text-muted-foreground mr-1">{t.asset_code ?? '—'}</span>
              — {t.title}
            </div>
            <StatusBadge status={t.status} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
            <span>{t.due_date ?? '—'}</span>
            <span>·</span>
            <span>{t.due_time?.slice(0, 5) ?? '--:--'}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {t.asset_branch_name && <span>{t.asset_branch_name}</span>}
            {(t.assigned_department || t.asset_department) && <><span>·</span><span className="capitalize">{t.assigned_department ?? t.asset_department}</span></>}
            <span className="ml-auto"><RequirementsBadges task={t} /></span>
          </div>
        </button>
      ))}
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: EnrichedMaintenanceTask; onOpen: () => void }) {
  const isDone = task.status === 'Done';
  return (
    <Card className="p-3 cursor-pointer hover:border-primary/40 transition" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{task.title}</div>
          <div className="text-xs text-muted-foreground truncate">
            {task.asset_code ? `${task.asset_code} — ` : ''}{task.asset_name ?? 'Unknown asset'}
          </div>
          {task.asset_type_name && (
            <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{task.asset_type_name}</div>
          )}
        </div>
        <StatusBadge status={task.status} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
          <Clock className="h-3.5 w-3.5" />Due {task.due_time?.slice(0, 5) ?? '--:--'}
        </span>
        {task.asset_branch_name && <Badge variant="secondary" className="text-[10px]">{task.asset_branch_name}</Badge>}
        {task.assigned_department && <Badge variant="outline" className="text-[10px] capitalize">{task.assigned_department}</Badge>}
        {task.assigned_staff_name && <Badge variant="outline" className="text-[10px]">{task.assigned_staff_name}</Badge>}
        {task.note_required && <Badge variant="outline" className="text-[10px] gap-1"><StickyNote className="h-3 w-3" />Note</Badge>}
        {task.photo_required && <Badge variant="outline" className="text-[10px] gap-1"><Camera className="h-3 w-3" />Photo</Badge>}
      </div>
      {isDone && (task.completed_by_name || task.completed_at) && (
        <div className="mt-2 pt-2 border-t flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {task.completed_by_name && (
            <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{task.completed_by_name}</span>
          )}
          {task.completed_at && (
            <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" />{new Date(task.completed_at).toLocaleString()}</span>
          )}
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'Done')
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1 px-2 py-0.5 text-[11px] font-semibold"><CheckCircle2 className="h-3.5 w-3.5" />Done</Badge>;
  if (status === 'Overdue')
    return <Badge variant="destructive" className="gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"><AlertTriangle className="h-3.5 w-3.5" />Overdue</Badge>;
  return <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1 px-2 py-0.5 text-[11px] font-semibold"><Clock className="h-3.5 w-3.5" />Pending</Badge>;
}

function TaskCompletionDialog({
  task, onOpenChange,
}: { task: EnrichedMaintenanceTask; onOpenChange: (v: boolean) => void }) {
  const { profile } = useAuth();
  const complete = useCompleteMaintenanceTask();
  const [note, setNote] = useState(task.note ?? '');
  const [uploading, setUploading] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [executionDate, setExecutionDate] = useState<string>(
    (task as any).execution_date ?? todayLocalISO(),
  );

  // Advanced / Technical Details (all optional)
  const initialAdv = task as any;
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
  // Unified photo list: combines legacy photo_url (first slot) + additional_photos.
  const [photos, setPhotos] = useState<string[]>(() => {
    const list: string[] = [];
    if (task.photo_url) list.push(task.photo_url);
    if (Array.isArray(initialAdv.additional_photos)) {
      for (const u of initialAdv.additional_photos as string[]) {
        if (u && !list.includes(u)) list.push(u);
      }
    }
    return list.slice(0, MAX_PHOTOS);
  });

  const isDone = task.status === 'Done';
  const noteMissing = task.note_required && !note.trim();
  const photoMissing = task.photo_required && photos.length === 0;

  const handleUpload = async (file: File) => {
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Up to ${MAX_PHOTOS} photos allowed`);
      return;
    }
    setUploading(true);
    try {
      const res = await uploadToAppFilesBucket(file, 'maintenance', {
        branchName: task.asset_branch_name ?? undefined,
        category: task.asset_department ?? undefined,
        assetOrEquipment: task.asset_code ?? task.asset_name ?? undefined,
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
    if (noteMissing) {
      toast.error('A note is required to complete this task');
      return;
    }
    if (photoMissing) {
      toast.error('A photo is required to complete this task');
      return;
    }
    if (!profile?.user_id) {
      toast.error('You must be signed in');
      return;
    }
    try {
      const costNum = costAmount.trim() === '' ? null : Number(costAmount);
      const [firstPhoto, ...restPhotos] = photos;
      await complete.mutateAsync({
        id: task.id,
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
      });
      toast.success('Maintenance task completed');
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
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Job description</div>
            {task.template_description?.trim() ? (
              <div className="whitespace-pre-wrap text-sm">{task.template_description}</div>
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
            <div><span className="text-muted-foreground">Equipment:</span> {task.asset_code ? `${task.asset_code} — ` : ''}{task.asset_name}</div>
            {task.asset_type_name && (
              <div><span className="text-muted-foreground">Type:</span> {task.asset_type_name}</div>
            )}
            <div><span className="text-muted-foreground">Branch:</span> {task.asset_branch_name ?? '—'}</div>
            <div><span className="text-muted-foreground">Department:</span> <span className="capitalize">{task.assigned_department ?? task.asset_department ?? '—'}</span></div>
            <div><span className="text-muted-foreground">Due:</span> {task.due_date} {task.due_time?.slice(0, 5)}</div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span> <StatusBadge status={task.status} />
            </div>
          </div>

          {!isDone && (task.note_required || task.photo_required) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 text-xs space-y-1">
              <div className="font-semibold text-amber-900 dark:text-amber-200">Required to complete:</div>
              <ul className="space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
                {task.note_required && (
                  <li className="flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" />Note Required</li>
                )}
                {task.photo_required && (
                  <li className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" />Photo Required</li>
                )}
              </ul>
            </div>
          )}

          <div>
            <Label>Note {task.note_required && <span className="text-destructive">*</span>}</Label>
            <Textarea
              rows={3}
              value={note}
              disabled={isDone}
              onChange={e => setNote(e.target.value)}
              placeholder={task.note_required ? 'Required' : 'Optional'}
              className={attempted && noteMissing ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {attempted && noteMissing && (
              <div className="text-xs text-destructive mt-1">Note is required.</div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>
                Photos {task.photo_required && <span className="text-destructive">*</span>}
                <span className="ml-1 text-xs text-muted-foreground font-normal">({photos.length}/{MAX_PHOTOS})</span>
              </Label>
              {isDone && photos.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{photos.length} photo{photos.length === 1 ? '' : 's'}</Badge>
              )}
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
            {photos.length === 0 && !isDone && (
              <div className={`text-xs mt-1 ${attempted && photoMissing ? 'text-destructive' : 'text-muted-foreground'}`}>
                {attempted && photoMissing ? 'At least 1 photo is required.' : task.photo_required ? 'At least 1 photo required.' : 'Photos optional (up to 4).'}
              </div>
            )}
            {isDone && photos.length === 0 && (
              <div className="text-xs mt-1 text-muted-foreground">No photos attached.</div>
            )}
          </div>

          {isDone && (task.completed_at || task.completed_by_name) && (
            <div className="rounded-md border bg-muted/40 p-2.5 text-xs space-y-1">
              {(task as any).execution_date && (
                <div className="flex items-center gap-1.5"><CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />Execution date: <span className="font-medium">{(task as any).execution_date}</span></div>
              )}
              {task.completed_by_name && (
                <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" />Completed by <span className="font-medium">{task.completed_by_name}</span></div>
              )}
              {task.completed_at && (
                <div className="flex items-center gap-1.5"><CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />Completed at: <span className="font-medium">{new Date(task.completed_at).toLocaleString()}</span></div>
              )}
            </div>
          )}

          {/* Advanced / Technical Details (optional) */}
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
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={costAmount}
                    disabled={isDone}
                    onChange={e => setCostAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">Cost type</Label>
                  <Select
                    value={costType || undefined}
                    onValueChange={v => setCostType(v as 'Internal' | 'External')}
                    disabled={isDone}
                  >
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