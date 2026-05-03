import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, ClipboardList, Filter, Loader2, Pencil, Wrench,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import EmptyState from '@/components/shared/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import {
  useWorkToBeDoneList,
  WTBD_ACTIVE_STATUSES,
  WTBD_PRIORITIES,
  WTBD_STATUSES,
  WORK_AREAS,
  type EnrichedWtbd,
  type WtbdPriority,
  type WtbdStatus,
} from '@/hooks/useWorkToBeDone';
import { useBranchesAll } from '@/hooks/useMaintenance';
import WorkToBeDoneFormDialog from './WorkToBeDoneFormDialog';

const STATUS_BADGE: Record<WtbdStatus, string> = {
  Open: 'bg-muted text-foreground border-border',
  Postponed: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  'In Progress': 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  Completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Cancelled: 'bg-muted text-muted-foreground border-border',
};

const PRIORITY_BADGE: Record<WtbdPriority, string> = {
  Low: 'bg-muted text-muted-foreground border-border',
  Medium: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  High: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  Urgent: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
};

const PRIORITY_RANK: Record<WtbdPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const STATUS_RANK: Record<WtbdStatus, number> = {
  Open: 0, 'In Progress': 1, Postponed: 2, Completed: 3, Cancelled: 4,
};

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

function shortCode(id: string) {
  return `WTD-${id.slice(0, 6).toUpperCase()}`;
}

type SortKey = 'due_date' | 'priority' | 'status' | 'branch' | 'work_area' | 'last_update';

interface WorkToBeDoneListProps {
  onJumpToRepair?: (id: string) => void;
}

export default function WorkToBeDoneList({ onJumpToRepair }: WorkToBeDoneListProps = {}) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const isManager = hasRole('manager');
  const canCreate = isOwner || isManager;

  const { data: items = [], isLoading } = useWorkToBeDoneList();
  const { data: branches = [] } = useBranchesAll();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedWtbd | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [fBranch, setFBranch] = useState<string>('all');
  const [fDept, setFDept] = useState<string>('all');
  const [fStatus, setFStatus] = useState<string>('all');
  const [fPriority, setFPriority] = useState<string>('all');
  const [fWorkArea, setFWorkArea] = useState<string>('all');

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (k: SortKey) => {
    if (sortKey !== k) { setSortKey(k); setSortDir('asc'); return; }
    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => i.department && set.add(i.department));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let list = [...items];
    const hasStatusFilter = fStatus !== 'all';
    if (!showArchived && !hasStatusFilter) {
      list = list.filter(i => WTBD_ACTIVE_STATUSES.includes(i.status));
    }
    if (fBranch !== 'all') list = list.filter(i => i.branch_id === fBranch);
    if (fDept !== 'all') list = list.filter(i => i.department === fDept);
    if (hasStatusFilter) list = list.filter(i => i.status === fStatus);
    if (fPriority !== 'all') list = list.filter(i => i.priority === fPriority);
    if (fWorkArea !== 'all') list = list.filter(i => (i as any).work_area === fWorkArea);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.area_or_equipment ?? '').toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q),
      );
    }

    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        switch (sortKey) {
          case 'due_date': {
            const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
            const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
            return (ad - bd) * dir;
          }
          case 'priority': return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
          case 'status': return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir;
          case 'branch': return ((a.branch_name ?? '').localeCompare(b.branch_name ?? '')) * dir;
          case 'work_area': return (((a as any).work_area ?? '').localeCompare((b as any).work_area ?? '')) * dir;
          case 'last_update': return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
        }
      });
    } else {
      // Default: overdue → status → priority → due → updated
      list.sort((a, b) => {
        const aOver = a.due_date && new Date(a.due_date) < today
          && !['Completed', 'Cancelled'].includes(a.status) ? 0 : 1;
        const bOver = b.due_date && new Date(b.due_date) < today
          && !['Completed', 'Cancelled'].includes(b.status) ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        const sr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (sr !== 0) return sr;
        const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pr !== 0) return pr;
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }
    return list;
  }, [items, showArchived, fBranch, fDept, fStatus, fPriority, fWorkArea, search, sortKey, sortDir, today]);

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k
      ? <ArrowUpDown className="h-3 w-3 opacity-30" />
      : sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  const SH = ({ k, label }: { k: SortKey; label: string }) => (
    <button type="button" onClick={() => handleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
      {label}<SortIcon k={k} />
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('common.search', 'Search')}
            className="h-9 w-48"
          />
          {isOwner && (
            <Select value={fBranch} onValueChange={setFBranch}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={fDept} onValueChange={setFDept}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All depts</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {WTBD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPriority} onValueChange={setFPriority}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {WTBD_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fWorkArea} onValueChange={setFWorkArea}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Work Area" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All work areas</SelectItem>
              {WORK_AREAS.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={showArchived ? 'outline' : 'default'}
            size="sm"
            onClick={() => setShowArchived(v => !v)}
          >
            <Filter className="h-3.5 w-3.5 mr-1" />
            {showArchived ? 'Including archived' : 'Active only'}
          </Button>
        </div>
        {canCreate && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add Work To Be Done
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No work to be done"
          description="Add a job that should be handled later, when ready or during a quiet day."
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10">Code</TableHead>
                <TableHead className="h-10">Title</TableHead>
                <TableHead className="h-10"><SH k="branch" label="Branch" /></TableHead>
                <TableHead className="h-10">Dept</TableHead>
                <TableHead className="h-10"><SH k="work_area" label="Work Area" /></TableHead>
                <TableHead className="h-10">Area / Equipment</TableHead>
                <TableHead className="h-10"><SH k="priority" label="Priority" /></TableHead>
                <TableHead className="h-10"><SH k="status" label="Status" /></TableHead>
                <TableHead className="h-10"><SH k="due_date" label="Due Date" /></TableHead>
                <TableHead className="h-10">Assigned</TableHead>
                <TableHead className="h-10">Updates</TableHead>
                <TableHead className="h-10"><SH k="last_update" label="Last Update" /></TableHead>
                <TableHead className="h-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => {
                const overdue = item.due_date && new Date(item.due_date) < today
                  && !['Completed', 'Cancelled'].includes(item.status);
                return (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => { setEditing(item); setFormOpen(true); }}
                  >
                    <TableCell className="py-2 font-mono text-xs text-muted-foreground">{shortCode(item.id)}</TableCell>
                    <TableCell className="py-2 font-medium max-w-[16rem] truncate">{item.title}</TableCell>
                    <TableCell className="py-2 text-xs">{item.branch_name ?? '—'}</TableCell>
                    <TableCell className="py-2 text-xs capitalize">{item.department ?? '—'}</TableCell>
                    <TableCell className="py-2 text-xs">{(item as any).work_area ?? 'General / Other'}</TableCell>
                    <TableCell className="py-2 text-xs max-w-[12rem] truncate">{item.area_or_equipment ?? '—'}</TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className={PRIORITY_BADGE[item.priority]}>{item.priority}</Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={STATUS_BADGE[item.status]}>{item.status}</Badge>
                        {overdue && (
                          <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 text-[10px] px-1.5">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs">{fmtDate(item.due_date)}</TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{item.assignee_username ?? '—'}</TableCell>
                    <TableCell className="py-2 text-xs">{item.updates_count ?? 0}</TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{fmtDate(item.updated_at)}</TableCell>
                    <TableCell className="py-2 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(item); setFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {item.status === 'Completed' && onJumpToRepair && (
                          <Button size="sm" variant="ghost" title="Open / Create Repair" onClick={() => { setEditing(item); setFormOpen(true); }}>
                            <Wrench className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {formOpen && (
        <WorkToBeDoneFormDialog
          open={formOpen}
          onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
          initial={editing}
          onJumpToRepair={onJumpToRepair}
        />
      )}
    </div>
  );
}
