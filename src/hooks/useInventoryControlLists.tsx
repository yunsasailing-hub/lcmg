import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type InventoryControlList = Database['public']['Tables']['inventory_control_lists']['Row'];
export type Department = Database['public']['Enums']['department'];

export interface EnrichedControlList extends InventoryControlList {
  branch_name?: string | null;
}

export type SavedControlList = Pick<InventoryControlList,
  'id' | 'branch_id' | 'department' | 'control_list_code' | 'control_list_name' | 'is_active'
>;

export function useInventoryControlLists(opts?: { activeOnly?: boolean; branchId?: string | null; department?: Department | null }) {
  const { activeOnly, branchId, department } = opts ?? {};
  return useQuery({
    queryKey: ['inventory_control_lists', { activeOnly, branchId, department }],
    queryFn: async (): Promise<EnrichedControlList[]> => {
      let q = supabase
        .from('inventory_control_lists')
        .select('*, branches(name)')
        .order('control_list_code');
      if (activeOnly) q = q.eq('is_active', true);
      if (branchId) q = q.eq('branch_id', branchId);
      if (department) q = q.eq('department', department);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, branch_name: r.branches?.name ?? null }));
    },
  });
}

export interface UpsertControlListPayload {
  id?: string;
  branch_id: string;
  department: Department;
  control_list_code: string;
  control_list_name: string;
  notes?: string | null;
  is_active?: boolean;
}

export function useUpsertInventoryControlList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: UpsertControlListPayload): Promise<SavedControlList> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const payload: any = {
        branch_id: p.branch_id,
        department: p.department,
        control_list_code: p.control_list_code.trim(),
        control_list_name: p.control_list_name.trim(),
        notes: p.notes ?? null,
        is_active: p.is_active ?? true,
      };
      if (p.id) {
        const { data, error } = await supabase
          .from('inventory_control_lists')
          .update(payload)
          .eq('id', p.id)
          .select('id, branch_id, department, control_list_code, control_list_name, is_active')
          .single();
        if (error) throw error;
        return data;
      }
      payload.created_by = user.id;
      const { data, error } = await supabase
        .from('inventory_control_lists')
        .insert(payload)
        .select('id, branch_id, department, control_list_code, control_list_name, is_active')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['inventory_control_lists'] });
      await qc.refetchQueries({ queryKey: ['inventory_control_lists'], type: 'active' });
    },
  });
}

export function useDeleteInventoryControlList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_control_lists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory_control_lists'] });
      qc.invalidateQueries({ queryKey: ['inventory_control_items'] });
    },
  });
}
