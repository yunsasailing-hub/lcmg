import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type MaintenanceTask = Database['public']['Tables']['maintenance_tasks']['Row'];
export type MaintenanceTaskStatus = Database['public']['Enums']['maintenance_task_status'];
export type MaintenanceFrequency = Database['public']['Enums']['maintenance_schedule_frequency'];

const KEY = ['maintenance_tasks'];

export type EnrichedMaintenanceTask = MaintenanceTask & {
  asset_name: string | null;
  asset_code: string | null;
  asset_branch_id: string | null;
  asset_branch_name: string | null;
  asset_department: string | null;
  assigned_staff_name: string | null;
  note_required: boolean;
  photo_required: boolean;
};

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = 24 * 60 * 60 * 1000;
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / ms);
}

/**
 * Decide whether a schedule should produce a task for `today`.
 * Anchor for periodic frequencies is the template's created_at date.
 */
function isDueToday(
  frequency: MaintenanceFrequency,
  customDays: number | null,
  anchor: Date,
  today: Date,
): boolean {
  if (today < anchor) {
    // Same-day creation still counts as due today.
    if (daysBetween(today, anchor) !== 0) return false;
  }
  switch (frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return today.getDay() === anchor.getDay();
    case 'monthly':
      return today.getDate() === anchor.getDate();
    case 'every_90_days': {
      const diff = daysBetween(today, anchor);
      return diff >= 0 && diff % 90 === 0;
    }
    case 'custom_interval': {
      if (!customDays || customDays <= 0) return false;
      const diff = daysBetween(today, anchor);
      return diff >= 0 && diff % customDays === 0;
    }
    default:
      return false;
  }
}

/**
 * Generate today's maintenance tasks from active templates.
 * - Idempotent (UNIQUE constraint on schedule_template_id + due_date).
 * - Also flips Pending tasks whose due_date < today - 1 day to Overdue.
 */
export async function generateTodaysMaintenanceTasks(): Promise<{ created: number; overdue: number }> {
  const today = new Date();
  const todayISO = todayLocalISO();

  // 1) Mark overdue: pending tasks with due_date < today - 1
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 2); // due_date strictly less than (today - 1)
  const cutoffISO = (() => {
    const y = cutoff.getFullYear();
    const m = String(cutoff.getMonth() + 1).padStart(2, '0');
    const d = String(cutoff.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  const { data: overdueRows } = await supabase
    .from('maintenance_tasks')
    .update({ status: 'Overdue' })
    .eq('status', 'Pending')
    .lte('due_date', cutoffISO)
    .select('id');

  // 2) Load active templates
  const { data: templates, error } = await supabase
    .from('maintenance_schedule_templates')
    .select('id, asset_id, title, frequency, custom_interval_days, due_time, assigned_staff_id, assigned_department, created_at, status')
    .eq('status', 'active');
  if (error) throw error;

  // 3) Fetch existing tasks for today to avoid duplicates
  const tplIds = (templates ?? []).map(t => t.id);
  if (!tplIds.length) return { created: 0, overdue: overdueRows?.length ?? 0 };

  const { data: existing } = await supabase
    .from('maintenance_tasks')
    .select('schedule_template_id')
    .eq('due_date', todayISO)
    .in('schedule_template_id', tplIds);
  const existingSet = new Set((existing ?? []).map(r => r.schedule_template_id));

  // 4) Build inserts for due templates not already created today
  const inserts = (templates ?? [])
    .filter(t => !existingSet.has(t.id))
    .filter(t => isDueToday(
      t.frequency as MaintenanceFrequency,
      t.custom_interval_days,
      new Date(t.created_at),
      today,
    ))
    .map(t => ({
      asset_id: t.asset_id,
      schedule_template_id: t.id,
      title: t.title,
      due_date: todayISO,
      due_time: t.due_time,
      assigned_staff_id: t.assigned_staff_id,
      assigned_department: t.assigned_department,
      status: 'Pending' as MaintenanceTaskStatus,
    }));

  let created = 0;
  if (inserts.length) {
    const { data, error: insErr } = await supabase
      .from('maintenance_tasks')
      .upsert(inserts, { onConflict: 'schedule_template_id,due_date', ignoreDuplicates: true })
      .select('id');
    if (insErr) throw insErr;
    created = data?.length ?? 0;
  }

  return { created, overdue: overdueRows?.length ?? 0 };
}

async function enrich(rows: MaintenanceTask[]): Promise<EnrichedMaintenanceTask[]> {
  if (!rows.length) return [];
  const assetIds = Array.from(new Set(rows.map(r => r.asset_id)));
  const tplIds = Array.from(new Set(rows.map(r => r.schedule_template_id)));
  const staffIds = Array.from(new Set(rows.map(r => r.assigned_staff_id).filter(Boolean) as string[]));

  const [{ data: assets }, { data: templates }, { data: staff }] = await Promise.all([
    supabase.from('maintenance_assets').select('id, name, code, branch_id, department').in('id', assetIds),
    supabase.from('maintenance_schedule_templates').select('id, note_required, photo_required').in('id', tplIds),
    staffIds.length
      ? supabase.from('profiles').select('user_id, full_name').in('user_id', staffIds)
      : Promise.resolve({ data: [] as { user_id: string; full_name: string | null }[] }),
  ]);

  const branchIds = Array.from(new Set((assets ?? []).map(a => a.branch_id).filter(Boolean)));
  const { data: branches } = branchIds.length
    ? await supabase.from('branches').select('id, name').in('id', branchIds)
    : { data: [] as { id: string; name: string }[] };

  const aMap = new Map((assets ?? []).map(a => [a.id, a]));
  const tMap = new Map((templates ?? []).map(t => [t.id, t]));
  const bMap = new Map((branches ?? []).map(b => [b.id, b.name]));
  const sMap = new Map((staff ?? []).map(s => [s.user_id, s.full_name]));

  return rows.map(r => {
    const a = aMap.get(r.asset_id);
    const t = tMap.get(r.schedule_template_id);
    return {
      ...r,
      asset_name: a?.name ?? null,
      asset_code: a?.code ?? null,
      asset_branch_id: a?.branch_id ?? null,
      asset_branch_name: a ? bMap.get(a.branch_id) ?? null : null,
      asset_department: a?.department ?? null,
      assigned_staff_name: r.assigned_staff_id ? sMap.get(r.assigned_staff_id) ?? null : null,
      note_required: !!t?.note_required,
      photo_required: !!t?.photo_required,
    };
  });
}

/**
 * Hook: ensure today's tasks exist, then expose them enriched.
 * Generation runs once per mount of the consumer.
 */
export function useMaintenanceTasks() {
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    generateTodaysMaintenanceTasks()
      .then(() => { if (!cancelled) qc.invalidateQueries({ queryKey: KEY }); })
      .catch(() => { /* surface via query if needed */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('*')
        .order('due_date', { ascending: false })
        .order('due_time', { ascending: true });
      if (error) throw error;
      return enrich((data ?? []) as MaintenanceTask[]);
    },
  });
}

export interface CompleteTaskPayload {
  id: string;
  note?: string | null;
  photo_url?: string | null;
  user_id: string;
}

export function useCompleteMaintenanceTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: CompleteTaskPayload) => {
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .update({
          status: 'Done',
          note: p.note?.trim() || null,
          photo_url: p.photo_url || null,
          completed_by: p.user_id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', p.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export { todayLocalISO, isDueToday };