import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface OverdueInstance {
  id: string;
  checklist_type: string;
  status: string;
  due_datetime: string | null;
  scheduled_date: string;
  assigned_to: string | null;
  branch_id: string | null;
  department: string;
  notice_sent_at: string | null;
  warning_sent_at: string | null;
}

function useOverdueChecklists() {
  const { user, hasRole } = useAuth();
  const isManagerOrOwner = hasRole('manager') || hasRole('owner');

  return useQuery({
    queryKey: ['dashboard', 'overdue-checklists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_instances')
        .select('id, checklist_type, status, due_datetime, scheduled_date, assigned_to, branch_id, department, notice_sent_at, warning_sent_at')
        .in('status', ['late', 'escalated'])
        .order('due_datetime', { ascending: true })
        .limit(20);
      if (error) throw error;

      // Fetch related profiles and branches
      const staffIds = [...new Set((data || []).map(d => d.assigned_to).filter(Boolean))] as string[];
      const branchIds = [...new Set((data || []).map(d => d.branch_id).filter(Boolean))] as string[];

      let profileMap: Record<string, string> = {};
      let branchMap: Record<string, string> = {};

      if (staffIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', staffIds);
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.full_name || 'Unknown']));
        }
      }

      if (branchIds.length > 0) {
        const { data: branches } = await supabase
          .from('branches')
          .select('id, name')
          .in('id', branchIds);
        if (branches) {
          branchMap = Object.fromEntries(branches.map(b => [b.id, b.name]));
        }
      }

      return {
        instances: (data || []) as OverdueInstance[],
        profileMap,
        branchMap,
      };
    },
    enabled: !!user && isManagerOrOwner,
    refetchInterval: 120_000,
  });
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  late: { color: 'bg-warning/15 text-warning-foreground border-warning/30', icon: Clock, label: 'Late' },
  escalated: { color: 'bg-destructive/15 text-destructive border-destructive/30', icon: ShieldAlert, label: 'Escalated' },
};

export default function OverdueChecklistsSummary() {
  const { hasRole } = useAuth();
  const isManagerOrOwner = hasRole('manager') || hasRole('owner');
  const { data, isLoading } = useOverdueChecklists();

  if (!isManagerOrOwner) return null;

  const instances = data?.instances || [];
  const lateCount = instances.filter(i => i.status === 'late').length;
  const escalatedCount = instances.filter(i => i.status === 'escalated').length;

  return (
    <div className="stat-card p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h3 className="text-sm font-heading font-semibold text-foreground">Overdue Checklists</h3>
        </div>
        <div className="flex items-center gap-2">
          {lateCount > 0 && (
            <Badge variant="outline" className="bg-warning/10 text-warning-foreground border-warning/30 text-[10px]">
              {lateCount} Late
            </Badge>
          )}
          {escalatedCount > 0 && (
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
              {escalatedCount} Escalated
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="px-5 pb-5">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : instances.length === 0 ? (
        <div className="px-5 pb-5 text-center py-4">
          <p className="text-sm text-muted-foreground">All checklists are up to date ✓</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[280px]">
          <div className="divide-y">
            {instances.map(instance => {
              const config = STATUS_CONFIG[instance.status] || STATUS_CONFIG.late;
              const StatusIcon = config.icon;
              const branchName = instance.branch_id ? (data?.branchMap[instance.branch_id] || '—') : '—';
              const staffName = instance.assigned_to ? (data?.profileMap[instance.assigned_to] || '—') : 'Unassigned';
              const typeLabel = instance.checklist_type.charAt(0).toUpperCase() + instance.checklist_type.slice(1);

              return (
                <div key={instance.id} className="px-5 py-3 flex items-start gap-3">
                  <StatusIcon className={cn('h-4 w-4 mt-0.5 shrink-0', instance.status === 'escalated' ? 'text-destructive' : 'text-warning-foreground')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {typeLabel} Checklist
                      </span>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', config.color)}>
                        {config.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{branchName}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{staffName}</span>
                    </div>
                    {instance.due_datetime && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Due: {format(new Date(instance.due_datetime), 'MMM d, h:mm a')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
