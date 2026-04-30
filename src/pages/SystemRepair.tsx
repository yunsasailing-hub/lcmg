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
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCleanupOrphanPendingChecklists } from '@/hooks/useChecklists';

function RepairOrphanChecklists() {
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
      onError: (err: any) => toast.error(err?.message || 'Repair failed'),
    });
  };

  return (
    <div className="rounded-lg border bg-card p-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={cleanup.isPending}>
              {cleanup.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Trash2 className="h-4 w-4 mr-2" />}
              Repair Orphan Checklists
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

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="About this tool">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="text-sm max-w-xs">
            This tool scans and repairs orphan or inconsistent pending checklist records.
            Use only when records appear incorrect.
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-3 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Use when:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>a pending checklist remains after assignment removal</li>
          <li>a checklist appears stuck or duplicated</li>
          <li>a deleted user leaves orphan checklist records</li>
          <li>recurring generation created invalid pending records</li>
        </ul>
        <p className="italic mt-2">Normally not needed for daily use.</p>
      </div>
    </div>
  );
}

export default function SystemRepair() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');

  return (
    <AppShell>
      <PageHeader title={t('pages.systemRepair.title')} description={t('pages.systemRepair.subtitle')} />
      {isOwner ? (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">Repair Tools</h2>
          <RepairOrphanChecklists />
        </section>
      ) : (
        <EmptyState icon={Wrench} title={t('pages.systemRepair.emptyTitle')} description={t('pages.systemRepair.emptyDesc')} />
      )}
    </AppShell>
  );
}
