

## Checklist Hooks — Implementation Plan

### Overview
Create `src/hooks/useChecklists.tsx` with all data-fetching and mutation hooks for the checklist module, using React Query + Supabase client.

### What will be built

**One file**: `src/hooks/useChecklists.tsx`

**Type exports** derived from the database types:
- `ChecklistType`, `PhotoRequirement`, `ChecklistStatus` (from `Database['public']['Enums']`)
- `TemplateTask`, `ChecklistTemplate`, `ChecklistInstance`, `TaskCompletion` (from table Row types)

**Staff hooks:**
- `useMyChecklists(date?)` — queries `checklist_instances` filtered by `assigned_to = user.id` and `scheduled_date`, joins `checklist_templates` via a select with embedded relation (`template:checklist_templates(title, department, checklist_type)`)
- `useTemplateTasks(templateId)` — queries `checklist_template_tasks` filtered by template, ordered by `sort_order`
- `useTaskCompletions(instanceId)` — queries `checklist_task_completions` filtered by instance
- `useUpsertCompletion()` — mutation using `.upsert()` with `onConflict: 'instance_id,task_id'`, invalidates `['task-completions']`
- `useSubmitChecklist()` — mutation updating instance status to `'completed'` + `submitted_at = new Date().toISOString()`, invalidates `['checklists']`
- `uploadChecklistPhoto(file, userId)` — uploads to `checklist-photos` bucket at `{userId}/{timestamp}-{filename}`, returns public URL via `getPublicUrl`

**Manager/Owner hooks:**
- `useAllChecklists(filters?)` — queries all instances with optional filters (date, branch_id, department, checklist_type, status), joins template and assignee profile info
- `useVerifyChecklist()` — mutation setting status to `'verified'` or `'rejected'` with `verified_by`, `verified_at`, and optional `rejection_note`

**Template management hooks:**
- `useTemplates(branchId?)` — queries active templates with embedded tasks relation
- `useCreateTemplate()` — mutation that inserts template, then bulk-inserts tasks in sequence, invalidates `['templates']`
- `useCreateInstance()` — mutation inserting a new instance row, invalidates `['checklists']`
- `useBranches()` — queries active branches
- `useStaffProfiles(branchId?)` — queries active profiles, optionally filtered by branch

### Technical details
- All hooks use `useQuery` / `useMutation` from `@tanstack/react-query`
- Auth user ID obtained via `useAuth()` hook where needed
- Query keys follow pattern: `['checklists']`, `['templates']`, `['template-tasks', id]`, `['task-completions', id]`, `['branches']`, `['staff-profiles']`
- All mutations call `queryClient.invalidateQueries()` on success for related keys

