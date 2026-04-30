import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type MaintenanceRepair = Database['public']['Tables']['maintenance_repairs']['Row'];
export type MaintenanceRepairInsert = Database['public']['Tables']['maintenance_repairs']['Insert'];
export type MaintenanceRepairUpdate = Database['public']['Tables']['maintenance_repairs']['Update'];
export type MaintenanceRepairStatus = Database['public']['Enums']['maintenance_repair_status'];
export type MaintenanceRepairSeverity = Database['public']['Enums']['maintenance_repair_severity'];

export const REPAIR_STATUSES: MaintenanceRepairStatus[] = ['Reported', 'In Progress', 'Resolved', 'Cancelled'];
export const REPAIR_SEVERITIES: MaintenanceRepairSeverity[] = ['Low', 'Medium', 'High', 'Critical'];

export type EnrichedMaintenanceRepair = MaintenanceRepair & {
  asset_name: string | null;
  asset_code: string | null;
  asset_branch_id: string | null;
  asset_branch_name: string | null;
  asset_department: string | null;
  reported_by_name: string | null;
  assigned_to_name: string | null;
};

const KEY = ['maintenance_repairs'];

async function enrich(rows: MaintenanceRepair[]): Promise<EnrichedMaintenanceRepair[]> {
  if (!rows.length) return [];
  const assetIds = Array.from(new Set(rows.map(r => r.asset_id)));
  const profileIds = Array.from(new Set(
    [...rows.map(r => r.reported_by), ...rows.map(r => r.assigned_to)].filter(Boolean) as string[]
  ));

  const [{ data: assets }, profilesRes] = await Promise.all([
    supabase.from('maintenance_assets').select('id, name, code, branch_id, department').in('id', assetIds),
    profileIds.length
      ? supabase.from('profiles').select('user_id, full_name').in('user_id', profileIds)
      : Promise.resolve({ data: [] as { user_id: string; full_name: string | null }[] }),
  ]);

  const branchIds = Array.from(new Set((assets ?? []).map(a => a.branch_id).filter(Boolean)));
  const { data: branches } = branchIds.length
    ? await supabase.from('branches').select('id, name').in('id', branchIds)
    : { data: [] as { id: string; name: string }[] };

  const aMap = new Map((assets ?? []).map(a => [a.id, a]));
  const bMap = new Map((branches ?? []).map(b => [b.id, b.name]));
  const pMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p.full_name]));

  return rows.map(r => {
    const a = aMap.get(r.asset_id);
    return {
      ...r,
      asset_name: a?.name ?? null,
      asset_code: a?.code ?? null,
      asset_branch_id: a?.branch_id ?? null,
      asset_branch_name: a ? bMap.get(a.branch_id) ?? null : null,
      asset_department: a?.department ?? null,
      reported_by_name: r.reported_by ? pMap.get(r.reported_by) ?? null : null,
      assigned_to_name: r.assigned_to ? pMap.get(r.assigned_to) ?? null : null,
    };
  });
}

export function useMaintenanceRepairs(assetId?: string) {
  return useQuery({
    queryKey: assetId ? [...KEY, assetId] : KEY,
    queryFn: async () => {
      let q = supabase.from('maintenance_repairs').select('*').order('reported_at', { ascending: false });
      if (assetId) q = q.eq('asset_id', assetId);
      const { data, error } = await q;
      if (error) throw error;
      return enrich((data ?? []) as MaintenanceRepair[]);
    },
  });
}

export function useUpsertMaintenanceRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MaintenanceRepairInsert & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { data, error } = await supabase
          .from('maintenance_repairs')
          .update(rest as MaintenanceRepairUpdate)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('maintenance_repairs')
        .insert(rest as MaintenanceRepairInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteMaintenanceRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('maintenance_repairs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}