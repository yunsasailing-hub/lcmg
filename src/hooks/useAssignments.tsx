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
  assignee?: { username: string | null; full_name: string | null; avatar_url: string | null; department: string | null; position: string | null } | null;
  warning_recipient_user_ids: string[];
  effective_warning_recipients?: { user_id: string; username: string | null; full_name: string | null }[];
  warning_recipients_source?: 'assignment' | 'template' | 'fallback' | 'none';
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

      // Fetch template-level warning recipients as fallback
      let templateWarningIds: string[] = [];
      if (templateId) {
        const { data: tpl } = await supabase
          .from('checklist_templates')
          .select('warning_recipient_user_ids')
          .eq('id', templateId)
          .maybeSingle();
        templateWarningIds = (tpl?.warning_recipient_user_ids as string[] | null) || [];
      }

      // Collect all user IDs we need to resolve: assignees + all warning recipient IDs
      const allUserIds = new Set<string>();
      for (const a of data || []) {
        if (a.assigned_to) allUserIds.add(a.assigned_to);
        for (const id of (a.warning_recipient_user_ids as string[] | null) || []) allUserIds.add(id);
      }
      for (const id of templateWarningIds) allUserIds.add(id);

      const userIds = [...allUserIds];
      let profilesMap: Record<string, { username: string | null; full_name: string | null; avatar_url: string | null; department: string | null; position: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url, department, position')
          .in('user_id', userIds);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.user_id, { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, department: p.department as string | null, position: p.position }]));
        }
      }

      return (data || []).map(a => {
        const assignmentIds = (a.warning_recipient_user_ids as string[] | null) || [];
        let effectiveIds: string[] = [];
        let source: 'assignment' | 'template' | 'fallback' | 'none' = 'none';
        if (assignmentIds.length > 0) {
          effectiveIds = assignmentIds;
          source = 'assignment';
        } else if (templateWarningIds.length > 0) {
          effectiveIds = templateWarningIds;
          source = 'template';
        }
        const effective_warning_recipients = effectiveIds.map(uid => ({
          user_id: uid,
          username: profilesMap[uid]?.username ?? null,
          full_name: profilesMap[uid]?.full_name ?? null,
        }));
        return {
          ...a,
          assignee: profilesMap[a.assigned_to] || null,
          warning_recipient_user_ids: assignmentIds,
          effective_warning_recipients,
          warning_recipients_source: source,
        };
      });
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
        .eq('status', 'active');
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
      // The DB trigger removes pending instances + their notifications when
      // an assignment is deleted, so refresh those caches too.
      qc.invalidateQueries({ queryKey: ['checklists'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
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
