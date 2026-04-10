import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  Clock, CheckCircle2, ShieldCheck, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ChecklistStatus } from '@/hooks/useChecklists';

interface StatusConfig {
  label: string;
  variant: 'secondary' | 'default' | 'destructive' | 'outline';
  className?: string;
}

interface GroupedChecklistListProps {
  checklists: any[];
  statusCfg: Record<string, StatusConfig>;
  onSelect: (instance: any) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (ids: string[], selected: boolean) => void;
}

interface MonthGroup {
  key: string;
  label: string;
  sortValue: number;
  items: any[];
}

interface DepartmentGroup {
  department: string;
  months: MonthGroup[];
  total: number;
}

function getMonthKey(instance: any): { key: string; label: string; sortValue: number } {
  const dateStr = instance.submitted_at || instance.scheduled_date;
  if (!dateStr) return { key: '0000-00', label: 'Unknown', sortValue: 0 };
  const d = new Date(dateStr);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const label = format(d, 'MMMM yyyy');
  const sortValue = d.getFullYear() * 100 + d.getMonth();
  return { key, label, sortValue };
}

function groupByDepartmentAndMonth(checklists: any[]): DepartmentGroup[] {
  const deptMap = new Map<string, Map<string, { label: string; sortValue: number; items: any[] }>>();

  for (const item of checklists) {
    const dept = item.department || 'unknown';
    if (!deptMap.has(dept)) deptMap.set(dept, new Map());
    const monthMap = deptMap.get(dept)!;

    const { key, label, sortValue } = getMonthKey(item);
    if (!monthMap.has(key)) monthMap.set(key, { label, sortValue, items: [] });
    monthMap.get(key)!.items.push(item);
  }

  const result: DepartmentGroup[] = [];
  for (const [department, monthMap] of deptMap) {
    const months: MonthGroup[] = [];
    for (const [key, { label, sortValue, items }] of monthMap) {
      items.sort((a: any, b: any) => {
        const da = new Date(a.submitted_at || a.scheduled_date).getTime();
        const db = new Date(b.submitted_at || b.scheduled_date).getTime();
        return db - da;
      });
      months.push({ key, label, sortValue, items });
    }
    months.sort((a, b) => b.sortValue - a.sortValue);
    result.push({ department, months, total: months.reduce((s, m) => s + m.items.length, 0) });
  }

  result.sort((a, b) => a.department.localeCompare(b.department));
  return result;
}

function ChecklistRow({ instance, statusCfg, onSelect, today, selectable, isSelected, onToggleSelect }: {
  instance: any; statusCfg: Record<string, StatusConfig>; onSelect: (i: any) => void; today: string;
  selectable?: boolean; isSelected?: boolean; onToggleSelect?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const tpl = instance.template as any;
  const assignee = instance.assignee as any;
  const cfg = statusCfg[instance.status as ChecklistStatus];
  const overdue = instance.status === 'pending' && instance.scheduled_date < today;
  const StatusIcon = instance.status === 'pending' ? (overdue ? AlertTriangle : Clock)
    : instance.status === 'rejected' ? AlertTriangle
    : instance.status === 'verified' ? ShieldCheck
    : CheckCircle2;

  return (
    <div
      className={cn(
        'w-full flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent',
        overdue && 'border-destructive/60',
        isSelected && 'ring-2 ring-primary/50 bg-primary/5'
      )}
    >
      {selectable && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect?.(instance.id)}
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <button
        onClick={() => onSelect(instance)}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <StatusIcon className={cn('h-5 w-5 shrink-0',
          overdue ? 'text-destructive' : instance.status === 'rejected' ? 'text-destructive'
          : instance.status === 'pending' ? 'text-muted-foreground' : 'text-success'
        )} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate text-sm">{tpl?.title ?? t('checklists.templateDeleted')}</p>
          <p className="text-xs text-muted-foreground">
            {assignee?.full_name || t('checklists.unassigned')}
            {instance.submitted_at && (
              <span> · {format(new Date(instance.submitted_at), 'dd MMM, HH:mm')}</span>
            )}
            {!instance.submitted_at && (
              <span> · {format(new Date(instance.scheduled_date + 'T00:00:00'), 'dd MMM')}</span>
            )}
            {overdue && <span className="text-destructive font-semibold ml-1">{t('checklists.overdue')}</span>}
          </p>
        </div>
        <Badge variant={cfg?.variant} className={cfg?.className}>{cfg?.label}</Badge>
      </button>
    </div>
  );
}

export default function GroupedChecklistList({ checklists, statusCfg, onSelect, selectable, selectedIds, onToggleSelect, onToggleAll }: GroupedChecklistListProps) {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];

  const groups = useMemo(() => groupByDepartmentAndMonth(checklists), [checklists]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleMonth = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const allIds = useMemo(() => checklists.map(c => c.id), [checklists]);
  const allSelected = selectable && selectedIds && allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const someSelected = selectable && selectedIds && allIds.some(id => selectedIds.has(id));

  const handleSelectAll = useCallback(() => {
    if (!onToggleAll) return;
    onToggleAll(allIds, !allSelected);
  }, [onToggleAll, allIds, allSelected]);

  if (!groups.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-sm">{t('checklists.noMatch')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {selectable && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">{t('checklists.selectAll')}</span>
        </div>
      )}

      {groups.map(dept => (
        <div key={dept.department} className="space-y-3">
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-base font-heading font-bold uppercase tracking-wider text-foreground">
              {t(`departments.${dept.department}`, dept.department)}
            </h3>
            <span className="text-base font-bold text-muted-foreground">({dept.total})</span>
          </div>

          <div className="space-y-2 pl-1">
            {dept.months.map(month => {
              const collapseKey = `${dept.department}-${month.key}`;
              const isOpen = !collapsed.has(collapseKey);

              return (
                <Collapsible key={month.key} open={isOpen} onOpenChange={() => toggleMonth(collapseKey)}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-medium text-muted-foreground">{month.label}</span>
                    <span className="text-xs text-muted-foreground">({month.items.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1.5 mt-1.5 pl-6">
                    {month.items.map(instance => (
                      <ChecklistRow
                        key={instance.id}
                        instance={instance}
                        statusCfg={statusCfg}
                        onSelect={onSelect}
                        today={today}
                        selectable={selectable}
                        isSelected={selectedIds?.has(instance.id)}
                        onToggleSelect={onToggleSelect}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
