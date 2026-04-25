import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { invokeManageRoles } from '@/lib/manageRoles';
import { todayVN } from '@/lib/timezone';
import type { Database, Tables, TablesInsert } from '@/integrations/supabase/types';

// Type exports
export type ChecklistType = Database['public']['Enums']['checklist_type'];
export type PhotoRequirement = Database['public']['Enums']['photo_requirement'];
export type ChecklistStatus = Database['public']['Enums']['checklist_status'];
export type Department = Database['public']['Enums']['department'];
export type NoteRequirement = 'none' | 'optional' | 'mandatory';

export type TemplateTask = Tables<'checklist_template_tasks'>;
export type ChecklistTemplate = Tables<'checklist_templates'>;
export type ChecklistInstance = Tables<'checklist_instances'>;
export type TaskCompletion = Tables<'checklist_task_completions'>;

export type AssignedChecklistTask = {
  id: string;
  instance_id: string;
  template_task_id: string | null;
  title: string;
  instruction: string | null;
  sort_order: number;
  photo_required: boolean | null;
  note_required: boolean | null;
  is_active: boolean | null;
};

function splitTemplateTaskTitle(value: string) {
  const [title, ...instructionParts] = value.split('\n');
  return {
    title: title || value,
    instruction: instructionParts.join('\n').trim() || null,
  };
}

// ─── Staff Hooks ───

export function useMyChecklists(date?: string) {
  const { user } = useAuth();
  const targetDate = date || todayVN();

  return useQuery({
    queryKey: ['checklists', 'my', targetDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_instances')
        .select('*, template:checklist_templates(title, department, checklist_type), branch:branches(id, name)')
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

export function useInstanceTasks(instanceId: string | undefined, templateId: string | undefined) {
  return useQuery<AssignedChecklistTask[]>({
    queryKey: ['instance-tasks', instanceId, templateId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('checklist_instance_tasks')
        .select('*')
        .eq('instance_id', instanceId!)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      if (data?.length) return data as AssignedChecklistTask[];

      const { data: templateTasks, error: templateError } = await supabase
        .from('checklist_template_tasks')
        .select('*')
        .eq('template_id', templateId!)
        .order('sort_order', { ascending: true });

      if (templateError) throw templateError;

      return (templateTasks || []).map((task) => {
        const parsed = splitTemplateTaskTitle(task.title);
        return {
          id: task.id,
          instance_id: instanceId!,
          template_task_id: task.id,
          title: parsed.title,
          instruction: parsed.instruction,
          sort_order: task.sort_order,
          photo_required: task.photo_requirement === 'mandatory',
          note_required: (task as any).note_requirement === 'mandatory',
          is_active: (task as any).is_active ?? true,
        } satisfies AssignedChecklistTask;
      });
    },
    enabled: !!instanceId && !!templateId,
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
    // Optimistic update: patch cache immediately so UI flips before round-trip
    onMutate: async (variables) => {
      const key = ['task-completions', variables.instance_id];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      queryClient.setQueryData<any[]>(key, (old = []) => {
        const idx = old.findIndex(c => c.task_id === variables.task_id);
        const merged = idx >= 0 ? { ...old[idx], ...variables } : { id: `temp-${variables.task_id}`, ...variables };
        if (idx >= 0) {
          const next = old.slice();
          next[idx] = merged;
          return next;
        }
        return [...old, merged];
      });
      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: (_data, _err, variables) => {
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
        .update({
          status: 'completed' as ChecklistStatus,
          submitted_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        } as any)
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
        .select('*, template:checklist_templates(title, department, checklist_type, branch_id, branch:branches(id, name)), assignment:checklist_assignments(branch_id, branch:branches(id, name)), branch:branches(id, name)')
        .order('scheduled_date', { ascending: false });

      if (filters?.date) query = query.eq('scheduled_date', filters.date);
      if (filters?.branch_id) query = query.eq('branch_id', filters.branch_id);
      if (filters?.department) query = query.eq('department', filters.department);
      if (filters?.checklist_type) query = query.eq('checklist_type', filters.checklist_type);
      if (filters?.status) query = query.eq('status', filters.status);

      const { data, error } = await query;
      if (error) throw error;

      // Manually fetch assignee profiles for instances with assigned_to
      const assignedUserIds = [...new Set(data?.filter(d => d.assigned_to).map(d => d.assigned_to) || [])];
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null; branch_id: string | null }> = {};
      if (assignedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url, branch_id')
          .in('user_id', assignedUserIds as string[]);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url, branch_id: p.branch_id }]));
        }
      }

      // Collect branch ids that need name lookup (from assignee profiles fallback)
      const profileBranchIds = [
        ...new Set(
          Object.values(profilesMap)
            .map(p => p.branch_id)
            .filter((b): b is string => !!b),
        ),
      ];
      let branchNameMap: Record<string, { id: string; name: string }> = {};
      if (profileBranchIds.length > 0) {
        const { data: branches } = await supabase
          .from('branches')
          .select('id, name')
          .in('id', profileBranchIds);
        if (branches) {
          branchNameMap = Object.fromEntries(branches.map(b => [b.id, b]));
        }
      }

      return (data || []).map(item => {
        const assignee = item.assigned_to ? (profilesMap[item.assigned_to] || null) : null;
        // Resolve branch with fallback chain:
        //   instance → assignment → template → assignee profile
        const resolvedBranch =
          (item as any).branch
          ?? (item as any).assignment?.branch
          ?? (item as any).template?.branch
          ?? (assignee?.branch_id ? branchNameMap[assignee.branch_id] : null)
          ?? null;
        return {
          ...item,
          assignee,
          resolved_branch: resolvedBranch,
        };
      });
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
      // Hard delete via security-definer RPC — removes template + tasks + assignments + instances + completions
      const { data, error } = await supabase.rpc('delete_checklist_template' as any, {
        _template_id: templateId,
      });
      if (error) {
        console.error('[deleteTemplate] RPC error:', { templateId, error });
        throw new Error(error.message || 'Database error while deleting template');
      }
      const result = data as { ok: boolean; error?: string; message?: string } | null;
      if (!result || !result.ok) {
        const msg = result?.message || 'Unknown error while deleting template';
        console.error('[deleteTemplate] business error:', { templateId, result });
        throw new Error(msg);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
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

export function useDeleteInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase
        .from('checklist_instances')
        .delete()
        .eq('id', instanceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
  });
}

/**
 * Owner/manager action: remove all orphan pending/late/escalated checklist
 * instances (assignment missing or ended) plus their notifications, tasks
 * and completions. Submitted, verified, and rejected (Done Archive) records
 * are preserved.
 */
export function useCleanupOrphanPendingChecklists() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_orphan_pending_checklists' as any);
      if (error) throw new Error(error.message || 'Cleanup failed');
      const result = data as { ok: boolean; error?: string; message?: string; deleted_instances?: number; deleted_notifications?: number } | null;
      if (!result || !result.ok) {
        throw new Error(result?.message || 'Cleanup failed');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
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

export type TemplateStatusFilter = 'active' | 'archived' | 'all';

export function useTemplates(branchId?: string, status: TemplateStatusFilter = 'active') {
  return useQuery({
    queryKey: ['templates', branchId, status],
    queryFn: async () => {
      let query = supabase
        .from('checklist_templates')
        .select('*, tasks:checklist_template_tasks(*)');
      if (branchId) query = query.eq('branch_id', branchId);
      if (status === 'active') query = query.eq('is_active', true);
      else if (status === 'archived') query = query.eq('is_active', false);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSetTemplateActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, isActive }: { templateId: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .update({ is_active: isActive })
        .eq('id', templateId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ template, tasks }: {
      template: Omit<TablesInsert<'checklist_templates'>, 'created_by'>;
      tasks: {
        title: string;
        sort_order: number;
        photo_requirement?: PhotoRequirement;
        note_requirement?: NoteRequirement;
        is_active?: boolean;
      }[];
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
          note_requirement: (t.note_requirement || 'none') as NoteRequirement,
          is_active: t.is_active ?? true,
        }));
        const { error: tasksError } = await supabase
          .from('checklist_template_tasks')
          .insert(taskRows as any);
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

// ─── Active Users with Roles (for assignment dropdowns) ───

export interface ActiveUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  position: string | null;
  branch_id: string | null;
  roles: string[];
}

export function useActiveUsersForAssignment(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery<ActiveUser[]>({
    queryKey: ['active-users-assignment'],
    queryFn: async () => {
      const result = await invokeManageRoles('list_active_users');
      return result.users || [];
    },
    retry: 1,
    enabled,
  });
}

// ─── Create Assignment ───

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (assignment: {
      template_id: string;
      assigned_to: string;
      periodicity: Database['public']['Enums']['assignment_periodicity'];
      start_date: string;
      end_date?: string | null;
      notes?: string | null;
      branch_id?: string | null;
      warning_recipient_user_ids?: string[];
    }) => {
      const normalizedAssignment = {
        template_id: assignment.template_id,
        assigned_to: assignment.assigned_to,
        periodicity: assignment.periodicity,
        start_date: assignment.start_date,
        end_date: assignment.end_date || null,
        notes: assignment.notes || null,
        branch_id: assignment.branch_id || null,
        warning_recipient_user_ids: assignment.warning_recipient_user_ids || [],
        created_by: user!.id,
      };

      const { data: template, error: templateError } = await supabase
        .from('checklist_templates')
        .select('checklist_type, department, default_due_time, warning_recipient_user_ids')
        .eq('id', assignment.template_id)
        .single();

      if (templateError || !template) {
        console.error('Template fetch for assignment failed:', templateError);
        throw templateError ?? new Error('Template not found');
      }

      const { data: templateTasksForDebug, error: templateTasksDebugError } = await supabase
        .from('checklist_template_tasks')
        .select('id, title, sort_order, photo_requirement, note_requirement, is_active')
        .eq('template_id', assignment.template_id)
        .order('sort_order', { ascending: true });

      if (templateTasksDebugError) {
        console.error('[NoteRequiredDebug] template tasks fetch failed =', templateTasksDebugError);
      } else {
        console.log('[NoteRequiredDebug] template tasks =', templateTasksForDebug);
      }

      const { data: createdAssignment, error: assignmentError } = await supabase
        .from('checklist_assignments')
        .insert(normalizedAssignment)
        .select()
        .single();

      if (assignmentError) {
        console.error('Assignment creation failed:', assignmentError);
        throw assignmentError;
      }

      // Template due time is in Vietnam local time (Asia/Ho_Chi_Minh, UTC+7).
      // Convert to UTC ISO so timestamptz comparisons in notification logic are correct.
      const dueTime = (template as any).default_due_time || '10:00:00';
      const dueDatetime = new Date(`${assignment.start_date}T${dueTime}+07:00`).toISOString();

      // Recipient resolution: assignment override → template default → empty (function will fallback)
      const recipientIds =
        (assignment.warning_recipient_user_ids && assignment.warning_recipient_user_ids.length > 0)
          ? assignment.warning_recipient_user_ids
          : ((template as any).warning_recipient_user_ids || []);

      const firstInstancePayload = {
        template_id: assignment.template_id,
        assignment_id: createdAssignment.id,
        assigned_to: assignment.assigned_to,
        checklist_type: template.checklist_type,
        department: template.department,
        branch_id: assignment.branch_id || null,
        scheduled_date: assignment.start_date,
        due_datetime: dueDatetime,
        warning_recipient_user_ids: recipientIds,
      };

      const { data: firstInstance, error: firstInstanceError } = await supabase
        .from('checklist_instances')
        .insert(firstInstancePayload)
        .select('id')
        .maybeSingle();

      if (firstInstanceError && firstInstanceError.code !== '23505') {
        console.error('First instance creation failed:', firstInstanceError);
        await supabase.from('checklist_assignments').delete().eq('id', createdAssignment.id);
        throw firstInstanceError;
      }

      if (firstInstance?.id) {
        const { error: taskCopyError } = await (supabase as any).rpc('create_checklist_instance_tasks', {
          _instance_id: firstInstance.id,
        });
        if (taskCopyError) {
          console.error('Assigned checklist task creation failed:', taskCopyError);
          await supabase.from('checklist_instances').delete().eq('id', firstInstance.id);
          await supabase.from('checklist_assignments').delete().eq('id', createdAssignment.id);
          throw taskCopyError;
        }

        const { data: assignedTasksForDebug, error: assignedTasksDebugError } = await (supabase as any)
          .from('checklist_instance_tasks')
          .select('id, template_task_id, title, sort_order, photo_required, note_required, is_active')
          .eq('instance_id', firstInstance.id)
          .order('sort_order', { ascending: true });

        if (assignedTasksDebugError) {
          console.error('[NoteRequiredDebug] assigned tasks fetch failed =', assignedTasksDebugError);
        } else {
          console.log('[NoteRequiredDebug] assigned tasks created =', assignedTasksForDebug);
        }
      }

      await supabase
        .from('checklist_assignments')
        .update({ last_generated_date: assignment.start_date })
        .eq('id', createdAssignment.id);

      const today = new Date().toISOString().split('T')[0];
      if (assignment.periodicity !== 'once' && assignment.start_date < today) {
        const { error: generationError } = await supabase.functions.invoke('generate-recurring-checklists', {
          body: {},
        });

        if (generationError) {
          console.error('Recurring backfill generation failed:', generationError);
        }
      }

      return createdAssignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

// Branch is part of template identity. It is set at creation time only and
// cannot be edited afterwards. Legacy templates / instances without a branch
// must be replaced (recreate template) or the assignment cancelled and reassigned.
