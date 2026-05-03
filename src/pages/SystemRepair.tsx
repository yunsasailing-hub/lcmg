import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Wrench, Loader2, HelpCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCleanupOrphanPendingChecklists } from '@/hooks/useChecklists';
import AdminEmailChange from '@/components/system-repair/AdminEmailChange';

function RepairOrphanChecklists() {
  const cleanup = useCleanupOrphanPendingChecklists();
  const [openDetails, setOpenDetails] = useState(false);
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
      onError: (err: any) => toast.error(err?.message || 'Repair failed'),
    });
  };

  return (
    <div className="rounded-lg border bg-card px-4 py-4 sm:px-5 sm:py-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-heading font-semibold leading-tight">Repair Orphan Checklists</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Fix pending or broken checklist records.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={cleanup.isPending} className="shrink-0 w-full sm:w-auto">
              {cleanup.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Trash2 className="h-4 w-4 mr-2" />}
              Run Repair
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Run orphan checklist repair?</AlertDialogTitle>
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
                Run Repair
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Collapsible open={openDetails} onOpenChange={setOpenDetails} className="mt-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground/80 hover:text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
            Details
            <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${openDetails ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 text-xs text-muted-foreground/90">
          <p className="font-medium text-foreground mb-1">Use when:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>a pending checklist remains after assignment removal</li>
            <li>a checklist appears stuck or duplicated</li>
            <li>a deleted user leaves orphan checklist records</li>
            <li>recurring generation created invalid pending records</li>
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function SystemRepair() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isAdministrator = hasRole('administrator' as never);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[860px] px-2 sm:px-0">
        <PageHeader title="System Repair" description="Advanced tools for fixing data and system issues." />
        {isAdministrator ? (
          <div className="space-y-8">
            <section className="space-y-3">
              <div>
                <h2 className="font-heading text-base font-semibold">Repair Tools</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Safe repair utilities for fixing operational records.</p>
              </div>
              <RepairOrphanChecklists />
            </section>
            <section className="space-y-3">
              <div>
                <h2 className="font-heading text-base font-semibold">Administrator Tools</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Sensitive tools — use with caution.</p>
              </div>
              <Alert variant="destructive" className="py-2.5 px-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs leading-snug">
                  These tools modify system data or login identity. Use only when necessary.
                </AlertDescription>
              </Alert>
              <AdminEmailChange />
            </section>
          </div>
        ) : (
        <EmptyState icon={Wrench} title="Administrator access required" description="Only an Administrator can access System Repair tools." />
        )}
      </div>
    </AppShell>
  );
}
