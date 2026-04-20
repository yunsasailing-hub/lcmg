import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ProcedureType =
  | 'prep' | 'cook' | 'assemble' | 'bake' | 'mix' | 'finish' | 'service_prep' | 'other';

export const PROCEDURE_TYPES: ProcedureType[] = [
  'prep', 'cook', 'assemble', 'bake', 'mix', 'finish', 'service_prep', 'other',
];

export interface RecipeProcedureRow {
  id: string;
  recipe_id: string;
  step_number: number;
  procedure_type: ProcedureType;
  instruction_en: string;
  instruction_vi: string | null;
  warning: string | null;
  tool: string | null;
  duration_minutes: number | null;
  temperature: string | null;
  note: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  video_url: string | null;
  web_link: string | null;
  created_at: string;
}

export interface ProcedureStepInput {
  id?: string;
  step_number: number;
  procedure_type: ProcedureType;
  instruction_en: string;
  warning: string | null;
  tool: string | null;
  duration_minutes: number | null;
  temperature: string | null;
  note: string | null;
  image_url?: string | null;
  image_storage_path?: string | null;
  video_url?: string | null;
  web_link?: string | null;
}

export function useRecipeProcedures(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['recipe_procedures', recipeId],
    enabled: !!recipeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('recipe_procedures')
        .select('*')
        .eq('recipe_id', recipeId!)
        .order('step_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecipeProcedureRow[];
    },
  });
}

/**
 * Replace all procedure steps for a recipe atomically:
 * - delete rows not present in the payload
 * - insert new / update existing
 * Empty steps (no instruction) are dropped before save by the caller.
 */
export function useSaveRecipeProcedures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, steps }: { recipeId: string; steps: ProcedureStepInput[] }) => {
      const { data: existing, error: existErr } = await (supabase as any)
        .from('recipe_procedures').select('id').eq('recipe_id', recipeId);
      if (existErr) throw existErr;
      const keep = new Set(steps.filter(s => s.id).map(s => s.id!));
      const toDelete = (existing ?? []).map((r: any) => r.id).filter((id: string) => !keep.has(id));
      if (toDelete.length) {
        const { error } = await (supabase as any).from('recipe_procedures').delete().in('id', toDelete);
        if (error) throw error;
      }
      for (const s of steps) {
        const payload = {
          recipe_id: recipeId,
          step_number: s.step_number,
          procedure_type: s.procedure_type,
          instruction_en: s.instruction_en,
          warning: s.warning,
          tool: s.tool,
          duration_minutes: s.duration_minutes,
          temperature: s.temperature,
          note: s.note,
          image_url: s.image_url ?? null,
          image_storage_path: s.image_storage_path ?? null,
          video_url: s.video_url ?? null,
          web_link: s.web_link ?? null,
        };
        if (s.id) {
          const { error } = await (supabase as any)
            .from('recipe_procedures').update(payload).eq('id', s.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any)
            .from('recipe_procedures').insert(payload);
          if (error) throw error;
        }
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['recipe_procedures', vars.recipeId] });
    },
  });
}
