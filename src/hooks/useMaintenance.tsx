import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type MaintenanceAsset = Database['public']['Tables']['maintenance_assets']['Row'];
export type MaintenanceAssetInsert = Database['public']['Tables']['maintenance_assets']['Insert'];
export type MaintenanceAssetUpdate = Database['public']['Tables']['maintenance_assets']['Update'];
export type MaintenanceAssetType = Database['public']['Tables']['maintenance_asset_types']['Row'];
export type MaintenanceStatus = Database['public']['Enums']['maintenance_asset_status'];

const ASSETS_KEY = ['maintenance_assets'];
const TYPES_KEY = ['maintenance_asset_types'];

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

export function useMaintenanceAssets() {
  return useQuery({
    queryKey: ASSETS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_assets')
        .select('*, branch:branches(id, name), asset_type:maintenance_asset_types(id, code, name_en, name_vi)')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Array<MaintenanceAsset & {
        branch: { id: string; name: string } | null;
        asset_type: { id: string; code: string; name_en: string; name_vi: string | null } | null;
      }>;
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
        .select('*, branch:branches(id, name), asset_type:maintenance_asset_types(id, code, name_en, name_vi)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
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