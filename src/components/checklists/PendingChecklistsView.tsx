import { useMemo } from 'react';
import { Circle, AlertTriangle, Clock, CircleCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { formatVN, todayVN } from '@/lib/timezone';
import { useAllChecklists, type ChecklistStatus } from '@/hooks/useChecklists';

const PENDING_STATUSES: ChecklistStatus[] = ['pending', 'late', 'escalated'];

const statusConfig: Record<ChecklistStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; className?: string }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  late: { label: 'Late', variant: 'destructive', className: 'bg-warning text-warning-foreground hover:bg-warning/80' },
  escalated: { label: 'Overdue', variant: 'destructive' },
  completed: { label: 'Done', variant: 'default' },
  verified: { label: 'Verified', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

function formatDueTime(dt: string | null) {
  if (!dt) return null;
  return formatVN(dt);
}

function ChecklistRow({ instance }: { instance: any }) {
  const tpl = instance.template;
  const cfg = statusConfig[instance.status as ChecklistStatus];
  const StatusIcon =
    instance.status === 'rejected' || instance.status === 'escalated' ? AlertTriangle
      : instance.status === 'completed' || instance.status === 'verified' ? CircleCheck
      : Circle;

  return (
    <div className="w-full flex items-center gap-3 rounded-xl border bg-card p-4 sm:p-5 min-h-[72px]">
      <StatusIcon
        className={`h-6 w-6 shrink-0 ${
          instance.status === 'rejected' || instance.status === 'escalated' ? 'text-destructive'
            : instance.status === 'late' ? 'text-warning'
            : 'text-muted-foreground'
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-base text-foreground truncate">
          {tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}
        </p>
        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground mt-0.5 flex-wrap">
          <span className="capitalize">{instance.checklist_type}</span>
          <span>·</span>
          <span className="capitalize">{instance.department}</span>
          <span>·</span>
          <span className="truncate">{instance.branch?.name ?? 'Unknown / Legacy'}</span>
          {instance.assignee?.full_name && (
            <>
              <span>·</span>
              <span className="truncate">{instance.assignee.full_name}</span>
            </>
          )}
          {instance.due_datetime && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                Due {formatDueTime(instance.due_datetime)}
              </span>
            </>
          )}
        </div>
      </div>
      <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>
    </div>
  );
}

function ChecklistList({ items, emptyText }: { items: any[]; emptyText: string }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
          <CircleCheck className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-heading font-semibold text-foreground">All caught up</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(it => <ChecklistRow key={it.id} instance={it} />)}
    </div>
  );
}

export default function PendingChecklistsView() {
  const { user, profile, hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const today = todayVN();
  const { data, isLoading } = useAllChecklists({ date: today });

  const allPending = useMemo(
    () => (data ?? []).filter((c: any) => PENDING_STATUSES.includes(c.status)),
    [data],
  );

  const lateItems = useMemo(
    () => allPending.filter((c: any) => c.status === 'late' || c.status === 'escalated'),
    [allPending],
  );

  // Manager scope: own assignments + same-department staff assignments
  const managerScope = useMemo(() => {
    if (isOwner) return allPending;
    const myDept = profile?.department ?? null;
    return allPending.filter((c: any) =>
      c.assigned_to === user?.id ||
      (myDept && c.department === myDept)
    );
  }, [allPending, isOwner, profile?.department, user?.id]);

  const myAssigned = useMemo(
    () => allPending.filter((c: any) => c.assigned_to === user?.id),
    [allPending, user?.id],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (isOwner) {
    return (
      <div className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
        <ChecklistList items={allPending} emptyText="No open checklists across all branches." />
      </div>
    );
  }

  // Manager
  return (
    <Tabs defaultValue="assigned" className="space-y-4">
      <TabsList>
        <TabsTrigger value="assigned">Assigned ({managerScope.length})</TabsTrigger>
        <TabsTrigger value="mine">Mine ({myAssigned.length})</TabsTrigger>
        <TabsTrigger value="late">Late ({lateItems.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="assigned" className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
        <ChecklistList items={managerScope} emptyText="No pending checklists in your scope." />
      </TabsContent>
      <TabsContent value="mine" className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
        <ChecklistList items={myAssigned} emptyText="Nothing assigned to you right now." />
      </TabsContent>
      <TabsContent value="late" className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
        <ChecklistList items={lateItems} emptyText="No late checklists in your scope." />
      </TabsContent>
    </Tabs>
  );
}
