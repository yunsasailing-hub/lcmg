import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type InventoryControlList = Database['public']['Tables']['inventory_control_lists']['Row'];
export type Department = Database['public']['Enums']['department'];

export interface EnrichedControlList extends InventoryControlList {
  branch_name?: string | null;
}

export type SavedControlList = InventoryControlList;

export function useInventoryControlLists(opts?: { activeOnly?: boolean; branchId?: string | null; department?: Department | null }) {
  const { activeOnly, branchId, department } = opts ?? {};
  return useQuery({
    queryKey: ['inventory_control_lists', { activeOnly, branchId, department }],
    queryFn: async (): Promise<EnrichedControlList[]> => {
      // RAW READ: no filters at the query level. Filtering is done client-side
      // by consumers so we can never hide rows by accident.
      const { data, error } = await supabase
        .from('inventory_control_lists')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        // eslint-disable-next-line no-console
        console.error('CONTROL LIST RAW ERROR:', error);
        throw error;
      }
      // eslint-disable-next-line no-console
      console.log('CONTROL LIST RAW:', (data ?? []).length, data);
      let rows = (data ?? []) as any[];
      if (activeOnly) rows = rows.filter(r => r.is_active === true || r.is_active === null);
      if (branchId) rows = rows.filter(r => r.branch_id === branchId);
      if (department) rows = rows.filter(r => r.department === department);
      return rows.map((r: any) => ({ ...r, branch_name: null }));
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
      let saved: SavedControlList;
      if (p.id) {
        const { data, error } = await supabase
          .from('inventory_control_lists')
          .update(payload)
          .eq('id', p.id)
          .select('*')
          .single();
        if (error) throw error;
        saved = data;
      } else {
        payload.created_by = user.id;
        const { data, error } = await supabase
          .from('inventory_control_lists')
          .insert(payload)
          .select('*')
          .single();
        if (error) throw error;
        saved = data;
      }
      const { data: verifyRows, error: verifyError } = await supabase
        .from('inventory_control_lists')
        .select('*')
        .order('created_at', { ascending: false });
      if (verifyError) {
        // eslint-disable-next-line no-console
        console.error('CONTROL LIST POST-SAVE RAW ERROR:', verifyError);
      } else {
        // eslint-disable-next-line no-console
        console.log('CONTROL LIST POST-SAVE RAW:', (verifyRows ?? []).length, verifyRows);
      }
      return saved;
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
