import { useMemo, useState } from 'react';
import { Circle, AlertTriangle, Clock, CircleCheck, MapPin, User as UserIcon, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { formatVN, todayVN } from '@/lib/timezone';
import { useAllChecklists, useCleanupOrphanPendingChecklists, type ChecklistStatus } from '@/hooks/useChecklists';
import { TemplateCodeBadge } from '@/components/checklists/TemplateCodeBadge';

function CleanupOrphanButton() {
  const cleanup = useCleanupOrphanPendingChecklists();
  const handleConfirm = () => {
    cleanup.mutate(undefined, {
      onSuccess: (res) => {
        const i = res.deleted_instances ?? 0;
        const n = res.deleted_notifications ?? 0;
        if (i === 0 && n === 0) {
          toast.success('No orphan pending checklists found.');
        } else {
          toast.success(`Cleaned ${i} pending checklist${i === 1 ? '' : 's'} and ${n} related notification${n === 1 ? '' : 's'}.`);
        }
      },
      onError: (err: any) => toast.error(err?.message || 'Cleanup failed'),
    });
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs" disabled={cleanup.isPending}>
          {cleanup.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
          Clean Orphan Pending Checklists
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clean orphan pending checklists?</AlertDialogTitle>
          <AlertDialogDescription>
            Removes pending, late, and overdue checklists whose assignment was deleted or ended,
            along with their related notifications. Submitted and Done Archive checklists are kept untouched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Run Cleanup
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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

function formatOverdue(dt: string | null) {
  if (!dt) return null;
  const diffMs = Date.now() - new Date(dt).getTime();
  if (diffMs <= 0) return null;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m overdue`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m overdue`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h overdue`;
}

function ChecklistRow({ instance, ownerView }: { instance: any; ownerView?: boolean }) {
  const tpl = instance.template;
  const cfg = statusConfig[instance.status as ChecklistStatus];
  const StatusIcon =
    instance.status === 'rejected' || instance.status === 'escalated' ? AlertTriangle
      : instance.status === 'completed' || instance.status === 'verified' ? CircleCheck
      : Circle;
  const isLate = instance.status === 'late' || instance.status === 'escalated';
  const overdueText = isLate ? formatOverdue(instance.due_datetime) : null;
  const branchLabel = instance.resolved_branch?.name
    ?? instance.branch?.name
    ?? (ownerView ? 'Unassigned — Needs Review' : 'Unknown / Legacy');

  return (
    <div className="w-full flex flex-col gap-3 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3 min-w-0">
        <StatusIcon
          className={`h-5 w-5 shrink-0 mt-0.5 ${
            instance.status === 'rejected' || instance.status === 'escalated' ? 'text-destructive'
              : instance.status === 'late' ? 'text-warning'
              : 'text-muted-foreground'
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="mb-1.5">
            <TemplateCodeBadge code={tpl?.code} />
          </div>
          <p className="font-heading font-semibold text-base sm:text-lg text-foreground leading-snug break-words line-clamp-2">
            {tpl?.code ? (
              <>
                <span className="font-mono text-muted-foreground">{tpl.code}</span>
                <span className="text-muted-foreground"> · </span>
              </>
            ) : null}
            {tpl?.title ?? <span className="italic text-muted-foreground">Template deleted</span>}
          </p>
        </div>
        <Badge variant={cfg.variant} className={`${cfg.className} shrink-0`}>{cfg.label}</Badge>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm pl-8">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Branch:</dt>
          <dd className="font-medium truncate">{branchLabel}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Department:</dt>
          <dd className="font-medium capitalize">{instance.department}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Type:</dt>
          <dd className="font-medium capitalize">{instance.checklist_type}</dd>
        </div>
        {instance.due_datetime && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Due:</dt>
            <dd className="font-medium">{formatDueTime(instance.due_datetime)}</dd>
          </div>
        )}
        {instance.assignee?.full_name && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground flex items-center gap-1"><UserIcon className="h-3 w-3" />Assignee:</dt>
            <dd className="font-medium truncate">{instance.assignee.full_name}</dd>
          </div>
        )}
        {overdueText && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Overdue:</dt>
            <dd className="text-destructive font-semibold">{overdueText}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
        <CircleCheck className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-heading font-semibold text-foreground">All caught up</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function GroupedChecklists({
  items,
  storageKey,
  emptyText,
  ownerView,
}: {
  items: any[];
  storageKey: string;
  emptyText: string;
  ownerView?: boolean;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, any[]>>();
    for (const it of items) {
      const dept = it.department ?? 'unknown';
      const branchName = it.resolved_branch?.name
        ?? it.branch?.name
        ?? (ownerView ? 'Unassigned — Needs Review' : 'Unknown / Legacy');
      if (!map.has(dept)) map.set(dept, new Map());
      const bm = map.get(dept)!;
      if (!bm.has(branchName)) bm.set(branchName, []);
      bm.get(branchName)!.push(it);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dept, branches]) => ({
        dept,
        total: Array.from(branches.values()).reduce((s, arr) => s + arr.length, 0),
        branches: Array.from(branches.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([branch, list]) => ({ branch, list })),
      }));
  }, [items, ownerView]);

  // Open-by-default accordion state. Recomputes when groups change so newly
  // appearing departments/branches stay open. Session storage persists user
  // collapses within the session.
  const allDeptKeys = useMemo(() => grouped.map(g => g.dept), [grouped]);
  const allBranchKeys = useMemo(
    () => grouped.flatMap(g => g.branches.map(b => `${g.dept}::${b.branch}`)),
    [grouped],
  );

  const [deptOpen, setDeptOpen] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = sessionStorage.getItem(`${storageKey}:dept`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [branchOpen, setBranchOpen] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = sessionStorage.getItem(`${storageKey}:branch`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [touchedDept, setTouchedDept] = useState(false);
  const [touchedBranch, setTouchedBranch] = useState(false);

  const effectiveDeptOpen = touchedDept ? deptOpen : allDeptKeys;
  const effectiveBranchOpen = touchedBranch ? branchOpen : allBranchKeys;

  const persistDept = (v: string[]) => {
    setTouchedDept(true);
    setDeptOpen(v);
    try { sessionStorage.setItem(`${storageKey}:dept`, JSON.stringify(v)); } catch {}
  };
  const persistBranch = (v: string[]) => {
    setTouchedBranch(true);
    setBranchOpen(v);
    try { sessionStorage.setItem(`${storageKey}:branch`, JSON.stringify(v)); } catch {}
  };

  if (!items.length) return <EmptyState text={emptyText} />;

  return (
    <Accordion type="multiple" value={effectiveDeptOpen} onValueChange={persistDept} className="space-y-2">
      {grouped.map(({ dept, total, branches }) => (
        <AccordionItem
          key={dept}
          value={dept}
          className="border rounded-lg bg-card overflow-hidden"
        >
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-heading font-semibold capitalize text-foreground">{dept}</span>
              <Badge variant="secondary" className="ml-1">{total}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-0">
            <Accordion type="multiple" value={effectiveBranchOpen} onValueChange={persistBranch} className="space-y-1.5">
              {branches.map(({ branch, list }) => {
                const key = `${dept}::${branch}`;
                return (
                  <AccordionItem key={key} value={key} className="border rounded-md bg-background/50 overflow-hidden">
                    <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/40">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm font-medium text-foreground">{branch}</span>
                        <Badge variant="outline" className="ml-1">{list.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-2 pb-2 pt-0">
                      <div className="flex flex-col gap-1.5">
                        {list.map((it) => <ChecklistRow key={it.id} instance={it} ownerView={ownerView} />)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
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
        <div className="flex justify-end mb-3">
          <CleanupOrphanButton />
        </div>
        <GroupedChecklists
          items={allPending}
          storageKey="pending:owner:all"
          emptyText="No open checklists across all branches."
          ownerView
        />
      </div>
    );
  }

  // Manager
  return (
    <Tabs defaultValue="assigned" className="space-y-4">
      <TabsList>
        <TabsTrigger value="assigned">Assigned ({managerScope.length})</TabsTrigger>
        <TabsTrigger value="mine">Pending ({myAssigned.length})</TabsTrigger>
        <TabsTrigger value="late">Late ({lateItems.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="assigned" className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
        <GroupedChecklists items={managerScope} storageKey="pending:mgr:assigned" emptyText="No pending checklists in your scope." />
      </TabsContent>
      <TabsContent value="mine" className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
        <GroupedChecklists items={myAssigned} storageKey="pending:mgr:mine" emptyText="Nothing assigned to you right now." />
      </TabsContent>
      <TabsContent value="late" className="pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-6">
        <GroupedChecklists items={lateItems} storageKey="pending:mgr:late" emptyText="No late checklists in your scope." />
      </TabsContent>
    </Tabs>
  );
}
