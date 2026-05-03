// Manual items are temporary.
// Future versions will restrict all items to coded ingredients only.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type InventoryControlItem = Database['public']['Tables']['inventory_control_items']['Row'];
export type InventoryControlSource = Database['public']['Enums']['inventory_control_source'];

export interface EnrichedControlItem extends InventoryControlItem {
  branch_name?: string | null;
}

export function useInventoryControlItems(opts?: {
  activeOnly?: boolean;
  branchId?: string | null;
  department?: string | null;
  controlListId?: string | null;
}) {
  const { activeOnly, branchId, department, controlListId } = opts ?? {};
  return useQuery({
    queryKey: ['inventory_control_items', { activeOnly, branchId, department, controlListId }],
    queryFn: async (): Promise<EnrichedControlItem[]> => {
      if (opts && 'controlListId' in opts && !controlListId && !branchId && !department) return [];
      let q = supabase
        .from('inventory_control_items')
        .select('*, branches(name)')
        .order('item_code', { ascending: true, nullsFirst: false })
        .order('item_name', { ascending: true });
      if (activeOnly) q = q.eq('is_active', true);
      if (controlListId) q = q.eq('control_list_id', controlListId);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []).map((r: any) => ({
        ...r,
        branch_name: r.branches?.name ?? null,
      })) as EnrichedControlItem[];
      // Branch/department: items with NULL apply globally; items with values must match.
      if (branchId) rows = rows.filter(r => !r.branch_id || r.branch_id === branchId);
      if (department) rows = rows.filter(r => !r.department || r.department === department);
      return rows;
    },
  });
}

export interface UpsertControlItemPayload {
  id?: string;
  ingredient_id?: string | null;
  item_code?: string | null;
  item_name: string;
  unit?: string | null;
  source_type: InventoryControlSource;
  is_active?: boolean;
  branch_id?: string | null;
  department?: string | null;
  remarks?: string | null;
  min_stock?: number | null;
  recommended_order?: number | null;
  control_list_id?: string | null;
}

export function useUpsertInventoryControlItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: UpsertControlItemPayload) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const payload: any = {
        ingredient_id: p.ingredient_id ?? null,
        item_code: p.item_code ?? null,
        item_name: p.item_name,
        unit: p.unit ?? null,
        source_type: p.source_type,
        is_active: p.is_active ?? true,
        branch_id: p.branch_id ?? null,
        department: p.department ?? null,
        remarks: p.remarks ?? null,
        min_stock: p.min_stock ?? null,
        recommended_order: p.recommended_order ?? null,
        control_list_id: p.control_list_id ?? null,
      };
      if (p.id) {
        const { error } = await supabase
          .from('inventory_control_items')
          .update(payload).eq('id', p.id);
        if (error) throw error;
      } else {
        payload.created_by = user.id;
        const { error } = await supabase
          .from('inventory_control_items')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_control_items'] }),
  });
}

export function useToggleInventoryControlItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('inventory_control_items')
        .update({ is_active: p.is_active })
        .eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_control_items'] }),
  });
}

export function useDeleteInventoryControlItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_control_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_control_items'] }),
  });
}