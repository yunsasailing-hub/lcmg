import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type MaintenanceAsset = Database['public']['Tables']['maintenance_assets']['Row'];
export type MaintenanceAssetInsert = Database['public']['Tables']['maintenance_assets']['Insert'];
export type MaintenanceAssetUpdate = Database['public']['Tables']['maintenance_assets']['Update'];
export type MaintenanceAssetType = Database['public']['Tables']['maintenance_asset_types']['Row'];
export type MaintenanceAssetTypeInsert = Database['public']['Tables']['maintenance_asset_types']['Insert'];
export type MaintenanceAssetTypeUpdate = Database['public']['Tables']['maintenance_asset_types']['Update'];
export type MaintenanceStatus = Database['public']['Enums']['maintenance_asset_status'];

const ASSETS_KEY = ['maintenance_assets'];
const TYPES_KEY = ['maintenance_asset_types'];
const TYPES_ALL_KEY = ['maintenance_asset_types', 'all'];

export function useMaintenanceAssetTypes() {
  return useQuery({
    queryKey: TYPES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_asset_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('name_en');
      if (error) throw error;
      return data as MaintenanceAssetType[];
    },
  });
}

export function useMaintenanceAssetTypesAll() {
  return useQuery({
    queryKey: TYPES_ALL_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_asset_types')
        .select('*')
        .order('sort_order')
        .order('name_en');
      if (error) throw error;
      return data as MaintenanceAssetType[];
    },
  });
}

export function useUpsertMaintenanceAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MaintenanceAssetTypeInsert & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { data, error } = await supabase
          .from('maintenance_asset_types')
          .update(rest as MaintenanceAssetTypeUpdate)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('maintenance_asset_types')
        .insert(rest as MaintenanceAssetTypeInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TYPES_KEY });
      qc.invalidateQueries({ queryKey: TYPES_ALL_KEY });
    },
  });
}

export function useToggleMaintenanceAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('maintenance_asset_types')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TYPES_KEY });
      qc.invalidateQueries({ queryKey: TYPES_ALL_KEY });
    },
  });
}

export function useMaintenanceAssetTypeUsage() {
  return useQuery({
    queryKey: ['maintenance_asset_type_usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_assets')
        .select('asset_type_id');
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        if (r.asset_type_id) map.set(r.asset_type_id, (map.get(r.asset_type_id) ?? 0) + 1);
      });
      return map;
    },
  });
}

export type EnrichedMaintenanceAsset = MaintenanceAsset & {
  branch_name: string | null;
  type_name_en: string | null;
  type_code: string | null;
};

async function enrich(rows: MaintenanceAsset[]): Promise<EnrichedMaintenanceAsset[]> {
  if (!rows.length) return [];
  const branchIds = Array.from(new Set(rows.map(r => r.branch_id).filter(Boolean)));
  const typeIds = Array.from(new Set(rows.map(r => r.asset_type_id).filter(Boolean)));
  const [{ data: branches }, { data: types }] = await Promise.all([
    supabase.from('branches').select('id, name').in('id', branchIds.length ? branchIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('maintenance_asset_types').select('id, code, name_en').in('id', typeIds.length ? typeIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  const bMap = new Map((branches ?? []).map(b => [b.id, b.name]));
  const tMap = new Map((types ?? []).map(t => [t.id, t]));
  return rows.map(r => ({
    ...r,
    branch_name: bMap.get(r.branch_id) ?? null,
    type_name_en: tMap.get(r.asset_type_id)?.name_en ?? null,
    type_code: tMap.get(r.asset_type_id)?.code ?? null,
  }));
}

export function useMaintenanceAssets() {
  return useQuery({
    queryKey: ASSETS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_assets')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return enrich(data as MaintenanceAsset[]);
    },
  });
}

export function useMaintenanceAsset(id: string | undefined) {
  return useQuery({
    queryKey: ['maintenance_asset', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_assets')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [enriched] = await enrich([data as MaintenanceAsset]);
      return enriched;
    },
  });
}

export function useUpsertMaintenanceAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MaintenanceAssetInsert & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { data, error } = await supabase
          .from('maintenance_assets')
          .update(rest as MaintenanceAssetUpdate)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('maintenance_assets')
        .insert(rest as MaintenanceAssetInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
      qc.invalidateQueries({ queryKey: ['maintenance_asset'] });
    },
  });
}

export function useArchiveMaintenanceAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { data, error } = await supabase
        .from('maintenance_assets')
        .update({
          status: archive ? 'archived' : 'active',
          archived_at: archive ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
      qc.invalidateQueries({ queryKey: ['maintenance_asset'] });
    },
  });
}

export function useBranchesAll() {
  return useQuery({
    queryKey: ['branches_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });
}