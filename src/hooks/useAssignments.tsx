import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type AssignmentPeriodicity = Database['public']['Enums']['assignment_periodicity'];
export type AssignmentStatus = Database['public']['Enums']['assignment_status'];

export interface AssignmentWithProfile {
  id: string;
  template_id: string | null;
  assigned_to: string;
  periodicity: AssignmentPeriodicity;
  start_date: string;
  end_date: string | null;
  status: AssignmentStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  last_generated_date: string | null;
  branch_id: string | null;
  assignee?: { full_name: string | null; avatar_url: string | null; department: string | null; position: string | null } | null;
}

export function useAssignmentsByTemplate(templateId: string | undefined) {
  return useQuery<AssignmentWithProfile[]>({
    queryKey: ['assignments', 'by-template', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_assignments')
        .select('*')
        .eq('template_id', templateId!)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data || []).map(a => a.assigned_to))];
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null; department: string | null; position: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url, department, position')
          .in('user_id', userIds);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url, department: p.department as string | null, position: p.position }]));
        }
      }

      return (data || []).map(a => ({
        ...a,
        assignee: profilesMap[a.assigned_to] || null,
      }));
    },
    enabled: !!templateId,
  });
}

export function useAssignmentCountByTemplate() {
  return useQuery<Record<string, number>>({
    queryKey: ['assignments', 'counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_assignments')
        .select('template_id, status')
        .in('status', ['active', 'paused']);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        if (row.template_id) {
          counts[row.template_id] = (counts[row.template_id] || 0) + 1;
        }
      }
      return counts;
    },
  });
}

export function useUpdateAssignmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AssignmentStatus }) => {
      const { error } = await supabase
        .from('checklist_assignments')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('checklist_assignments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: {
      id: string;
      updates: {
        assigned_to?: string;
        periodicity?: AssignmentPeriodicity;
        start_date?: string;
        end_date?: string | null;
        notes?: string | null;
      };
    }) => {
      const { error } = await supabase
        .from('checklist_assignments')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}
