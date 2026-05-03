import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type MaintenanceScheduleTemplate =
  Database['public']['Tables']['maintenance_schedule_templates']['Row'];
export type MaintenanceScheduleTemplateInsert =
  Database['public']['Tables']['maintenance_schedule_templates']['Insert'];
export type MaintenanceScheduleTemplateUpdate =
  Database['public']['Tables']['maintenance_schedule_templates']['Update'];
export type MaintenanceScheduleFrequency =
  Database['public']['Enums']['maintenance_schedule_frequency'];
export type MaintenanceScheduleStatus =
  Database['public']['Enums']['maintenance_schedule_status'];

const KEY = ['maintenance_schedule_templates'];

export type EnrichedScheduleTemplate = MaintenanceScheduleTemplate & {
  asset_name: string | null;
  asset_code: string | null;
  asset_branch_id: string | null;
  asset_branch_name: string | null;
  assigned_staff_name: string | null;
};

async function enrich(rows: MaintenanceScheduleTemplate[]): Promise<EnrichedScheduleTemplate[]> {
  if (!rows.length) return [];
  const assetIds = Array.from(new Set(rows.map(r => r.asset_id).filter(Boolean)));
  const staffIds = Array.from(new Set(rows.map(r => r.assigned_staff_id).filter(Boolean) as string[]));

  const [{ data: assets }, { data: staff }] = await Promise.all([
    supabase
      .from('maintenance_assets')
      .select('id, name, code, branch_id')
      .in('id', assetIds.length ? assetIds : ['00000000-0000-0000-0000-000000000000']),
    staffIds.length
      ? supabase.from('profiles').select('user_id, username').in('user_id', staffIds)
      : Promise.resolve({ data: [] as { user_id: string; username: string | null }[] }),
  ]);

  const branchIds = Array.from(new Set((assets ?? []).map(a => a.branch_id).filter(Boolean)));
  const { data: branches } = branchIds.length
    ? await supabase.from('branches').select('id, name').in('id', branchIds)
    : { data: [] as { id: string; name: string }[] };

  const aMap = new Map((assets ?? []).map(a => [a.id, a]));
  const bMap = new Map((branches ?? []).map(b => [b.id, b.name]));
  const sMap = new Map(
    (staff ?? []).map(s => [s.user_id, s.username ? `@${s.username}` : '⚠️ no username'] as const),
  );

  return rows.map(r => {
    const a = aMap.get(r.asset_id);
    return {
      ...r,
      asset_name: a?.name ?? null,
      asset_code: a?.code ?? null,
      asset_branch_id: a?.branch_id ?? null,
      asset_branch_name: a ? bMap.get(a.branch_id) ?? null : null,
      assigned_staff_name: r.assigned_staff_id ? sMap.get(r.assigned_staff_id) ?? null : null,
    };
  });
}

export function useMaintenanceSchedules() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_schedule_templates')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return enrich((data ?? []) as MaintenanceScheduleTemplate[]);
    },
  });
}

export function useUpsertMaintenanceSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MaintenanceScheduleTemplateInsert & { id?: string }) => {
      const { id, ...rest } = payload;
      const cleaned: any = { ...rest };
      if (cleaned.frequency !== 'custom_interval') cleaned.custom_interval_days = null;

      if (id) {
        const { data, error } = await supabase
          .from('maintenance_schedule_templates')
          .update(cleaned as MaintenanceScheduleTemplateUpdate)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('maintenance_schedule_templates')
        .insert(cleaned as MaintenanceScheduleTemplateInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useArchiveMaintenanceSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { data, error } = await supabase
        .from('maintenance_schedule_templates')
        .update({ status: archive ? 'archived' : 'active' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useStaffProfiles() {
  return useQuery({
    queryKey: ['profiles', 'staff_for_assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, department, branch_id, is_active')
        .eq('is_active', true)
        .order('username');
      if (error) throw error;
      return (data ?? []) as Array<{
        user_id: string;
        username: string | null;
        full_name: string | null;
        department: string | null;
        branch_id: string | null;
        is_active: boolean;
      }>;
    },
  });
}
