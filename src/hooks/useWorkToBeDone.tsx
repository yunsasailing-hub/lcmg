import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { uploadToAppFilesBucket } from '@/lib/appFilesStorage';

export type WtbdRow = Database['public']['Tables']['maintenance_work_to_be_done']['Row'];
export type WtbdInsert = Database['public']['Tables']['maintenance_work_to_be_done']['Insert'];
export type WtbdUpdate = Database['public']['Tables']['maintenance_work_to_be_done']['Update'];
export type WtbdPriority = Database['public']['Enums']['wtbd_priority'];
export type WtbdStatus = Database['public']['Enums']['wtbd_status'];
export type WtbdTargetOccasion = Database['public']['Enums']['wtbd_target_occasion'];
export type WorkArea = Database['public']['Enums']['work_area'];

export const WORK_AREAS: WorkArea[] = [
  'Electrical',
  'Plumbing',
  'Construction / Finishing',
  'Carpentry / Metal Work',
  'Equipment / Machinery',
  'Cooling & Ventilation',
  'Cleaning / Pest Control',
  'IT / System',
  'General / Other',
];
export const DEFAULT_WORK_AREA: WorkArea = 'General / Other';

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
  updates_count?: number;
};

export type WtbdUpdateRow = {
  id: string;
  work_to_be_done_id: string;
  update_note: string;
  photo_url: string | null;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
};

export type EnrichedWtbdUpdate = WtbdUpdateRow & {
  author_username?: string | null;
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
      // Fetch update counts per job
      const ids = rows.map(r => r.id);
      const countMap = new Map<string, number>();
      if (ids.length) {
        const { data: updRows } = await (supabase as any)
          .from('maintenance_work_to_be_done_updates')
          .select('work_to_be_done_id')
          .in('work_to_be_done_id', ids);
        for (const u of (updRows ?? []) as { work_to_be_done_id: string }[]) {
          countMap.set(u.work_to_be_done_id, (countMap.get(u.work_to_be_done_id) ?? 0) + 1);
        }
      }
      return rows.map(r => ({
        ...r,
        branch_name: r.branch_id ? branchMap.get(r.branch_id) ?? null : null,
        assignee_username: r.assigned_to ? userMap.get(r.assigned_to) ?? null : null,
        creator_username: r.created_by ? userMap.get(r.created_by) ?? null : null,
        updates_count: countMap.get(r.id) ?? 0,
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

export function useWtbdUpdates(jobId: string | null | undefined) {
  return useQuery<EnrichedWtbdUpdate[]>({
    queryKey: ['wtbd-updates', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('maintenance_work_to_be_done_updates')
        .select('*')
        .eq('work_to_be_done_id', jobId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as WtbdUpdateRow[];
      const userIds = Array.from(new Set(rows.map(r => r.created_by).filter(Boolean) as string[]));
      let userMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, username, full_name')
          .in('user_id', userIds);
        userMap = new Map((profs ?? []).map((p: any) => [p.user_id, p.username || p.full_name || '']));
      }
      return rows.map(r => ({ ...r, author_username: r.created_by ? userMap.get(r.created_by) ?? null : null }));
    },
  });
}

export function useAddWtbdUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { jobId: string; note: string; photo?: File | null; userId: string }) => {
      let photo_url: string | null = null;
      let photo_path: string | null = null;
      if (input.photo) {
        const res = await uploadToAppFilesBucket(input.photo, 'maintenance', {
          category: 'work-to-be-done',
          assetOrEquipment: `${input.jobId}/updates`,
        });
        photo_url = res.publicUrl;
        photo_path = res.path;
      }
      const { data, error } = await (supabase as any)
        .from('maintenance_work_to_be_done_updates')
        .insert({
          work_to_be_done_id: input.jobId,
          update_note: input.note,
          photo_url,
          photo_path,
          created_by: input.userId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['wtbd-updates', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['wtbd-list'] });
    },
  });
}

/**
 * Look up an existing Repair / Intervention created from a given Work To Be Done job.
 * Returns null if none exists yet.
 */
export function useLinkedRepairForWtbd(jobId: string | null | undefined) {
  return useQuery<{ id: string } | null>({
    queryKey: ['wtbd-linked-repair', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('maintenance_repairs')
        .select('id')
        .eq('source_work_to_be_done_id', jobId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/**
 * Create a Repair / Intervention record from a completed Work To Be Done job.
 * Includes duplicate protection, photo carry-over, and progress-update summary.
 */
export function useCreateRepairFromWtbd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { job: EnrichedWtbd; userId: string | null }) => {
      const { job, userId } = input;

      // Duplicate protection
      const { data: existing } = await (supabase as any)
        .from('maintenance_repairs')
        .select('id')
        .eq('source_work_to_be_done_id', job.id)
        .maybeSingle();
      if (existing?.id) {
        return { repairId: existing.id as string, alreadyExisted: true };
      }

      // Pull progress updates for the description summary + photo references
      const { data: updateRows } = await (supabase as any)
        .from('maintenance_work_to_be_done_updates')
        .select('*')
        .eq('work_to_be_done_id', job.id)
        .order('created_at', { ascending: true });

      const updates = (updateRows ?? []) as WtbdUpdateRow[];
      const userIds = Array.from(new Set(updates.map(u => u.created_by).filter(Boolean) as string[]));
      let userMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, username, full_name')
          .in('user_id', userIds);
        userMap = new Map((profs ?? []).map((p: any) => [p.user_id, p.username || p.full_name || 'Unknown']));
      }

      const fmt = (iso: string) => {
        try {
          return new Date(iso).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
          });
        } catch { return iso; }
      };

      const parts: string[] = [];
      if (job.description) parts.push(`Original description:\n${job.description}`);
      if (job.notes) parts.push(`Notes:\n${job.notes}`);
      if (updates.length) {
        const lines = updates.map(u => {
          const who = u.created_by ? userMap.get(u.created_by) ?? 'Unknown' : 'Unknown';
          const photo = u.photo_url ? ` (photo: ${u.photo_url})` : '';
          return `- ${fmt(u.created_at)} ${who}: ${u.update_note}${photo}`;
        });
        parts.push(`Progress updates:\n${lines.join('\n')}`);
      }
      const issueDescription = parts.join('\n\n') || null;

      const photos = updates.map(u => u.photo_url).filter(Boolean) as string[];

      const completedAt = job.completed_at ?? new Date().toISOString();

      const { data: created, error } = await (supabase as any)
        .from('maintenance_repairs')
        .insert({
          asset_id: null,
          title: job.title,
          issue_description: issueDescription,
          status: 'Done',
          severity: 'Medium',
          reported_at: completedAt,
          completed_at: completedAt,
          assigned_to: job.assigned_to,
          reported_by: userId,
          updated_by: userId,
          photos,
          source: 'Work To Be Done',
          source_work_to_be_done_id: job.id,
          branch_id: job.branch_id,
          department: job.department,
          area_or_equipment: job.area_or_equipment,
          work_area: (job as any).work_area ?? 'General / Other',
        })
        .select('id')
        .single();
      if (error) throw error;
      return { repairId: created.id as string, alreadyExisted: false };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['wtbd-linked-repair', vars.job.id] });
      qc.invalidateQueries({ queryKey: ['maintenance_repairs'] });
    },
  });
}