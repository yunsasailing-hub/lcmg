import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns a Map<schedule_template_id, lastExecutionISO (YYYY-MM-DD)>.
 * Looks at maintenance_tasks.execution_date (fallback: due_date) for status='Done' rows.
 */
export function useLastExecutionByTemplate() {
  return useQuery({
    queryKey: ['maintenance_last_execution_by_template'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('schedule_template_id, execution_date, due_date, status')
        .eq('status', 'Done');
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of data ?? []) {
        const iso = (r.execution_date as string | null) ?? (r.due_date as string | null);
        if (!iso || !r.schedule_template_id) continue;
        const prev = map.get(r.schedule_template_id);
        if (!prev || iso > prev) map.set(r.schedule_template_id, iso);
      }
      return map;
    },
  });
}

export function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}