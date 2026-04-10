import { useState } from 'react';
import { format } from 'date-fns';
import { Pause, Play, Square, Trash2, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  useAssignmentsByTemplate,
  useUpdateAssignmentStatus,
  useDeleteAssignment,
  type AssignmentWithProfile,
} from '@/hooks/useAssignments';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ended: 'bg-muted text-muted-foreground',
};

function AssignmentRow({ assignment }: { assignment: AssignmentWithProfile }) {
  const updateStatus = useUpdateAssignmentStatus();
  const deleteAssignment = useDeleteAssignment();

  const name = assignment.assignee?.full_name || 'Unknown User';
  const dept = assignment.assignee?.department;
  const isActive = assignment.status === 'active';
  const isPaused = assignment.status === 'paused';
  const isEnded = assignment.status === 'ended';

  const handlePause = () => {
    updateStatus.mutate({ id: assignment.id, status: 'paused' }, {
      onSuccess: () => toast.success('Assignment paused'),
      onError: () => toast.error('Failed to pause assignment'),
    });
  };

  const handleResume = () => {
    updateStatus.mutate({ id: assignment.id, status: 'active' }, {
      onSuccess: () => toast.success('Assignment resumed'),
      onError: () => toast.error('Failed to resume assignment'),
    });
  };

  const handleEnd = () => {
    updateStatus.mutate({ id: assignment.id, status: 'ended' }, {
      onSuccess: () => toast.success('Assignment ended'),
      onError: () => toast.error('Failed to end assignment'),
    });
  };

  const handleRemove = () => {
    deleteAssignment.mutate(assignment.id, {
      onSuccess: () => toast.success('Assignment removed'),
      onError: () => toast.error('Failed to remove assignment'),
    });
  };

  const busy = updateStatus.isPending || deleteAssignment.isPending;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{name}</p>
          {dept && <p className="text-xs text-muted-foreground capitalize">{dept}</p>}
        </div>
        <Badge className={`text-[10px] px-1.5 capitalize shrink-0 ${statusColors[assignment.status] || ''}`}>
          {assignment.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        <span>Periodicity</span>
        <span className="capitalize text-foreground">{assignment.periodicity}</span>
        <span>Start</span>
        <span className="text-foreground">{format(new Date(assignment.start_date), 'PP')}</span>
        {assignment.end_date && (
          <>
            <span>End</span>
            <span className="text-foreground">{format(new Date(assignment.end_date), 'PP')}</span>
          </>
        )}
        <span>Created</span>
        <span className="text-foreground">{format(new Date(assignment.created_at), 'PP')}</span>
        {assignment.last_generated_date && (
          <>
            <span>Last generated</span>
            <span className="text-foreground">{format(new Date(assignment.last_generated_date), 'PP')}</span>
          </>
        )}
      </div>

      {assignment.notes && (
        <p className="text-xs text-muted-foreground italic border-t pt-1">{assignment.notes}</p>
      )}

      {!isEnded && (
        <div className="flex items-center gap-1.5 pt-1 border-t">
          {isActive && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handlePause} disabled={busy}>
              <Pause className="h-3 w-3 mr-1" /> Pause
            </Button>
          )}
          {isPaused && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleResume} disabled={busy}>
              <Play className="h-3 w-3 mr-1" /> Resume
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleEnd} disabled={busy}>
            <Square className="h-3 w-3 mr-1" /> End
          </Button>
          <div className="flex-1" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busy}>
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this assignment?</AlertDialogTitle>
                <AlertDialogDescription>
                  Remove this assignment only? The template and past submitted checklists will remain unchanged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Remove Assignment
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {isEnded && (
        <div className="flex items-center gap-1.5 pt-1 border-t">
          <div className="flex-1" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busy}>
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this assignment?</AlertDialogTitle>
                <AlertDialogDescription>
                  Remove this assignment only? The template and past submitted checklists will remain unchanged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Remove Assignment
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

interface AssignmentManagerProps {
  templateId: string;
  templateTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AssignmentManager({ templateId, templateTitle, open, onOpenChange }: AssignmentManagerProps) {
  const { data: assignments, isLoading } = useAssignmentsByTemplate(open ? templateId : undefined);

  const activeCount = assignments?.filter(a => a.status === 'active').length || 0;
  const pausedCount = assignments?.filter(a => a.status === 'paused').length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assignments – {templateTitle}</DialogTitle>
          <DialogDescription>
            {activeCount} active{pausedCount > 0 ? `, ${pausedCount} paused` : ''} assignment{(activeCount + pausedCount) !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !assignments?.length ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Users className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No assignments for this template.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map(a => (
              <AssignmentRow key={a.id} assignment={a} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
