import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database, Tables, TablesInsert } from '@/integrations/supabase/types';

// Type exports
export type ChecklistType = Database['public']['Enums']['checklist_type'];
export type PhotoRequirement = Database['public']['Enums']['photo_requirement'];
export type ChecklistStatus = Database['public']['Enums']['checklist_status'];
export type Department = Database['public']['Enums']['department'];

export type TemplateTask = Tables<'checklist_template_tasks'>;
export type ChecklistTemplate = Tables<'checklist_templates'>;
export type ChecklistInstance = Tables<'checklist_instances'>;
export type TaskCompletion = Tables<'checklist_task_completions'>;

// ─── Staff Hooks ───

export function useMyChecklists(date?: string) {
  const { user } = useAuth();
  const targetDate = date || new Date().toISOString().split('T')[0];

  return useQuery({
    queryKey: ['checklists', 'my', targetDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_instances')
        .select('*, template:checklist_templates(title, department, checklist_type)')
        .eq('assigned_to', user!.id)
        .eq('scheduled_date', targetDate)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useTemplateTasks(templateId: string | undefined) {
  return useQuery({
    queryKey: ['template-tasks', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_template_tasks')
        .select('*')
        .eq('template_id', templateId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });
}

export function useTaskCompletions(instanceId: string | undefined) {
  return useQuery({
    queryKey: ['task-completions', instanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_task_completions')
        .select('*')
        .eq('instance_id', instanceId!);
      if (error) throw error;
      return data;
    },
    enabled: !!instanceId,
  });
}

export function useUpsertCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (completion: {
      instance_id: string;
      task_id: string;
      is_completed: boolean;
      comment?: string | null;
      photo_url?: string | null;
      completed_by?: string | null;
      completed_at?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('checklist_task_completions')
        .upsert(completion, { onConflict: 'instance_id,task_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-completions', variables.instance_id] });
    },
  });
}

export function useSubmitChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase
        .from('checklist_instances')
        .update({ status: 'completed' as ChecklistStatus, submitted_at: new Date().toISOString() })
        .eq('id', instanceId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
  });
}

export async function uploadChecklistPhoto(file: File, userId: string): Promise<string> {
  const timestamp = Date.now();
  const path = `${userId}/${timestamp}-${file.name}`;
  const { error } = await supabase.storage
    .from('checklist-photos')
    .upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('checklist-photos').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Manager/Owner Hooks ───

export interface ChecklistFilters {
  date?: string;
  branch_id?: string;
  department?: Department;
  checklist_type?: ChecklistType;
  status?: ChecklistStatus;
}

export function useAllChecklists(filters?: ChecklistFilters) {
  return useQuery({
    queryKey: ['checklists', 'all', filters],
    queryFn: async () => {
      let query = supabase
        .from('checklist_instances')
        .select('*, template:checklist_templates(title, department, checklist_type), assignee:profiles!checklist_instances_assigned_to_fkey(full_name, avatar_url)')
        .order('scheduled_date', { ascending: false });

      if (filters?.date) query = query.eq('scheduled_date', filters.date);
      if (filters?.branch_id) query = query.eq('branch_id', filters.branch_id);
      if (filters?.department) query = query.eq('department', filters.department);
      if (filters?.checklist_type) query = query.eq('checklist_type', filters.checklist_type);
      if (filters?.status) query = query.eq('status', filters.status);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useVerifyChecklist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ instanceId, action, rejectionNote }: {
      instanceId: string;
      action: 'verified' | 'rejected';
      rejectionNote?: string;
    }) => {
      const { data, error } = await supabase
        .from('checklist_instances')
        .update({
          status: action as ChecklistStatus,
          verified_by: user!.id,
          verified_at: new Date().toISOString(),
          rejection_note: action === 'rejected' ? (rejectionNote || null) : null,
        })
        .eq('id', instanceId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
  });
}

// ─── Template Management Hooks ───

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error: tasksError } = await supabase
        .from('checklist_template_tasks')
        .delete()
        .eq('template_id', templateId);
      if (tasksError) throw tasksError;

      const { error } = await supabase
        .from('checklist_templates')
        .update({ is_active: false })
        .eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useDeleteTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('checklist_template_tasks')
        .delete()
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template-tasks'] });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ templateId, updates }: {
      templateId: string;
      updates: { title?: string; checklist_type?: ChecklistType; department?: Department };
    }) => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .update(updates)
        .eq('id', templateId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useAddTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: { template_id: string; title: string; sort_order: number; photo_requirement?: PhotoRequirement }) => {
      const { data, error } = await supabase
        .from('checklist_template_tasks')
        .insert({
          template_id: task.template_id,
          title: task.title,
          sort_order: task.sort_order,
          photo_requirement: task.photo_requirement || 'none' as PhotoRequirement,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template-tasks'] });
    },
  });
}

export function useUpdateTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, updates }: {
      taskId: string;
      updates: { title?: string; sort_order?: number; photo_requirement?: PhotoRequirement };
    }) => {
      const { data, error } = await supabase
        .from('checklist_template_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template-tasks'] });
    },
  });
}

export function useUpdateInstanceNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ instanceId, notes }: { instanceId: string; notes: string }) => {
      const { data, error } = await supabase
        .from('checklist_instances')
        .update({ notes } as any)
        .eq('id', instanceId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
  });
}

export function useTemplates(branchId?: string) {
  return useQuery({
    queryKey: ['templates', branchId],
    queryFn: async () => {
      let query = supabase
        .from('checklist_templates')
        .select('*, tasks:checklist_template_tasks(*)');
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ template, tasks }: {
      template: Omit<TablesInsert<'checklist_templates'>, 'created_by'>;
      tasks: { title: string; sort_order: number; photo_requirement?: PhotoRequirement }[];
    }) => {
      const { data: newTemplate, error: templateError } = await supabase
        .from('checklist_templates')
        .insert({ ...template, created_by: user!.id })
        .select()
        .single();
      if (templateError) throw templateError;

      if (tasks.length > 0) {
        const taskRows = tasks.map((t) => ({
          template_id: newTemplate.id,
          title: t.title,
          sort_order: t.sort_order,
          photo_requirement: t.photo_requirement || ('none' as PhotoRequirement),
        }));
        const { error: tasksError } = await supabase
          .from('checklist_template_tasks')
          .insert(taskRows);
        if (tasksError) throw tasksError;
      }

      return newTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useCreateInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instance: TablesInsert<'checklist_instances'>) => {
      const { data, error } = await supabase
        .from('checklist_instances')
        .insert(instance)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
  });
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useStaffProfiles(branchId?: string) {
  return useQuery({
    queryKey: ['staff-profiles', branchId],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query.order('full_name');
      if (error) throw error;
      return data;
    },
  });
}
