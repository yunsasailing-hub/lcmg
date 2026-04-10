import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import {
  AlertTriangle, Clock, ShieldAlert, Building2, Filter, X, CalendarIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

/* ─── Types ─── */
interface OverdueInstance {
  id: string;
  checklist_type: string;
  status: string;
  due_datetime: string | null;
  scheduled_date: string;
  assigned_to: string | null;
  branch_id: string | null;
  department: string;
  template_id: string | null;
  notice_sent_at: string | null;
  warning_sent_at: string | null;
}

interface EnrichedData {
  instances: OverdueInstance[];
  profileMap: Record<string, string>;
  branchMap: Record<string, string>;
  templateMap: Record<string, string>;
  allBranches: { id: string; name: string }[];
}

/* ─── Data hook ─── */
function useOverdueChecklists() {
  const { user, hasRole } = useAuth();
  const isManagerOrOwner = hasRole('manager') || hasRole('owner');

  return useQuery<EnrichedData>({
    queryKey: ['dashboard', 'overdue-checklists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_instances')
        .select('id, checklist_type, status, due_datetime, scheduled_date, assigned_to, branch_id, department, template_id, notice_sent_at, warning_sent_at')
        .in('status', ['pending', 'late', 'escalated'])
        .not('due_datetime', 'is', null)
        .order('due_datetime', { ascending: true })
        .limit(200);
      if (error) throw error;

      const staffIds = [...new Set((data || []).map(d => d.assigned_to).filter(Boolean))] as string[];
      const branchIds = [...new Set((data || []).map(d => d.branch_id).filter(Boolean))] as string[];
      const templateIds = [...new Set((data || []).map(d => d.template_id).filter(Boolean))] as string[];

      let profileMap: Record<string, string> = {};
      let branchMap: Record<string, string> = {};
      let templateMap: Record<string, string> = {};
      let allBranches: { id: string; name: string }[] = [];

      const fetches: Promise<void>[] = [];

      if (staffIds.length > 0) {
        fetches.push(
          supabase.from('profiles').select('user_id, full_name').in('user_id', staffIds)
            .then(({ data: profiles }) => {
              if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.full_name || 'Unknown']));
            }) as Promise<void>
        );
      }

      fetches.push(
        supabase.from('branches').select('id, name').eq('is_active', true)
          .then(({ data: branches }) => {
            if (branches) {
              allBranches = branches;
              branchMap = Object.fromEntries(branches.map(b => [b.id, b.name]));
            }
          }) as Promise<void>
      );

      if (templateIds.length > 0) {
        fetches.push(
          supabase.from('checklist_templates').select('id, title').in('id', templateIds)
            .then(({ data: templates }) => {
              if (templates) templateMap = Object.fromEntries(templates.map(t => [t.id, t.title]));
            }) as Promise<void>
        );
      }

      await Promise.all(fetches);

      return {
        instances: (data || []) as OverdueInstance[],
        profileMap,
        branchMap,
        templateMap,
        allBranches,
      };
    },
    enabled: !!user && isManagerOrOwner,
    refetchInterval: 120_000,
  });
}

/* ─── Status config ─── */
const STATUS_CONFIG: Record<string, { color: string; badgeColor: string; icon: typeof Clock; label: string }> = {
  pending: { color: 'text-muted-foreground', badgeColor: 'bg-muted text-muted-foreground border-border', icon: Clock, label: 'Pending' },
  late: { color: 'text-warning-foreground', badgeColor: 'bg-warning/15 text-warning-foreground border-warning/30', icon: Clock, label: 'Late' },
  escalated: { color: 'text-destructive', badgeColor: 'bg-destructive/15 text-destructive border-destructive/30', icon: ShieldAlert, label: 'Escalated' },
};

const DEPARTMENTS = ['management', 'kitchen', 'pizza', 'service', 'bar', 'office'];
const TYPES = ['opening', 'afternoon', 'closing'];
const DATE_PRESETS = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Custom', value: 'custom' },
];

/* ─── Checklist Row ─── */
function ChecklistRow({
  instance,
  data,
}: {
  instance: OverdueInstance;
  data: EnrichedData;
}) {
  const config = STATUS_CONFIG[instance.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const branchName = instance.branch_id ? (data.branchMap[instance.branch_id] || '—') : '—';
  const staffName = instance.assigned_to ? (data.profileMap[instance.assigned_to] || '—') : 'Unassigned';
  const templateTitle = instance.template_id ? (data.templateMap[instance.template_id] || null) : null;
  const typeLabel = instance.checklist_type.charAt(0).toUpperCase() + instance.checklist_type.slice(1);
  const deptLabel = instance.department.charAt(0).toUpperCase() + instance.department.slice(1);

  return (
    <div className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
      <StatusIcon className={cn('h-4 w-4 mt-1 shrink-0', config.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {templateTitle || `${typeLabel} Checklist`}
          </span>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', config.badgeColor)}>
            {config.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{staffName}</span>
          <span>·</span>
          <span>{branchName}</span>
          <span>·</span>
          <span>{deptLabel}</span>
          <span>·</span>
          <span>{typeLabel}</span>
        </div>
        {instance.due_datetime && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Due: {format(new Date(instance.due_datetime), 'MMM d, yyyy · h:mm a')}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Stat Mini Card ─── */
function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="stat-card flex items-center gap-3 py-3 px-4">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-heading font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ─── Branch Summary Row (Owner) ─── */
function BranchSummaryRow({
  branchName,
  lateCount,
  escalatedCount,
}: {
  branchName: string;
  lateCount: number;
  escalatedCount: number;
}) {
  const total = lateCount + escalatedCount;
  return (
    <div className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{branchName}</span>
      </div>
      <div className="flex items-center gap-2">
        {lateCount > 0 && (
          <Badge variant="outline" className="bg-warning/10 text-warning-foreground border-warning/30 text-[10px]">
            {lateCount} late
          </Badge>
        )}
        {escalatedCount > 0 && (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
            {escalatedCount} escalated
          </Badge>
        )}
        {total === 0 && (
          <span className="text-xs text-muted-foreground">✓ OK</span>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function OverdueChecklistsSummary() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const isManagerOrOwner = hasRole('manager') || isOwner;
  const { data, isLoading } = useOverdueChecklists();

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('today');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);

  // Tabs: owner gets an extra "branches" tab
  const [tab, setTab] = useState<'late' | 'escalated' | 'outstanding' | 'branches'>('late');

  const hasActiveFilter = branchFilter !== 'all' || deptFilter !== 'all' || typeFilter !== 'all' || datePreset !== 'today';

  // Filter logic
  const filtered = useMemo(() => {
    if (!data) return [];
    let result = data.instances;

    // Date filter
    const now = new Date();
    if (datePreset === 'today') {
      const start = startOfDay(now);
      const end = endOfDay(now);
      result = result.filter(i => {
        const d = new Date(i.scheduled_date);
        return d >= start && d <= end;
      });
    } else if (datePreset === '7d') {
      const start = startOfDay(subDays(now, 7));
      result = result.filter(i => new Date(i.scheduled_date) >= start);
    } else if (datePreset === '30d') {
      const start = startOfDay(subDays(now, 30));
      result = result.filter(i => new Date(i.scheduled_date) >= start);
    } else if (datePreset === 'custom' && customDate) {
      const start = startOfDay(customDate);
      const end = endOfDay(customDate);
      result = result.filter(i => {
        const d = new Date(i.scheduled_date);
        return d >= start && d <= end;
      });
    }

    if (branchFilter !== 'all') result = result.filter(i => i.branch_id === branchFilter);
    if (deptFilter !== 'all') result = result.filter(i => i.department === deptFilter);
    if (typeFilter !== 'all') result = result.filter(i => i.checklist_type === typeFilter);

    return result;
  }, [data, branchFilter, deptFilter, typeFilter, datePreset, customDate]);

  const lateItems = useMemo(() => filtered.filter(i => i.status === 'late'), [filtered]);
  const escalatedItems = useMemo(() => filtered.filter(i => i.status === 'escalated'), [filtered]);
  const outstandingItems = useMemo(() => filtered.filter(i => ['pending', 'late', 'escalated'].includes(i.status)), [filtered]);

  // Branch breakdown for owners
  const branchBreakdown = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; late: number; escalated: number }>();
    for (const b of data.allBranches) {
      map.set(b.id, { name: b.name, late: 0, escalated: 0 });
    }
    for (const i of filtered) {
      if (!i.branch_id) continue;
      const entry = map.get(i.branch_id);
      if (!entry) continue;
      if (i.status === 'late') entry.late++;
      if (i.status === 'escalated') entry.escalated++;
    }
    return Array.from(map.values()).sort((a, b) => (b.late + b.escalated) - (a.late + a.escalated));
  }, [data, filtered]);

  if (!isManagerOrOwner) return null;

  const currentList = tab === 'late' ? lateItems : tab === 'escalated' ? escalatedItems : outstandingItems;

  return (
    <div className="space-y-4">
      {/* Stat cards row */}
      <div className={cn('grid gap-3', isOwner ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3')}>
        <MiniStat
          icon={Clock}
          label="Late Checklists"
          value={lateItems.length}
          color="bg-warning/15 text-warning-foreground"
        />
        <MiniStat
          icon={ShieldAlert}
          label="Escalated"
          value={escalatedItems.length}
          color="bg-destructive/15 text-destructive"
        />
        <MiniStat
          icon={AlertTriangle}
          label={isOwner ? 'Total Outstanding' : 'My Team Outstanding'}
          value={outstandingItems.length}
          color="bg-primary/10 text-primary"
        />
        {isOwner && (
          <MiniStat
            icon={Building2}
            label="Branches with Issues"
            value={branchBreakdown.filter(b => b.late + b.escalated > 0).length}
            color="bg-info/15 text-info"
          />
        )}
      </div>

      {/* Detail card */}
      <div className="stat-card p-0 overflow-hidden">
        {/* Header with tabs & filter toggle */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="late" className="text-xs h-7 px-3">
                Late {lateItems.length > 0 && `(${lateItems.length})`}
              </TabsTrigger>
              <TabsTrigger value="escalated" className="text-xs h-7 px-3">
                Escalated {escalatedItems.length > 0 && `(${escalatedItems.length})`}
              </TabsTrigger>
              <TabsTrigger value="outstanding" className="text-xs h-7 px-3">
                Outstanding {outstandingItems.length > 0 && `(${outstandingItems.length})`}
              </TabsTrigger>
              {isOwner && (
                <TabsTrigger value="branches" className="text-xs h-7 px-3">
                  Branches
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 text-xs gap-1', hasActiveFilter && 'text-primary')}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            {hasActiveFilter ? 'Filtered' : 'Filters'}
          </Button>
        </div>

        {/* Filters row */}
        {showFilters && (
          <div className="px-4 py-2 border-y bg-muted/20 flex flex-wrap gap-2 items-center">
            <Select value={datePreset} onValueChange={setDatePreset}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {datePreset === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-7 text-xs gap-1 px-2">
                    <CalendarIcon className="h-3 w-3" />
                    {customDate ? format(customDate, 'MMM d') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={setCustomDate}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            )}

            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(data?.allBranches || []).map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All depts</SelectItem>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  setBranchFilter('all');
                  setDeptFilter('all');
                  setTypeFilter('all');
                  setDatePreset('today');
                  setCustomDate(undefined);
                }}
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        )}

        {/* List content */}
        {isLoading ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading checklists...</p>
          </div>
        ) : tab === 'branches' && isOwner ? (
          branchBreakdown.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No branches found</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[360px]">
              <div className="divide-y">
                {branchBreakdown.map(b => (
                  <BranchSummaryRow
                    key={b.name}
                    branchName={b.name}
                    lateCount={b.late}
                    escalatedCount={b.escalated}
                  />
                ))}
              </div>
            </ScrollArea>
          )
        ) : currentList.length === 0 ? (
          <div className="p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground">
              {tab === 'late' ? 'No late checklists' : tab === 'escalated' ? 'No escalated checklists' : 'All checklists up to date'} ✓
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="divide-y">
              {currentList.map(instance => (
                <ChecklistRow key={instance.id} instance={instance} data={data!} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
