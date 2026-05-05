import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { invokeManageRoles } from '@/lib/manageRoles';
import { todayVN } from '@/lib/timezone';
import type { Database, Tables, TablesInsert } from '@/integrations/supabase/types';
import { uploadToAppFilesBucket } from '@/lib/appFilesStorage';

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

  // PATCH 2: show ALL unsubmitted checklists for this user (today + overdue + future),
  // not just today's. Overdue/late items must remain visible until submitted.
  return useQuery({
    queryKey: ['checklists', 'my', 'unsubmitted', date ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('checklist_instances')
        .select('*, template:checklist_templates(title, code, department, checklist_type), branch:branches(id, name)')
        .eq('assigned_to', user!.id)
        // Hide submitted/final statuses from "My Checklist".
        // Active statuses kept: pending, late, escalated, rejected (rejected = needs redo).
        .not('status', 'in', '(completed,verified)')
        .is('archive_hidden_at', null)
        .order('scheduled_date', { ascending: true })
        .order('due_datetime', { ascending: true, nullsFirst: false });
      if (date) query = query.eq('scheduled_date', date);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

/**
 * Recently submitted checklists for the current user (last 24h).
 * View-only: shown beneath "My Checklist" so staff can confirm their submission.
 */
export function useRecentlySubmitted() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['checklists', 'recently-submitted', user?.id],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('checklist_instances')
        .select('*, template:checklist_templates(title, code, department, checklist_type), branch:branches(id, name)')
        .eq('assigned_to', user!.id)
        .in('status', ['completed', 'verified'])
        .gte('submitted_at', since)
        .order('submitted_at', { ascending: false });
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

/**
 * Upload a checklist proof photo.
 *
 * NEW uploads go to the unified `app-files` bucket using path:
 *   checklists/{branchCode}/{year}/{month}/{uuid}_{name}.{ext}
 *
 * IMPORTANT: existing photos remain in the legacy bucket and continue
 * to load from their stored URLs unchanged. Only new uploads are
 * written to `app-files`.
 *
 * `context` is optional so callers without instance metadata still
 * work; missing branch/date fall back to "UNK" and the current date.
 */
export async function uploadChecklistPhoto(
  file: File,
  _userId: string,
  context?: {
    branchName?: string | null;
    scheduledDate?: string | null;
    /**
     * Readable suffix for the stored filename. Priority for the caller:
     *   1. task title (if photo belongs to a task)
     *   2. checklist template name (general checklist photo)
     *   3. omit -> falls back to "checklist-photo"
     */
    readableName?: string | null;
  },
): Promise<{ url: string; path: string }> {
  const date = context?.scheduledDate ? new Date(context.scheduledDate) : new Date();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const readableName = context?.readableName?.trim() || 'checklist-photo';

  const result = await uploadToAppFilesBucket(
    file,
    'checklists',
    {
      branchName: context?.branchName ?? undefined,
      year,
      month,
    },
    readableName,
  );

  // eslint-disable-next-line no-console
  console.log('[checklist.upload.fixed]', {
    bucket: result.bucket,
    path: result.path,
    url: result.publicUrl,
    branch: context?.branchName ?? null,
    year,
    month,
    readableName,
  });

  return { url: result.publicUrl, path: result.path };
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
        .select('*, template:checklist_templates(title, code, department, checklist_type, branch_id, branch:branches(id, name)), assignment:checklist_assignments(branch_id, branch:branches(id, name)), branch:branches(id, name)')
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
      let profilesMap: Record<string, { username: string | null; full_name: string | null; avatar_url: string | null; branch_id: string | null }> = {};
      if (assignedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url, branch_id')
          .in('user_id', assignedUserIds as string[]);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.user_id, { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, branch_id: p.branch_id }]));
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
      const { data, error } = await supabase.rpc('delete_checklist_template_task', {
        _task_id: taskId,
      });
      if (error) {
        console.error('[deleteTemplateTask] rpc error:', { taskId, error });
        throw new Error(error.message);
      }
      const result = data as { ok: boolean; archived?: boolean; message?: string; error?: string } | null;
      if (!result || !result.ok) {
        const msg = result?.message || 'Unknown error while deleting task';
        console.error('[deleteTemplateTask] business error:', { taskId, result });
        throw new Error(msg);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
  });
}

/**
 * Owner action: update a single template task (title / photo / note / active flag).
 * Affects only the template; existing assigned checklist instances stay untouched.
 */
export function useUpdateTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      title,
      photo_requirement,
      note_requirement,
      is_active,
    }: {
      taskId: string;
      title?: string;
      photo_requirement?: PhotoRequirement;
      note_requirement?: NoteRequirement;
      is_active?: boolean;
    }) => {
      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (photo_requirement !== undefined) updates.photo_requirement = photo_requirement;
      if (note_requirement !== undefined) updates.note_requirement = note_requirement;
      if (is_active !== undefined) updates.is_active = is_active;

      const { data, error } = await supabase
        .from('checklist_template_tasks')
        .update(updates as any)
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

/**
 * Owner action: append a new task to an existing template.
 * Sort order defaults to (max + 1) to place at the end.
 */
export function useCreateTemplateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      template_id,
      title,
      photo_requirement,
      note_requirement,
    }: {
      template_id: string;
      title: string;
      photo_requirement?: PhotoRequirement;
      note_requirement?: NoteRequirement;
    }) => {
      const { data: existing, error: existingErr } = await supabase
        .from('checklist_template_tasks')
        .select('sort_order')
        .eq('template_id', template_id)
        .order('sort_order', { ascending: false })
        .limit(1);
      if (existingErr) throw existingErr;
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('checklist_template_tasks')
        .insert({
          template_id,
          title,
          sort_order: nextOrder,
          photo_requirement: photo_requirement || ('none' as PhotoRequirement),
          note_requirement: (note_requirement || 'none') as NoteRequirement,
          is_active: true,
        } as any)
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

/**
 * Owner action: rename a checklist template (title only).
 * Code, branch, department, type, due time and history are preserved.
 * Existing instances keep the snapshot they were generated with — only
 * future generations pick up the new title.
 */
export function useUpdateTemplateTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, title }: { templateId: string; title: string }) => {
      const cleaned = title.trim().replace(/\s+/g, ' ');
      if (!cleaned) throw new Error('Title cannot be empty');

      // Fetch current template so we can scope the duplicate check
      // to the same branch + department.
      const { data: current, error: currentErr } = await supabase
        .from('checklist_templates')
        .select('id, branch_id, department')
        .eq('id', templateId)
        .maybeSingle();
      if (currentErr) throw currentErr;
      if (!current) throw new Error('Template not found');

      // Duplicate guard within the same branch + department.
      let dupQuery = supabase
        .from('checklist_templates')
        .select('id')
        .ilike('title', cleaned)
        .eq('department', current.department)
        .neq('id', templateId);
      dupQuery = current.branch_id
        ? dupQuery.eq('branch_id', current.branch_id)
        : dupQuery.is('branch_id', null);
      const { data: dup, error: dupErr } = await dupQuery.limit(1);
      if (dupErr) throw dupErr;
      if (dup && dup.length > 0) {
        throw new Error('A template with this name already exists for this branch and department.');
      }

      const { data, error } = await supabase
        .from('checklist_templates')
        .update({ title: cleaned })
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
  username: string | null;
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
      // Permissive active-user filter: accept any non-disabled profile that has a username.
      // Source of truth is the profiles table (RLS already restricts to is_active = true).
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, email, department, position, branch_id, is_active')
        .order('username', { ascending: true });
      if (error) throw error;

      const isDisabled = (p: any) => {
        if (p.is_active === false) return true;
        if (typeof p.status === 'string') {
          const s = p.status.toLowerCase();
          if (s === 'inactive' || s === 'disabled') return true;
        }
        if (p.disabled === true) return true;
        return false;
      };

      const filtered = (profiles || []).filter((p: any) =>
        !!(p.username && String(p.username).trim()) && !isDisabled(p)
      );

      // Try to enrich with roles via the privileged endpoint.
      // If it fails (e.g. caller lacks owner/manager), fall back to empty roles
      // so the assignment dropdown still works.
      let rolesMap: Record<string, string[]> = {};
      try {
        const result = await invokeManageRoles('list_active_users');
        for (const u of (result?.users || []) as any[]) {
          if (u?.user_id) rolesMap[u.user_id] = u.roles || [];
        }
      } catch (e) {
        console.warn('[useActiveUsersForAssignment] roles enrichment failed:', e);
      }

      return filtered
        .map((p: any) => ({
          user_id: p.user_id,
          username: p.username,
          full_name: p.full_name,
          email: p.email,
          department: p.department,
          position: p.position,
          branch_id: p.branch_id,
          roles: rolesMap[p.user_id] || [],
        }))
        .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
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

      // Pre-check: block only if an ACTIVE instance exists for the same template + user + date.
      // Active = pending | late | escalated. Completed/verified instances do NOT block re-assignment.
      const { data: activeExisting, error: activeCheckError } = await supabase
        .from('checklist_instances')
        .select('id, status')
        .eq('template_id', assignment.template_id)
        .eq('assigned_to', assignment.assigned_to)
        .eq('scheduled_date', assignment.start_date)
        .in('status', ['pending', 'late', 'escalated'])
        .limit(1);

      if (activeCheckError) {
        console.error('Active assignment check failed:', activeCheckError);
        throw activeCheckError;
      }
      if (activeExisting && activeExisting.length > 0) {
        throw new Error('Checklist already in progress for this user today.');
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

      if (firstInstanceError && firstInstanceError.code === '23505') {
        // Should be rare now (partial unique index only covers active statuses),
        // but keep a friendly message in case a race created an active instance.
        await supabase.from('checklist_assignments').delete().eq('id', createdAssignment.id);
        throw new Error('Checklist already in progress for this user today.');
      }
      if (firstInstanceError) {
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
