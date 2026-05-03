import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type WtbdRow = Database['public']['Tables']['maintenance_work_to_be_done']['Row'];
export type WtbdInsert = Database['public']['Tables']['maintenance_work_to_be_done']['Insert'];
export type WtbdUpdate = Database['public']['Tables']['maintenance_work_to_be_done']['Update'];
export type WtbdPriority = Database['public']['Enums']['wtbd_priority'];
export type WtbdStatus = Database['public']['Enums']['wtbd_status'];
export type WtbdTargetOccasion = Database['public']['Enums']['wtbd_target_occasion'];

export const WTBD_PRIORITIES: WtbdPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
export const WTBD_STATUSES: WtbdStatus[] = ['Open', 'Postponed', 'In Progress', 'Completed', 'Cancelled'];
export const WTBD_ACTIVE_STATUSES: WtbdStatus[] = ['Open', 'Postponed', 'In Progress'];
export const WTBD_OCCASIONS: WtbdTargetOccasion[] = [
  'Next technician visit',
  'Next quiet day',
  'Next renovation',
  'Before inspection',
  'Waiting for spare parts',
  'Waiting for supplier',
  'No fixed date',
  'Other',
];

export type EnrichedWtbd = WtbdRow & {
  branch_name?: string | null;
  assignee_username?: string | null;
  creator_username?: string | null;
};

export function useWorkToBeDoneList() {
  return useQuery<EnrichedWtbd[]>({
    queryKey: ['wtbd-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_work_to_be_done')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as WtbdRow[];
      const branchIds = Array.from(new Set(rows.map(r => r.branch_id).filter(Boolean) as string[]));
      const userIds = Array.from(new Set(
        rows.flatMap(r => [r.assigned_to, r.created_by]).filter(Boolean) as string[],
      ));
      const [branchesRes, profilesRes] = await Promise.all([
        branchIds.length
          ? supabase.from('branches').select('id, name').in('id', branchIds)
          : Promise.resolve({ data: [], error: null } as any),
        userIds.length
          ? supabase.from('profiles').select('user_id, username').in('user_id', userIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      const branchMap = new Map<string, string>((branchesRes.data ?? []).map((b: any) => [b.id, b.name]));
      const userMap = new Map<string, string>((profilesRes.data ?? []).map((p: any) => [p.user_id, p.username]));
      return rows.map(r => ({
        ...r,
        branch_name: r.branch_id ? branchMap.get(r.branch_id) ?? null : null,
        assignee_username: r.assigned_to ? userMap.get(r.assigned_to) ?? null : null,
        creator_username: r.created_by ? userMap.get(r.created_by) ?? null : null,
      }));
    },
  });
}

export function useUpsertWtbd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WtbdInsert & { id?: string }) => {
      const { id, ...rest } = payload as any;
      if (id) {
        const { data, error } = await supabase
          .from('maintenance_work_to_be_done')
          .update(rest)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('maintenance_work_to_be_done')
        .insert(rest)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wtbd-list'] }),
  });
}

export function useDeleteWtbd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('maintenance_work_to_be_done').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wtbd-list'] }),
  });
}