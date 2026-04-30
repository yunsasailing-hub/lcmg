import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type InventoryRequest = Database['public']['Tables']['inventory_requests']['Row'];
export type InventoryRequestItem = Database['public']['Tables']['inventory_request_items']['Row'];
export type InventoryRequestStatus = Database['public']['Enums']['inventory_request_status'];
export type Department = Database['public']['Enums']['department'];

export interface InventoryRequestWithItems extends InventoryRequest {
  items: InventoryRequestItem[];
  branch_name?: string | null;
}

export function useInventoryRequests() {
  return useQuery({
    queryKey: ['inventory_requests'],
    queryFn: async (): Promise<InventoryRequestWithItems[]> => {
      const { data: reqs, error } = await supabase
        .from('inventory_requests')
        .select('*, branches(name), inventory_request_items(*, inventory_control_items(remarks, min_stock, recommended_order))')
        .order('request_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (reqs ?? []).map((r: any) => ({
        ...r,
        branch_name: r.branches?.name ?? null,
        items: (r.inventory_request_items ?? []).sort(
          (a: InventoryRequestItem, b: InventoryRequestItem) => a.sort_order - b.sort_order,
        ),
      }));
    },
  });
}

export interface UpsertRequestPayload {
  id?: string;
  request_date: string;
  branch_id: string | null;
  department: Department;
  status: InventoryRequestStatus;
  staff_user_id?: string | null;
  staff_name?: string | null;
  notes?: string | null;
  items: Array<{
    id?: string;
    ingredient_id?: string | null;
    inventory_control_item_id?: string | null;
    source_type?: 'ingredient' | 'manual';
    item_code?: string | null;
    item_name: string;
    unit?: string | null;
    actual_stock?: number | null;
    requested_qty?: number | null;
    approved_qty?: number | null;
    note?: string | null;
    sort_order: number;
  }>;
}

export function useUpsertInventoryRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: UpsertRequestPayload) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let requestId = p.id;
      const submitted_at = p.status === 'Submitted' ? new Date().toISOString() : null;

      if (requestId) {
        const updatePayload: any = {
          request_date: p.request_date,
          branch_id: p.branch_id,
          department: p.department,
          status: p.status,
          staff_user_id: p.staff_user_id ?? null,
          staff_name: p.staff_name ?? null,
          notes: p.notes ?? null,
        };
        if (submitted_at) updatePayload.submitted_at = submitted_at;
        const { error } = await supabase
          .from('inventory_requests')
          .update(updatePayload)
          .eq('id', requestId);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from('inventory_requests')
          .insert({
            request_date: p.request_date,
            branch_id: p.branch_id,
            department: p.department,
            status: p.status,
            staff_user_id: p.staff_user_id ?? user.id,
            staff_name: p.staff_name ?? null,
            notes: p.notes ?? null,
            created_by: user.id,
            submitted_at,
          })
          .select('id')
          .single();
        if (error) throw error;
        requestId = created!.id;
      }

      // Replace items: delete existing, insert provided
      const { error: delErr } = await supabase
        .from('inventory_request_items')
        .delete()
        .eq('request_id', requestId!);
      if (delErr) throw delErr;

      if (p.items.length) {
        const rows = p.items.map((it, i) => ({
          request_id: requestId!,
          ingredient_id: it.ingredient_id ?? null,
          inventory_control_item_id: it.inventory_control_item_id ?? null,
          source_type: it.source_type ?? 'ingredient',
          item_code: it.item_code ?? null,
          item_name: it.item_name,
          unit: it.unit ?? null,
          actual_stock: it.actual_stock ?? null,
          requested_qty: it.requested_qty ?? null,
          approved_qty: it.approved_qty ?? null,
          note: it.note ?? null,
          sort_order: it.sort_order ?? i,
        }));
        const { error: insErr } = await supabase
          .from('inventory_request_items')
          .insert(rows);
        if (insErr) throw insErr;
      }

      return requestId!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_requests'] }),
  });
}

export function useReviewInventoryRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id: string;
      status: 'Owner Confirmed' | 'Rejected';
      rejection_note?: string | null;
      approved_items?: Array<{ id: string; approved_qty: number | null }>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (p.approved_items?.length) {
        for (const it of p.approved_items) {
          const { error } = await supabase
            .from('inventory_request_items')
            .update({ approved_qty: it.approved_qty })
            .eq('id', it.id);
          if (error) throw error;
        }
      }

      const { error } = await supabase
        .from('inventory_requests')
        .update({
          status: p.status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          rejection_note: p.status === 'Rejected' ? (p.rejection_note ?? null) : null,
        })
        .eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_requests'] }),
  });
}

export function useDeleteInventoryRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_requests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_requests'] }),
  });
}

// Lightweight ingredient picker (id, code, name_en, base_unit)
export interface IngredientLite {
  id: string;
  code: string | null;
  name_en: string;
  unit_label: string | null;
}

export function useIngredientPicker() {
  return useQuery({
    queryKey: ['inventory_ingredient_picker'],
    queryFn: async (): Promise<IngredientLite[]> => {
      const { data, error } = await supabase
        .from('ingredients')
        .select('id, code, name_en, base_unit_id')
        .eq('is_active', true)
        .order('name_en');
      if (error) throw error;
      // Try to fetch unit labels (best-effort)
      const unitIds = Array.from(new Set((data ?? [])
        .map((d: any) => d.base_unit_id).filter(Boolean)));
      let unitMap = new Map<string, string>();
      if (unitIds.length) {
        try {
          const { data: units } = await supabase
            .from('recipe_units')
            .select('id, code, name_en')
            .in('id', unitIds as string[]);
          (units ?? []).forEach((u: any) => unitMap.set(u.id, u.code || u.name_en || ''));
        } catch { /* ignore */ }
      }
      return (data ?? []).map((d: any) => ({
        id: d.id,
        code: d.code,
        name_en: d.name_en,
        unit_label: d.base_unit_id ? (unitMap.get(d.base_unit_id) || null) : null,
      }));
    },
  });
}