import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ClipboardList, Calendar, Filter, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import EmptyState from '@/components/shared/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import {
  useWorkToBeDoneList,
  WTBD_ACTIVE_STATUSES,
  WTBD_PRIORITIES,
  WTBD_STATUSES,
  WTBD_OCCASIONS,
  WORK_AREAS,
  type EnrichedWtbd,
  type WtbdPriority,
  type WtbdStatus,
  type WtbdTargetOccasion,
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

function fmtDate(s?: string | null) {
  if (!s) return null;
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

interface WorkToBeDoneListProps {
  onJumpToRepair?: (id: string) => void;
}

export default function WorkToBeDoneList({ onJumpToRepair }: WorkToBeDoneListProps = {}) {
  const { t } = useTranslation();
  const { hasRole, profile } = useAuth();
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
  const [fStatus, setFStatus] = useState<string>('all');
  const [fPriority, setFPriority] = useState<string>('all');
  const [fOccasion, setFOccasion] = useState<string>('all');
  const [fWorkArea, setFWorkArea] = useState<string>('all');

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const filtered = useMemo(() => {
    let list = [...items];
    if (!showArchived) {
      list = list.filter(i => WTBD_ACTIVE_STATUSES.includes(i.status));
    }
    if (fBranch !== 'all') list = list.filter(i => i.branch_id === fBranch);
    if (fStatus !== 'all') list = list.filter(i => i.status === fStatus);
    if (fPriority !== 'all') list = list.filter(i => i.priority === fPriority);
    if (fOccasion !== 'all') list = list.filter(i => i.target_occasion === fOccasion);
    if (fWorkArea !== 'all') list = list.filter(i => (i as any).work_area === fWorkArea);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.area_or_equipment ?? '').toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      const aOver = a.due_date && new Date(a.due_date) < today ? 0 : 1;
      const bOver = b.due_date && new Date(b.due_date) < today ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return list;
  }, [items, showArchived, fBranch, fStatus, fPriority, fOccasion, fWorkArea, search, today]);

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
          <Select value={fOccasion} onValueChange={setFOccasion}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Target occasion" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All occasions</SelectItem>
              {WTBD_OCCASIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
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
            variant={showArchived ? 'default' : 'outline'}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(item => {
            const overdue = item.due_date && new Date(item.due_date) < today
              && !['Completed','Cancelled'].includes(item.status);
            return (
              <Card
                key={item.id}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => { setEditing(item); setFormOpen(true); }}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold leading-tight truncate">{item.title}</div>
                    <Badge variant="outline" className={PRIORITY_BADGE[item.priority]}>{item.priority}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="outline" className={STATUS_BADGE[item.status]}>{item.status}</Badge>
                    {overdue && (
                      <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">
                        Overdue
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="truncate">
                      {(item.branch_name ?? '—')} · <span className="capitalize">{item.department}</span>
                    </div>
                    {item.area_or_equipment && <div className="truncate">{item.area_or_equipment}</div>}
                    <div className="truncate">Area: {(item as any).work_area ?? 'General / Other'}</div>
                    <div className="truncate">Occasion: {item.target_occasion}</div>
                    {item.due_date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />Due {fmtDate(item.due_date)}
                      </div>
                    )}
                    {item.assignee_username && <div className="truncate">Assigned: {item.assignee_username}</div>}
                    <div className="truncate">Updates: {item.updates_count ?? 0}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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