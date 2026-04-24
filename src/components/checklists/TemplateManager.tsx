import { useState, useRef } from 'react';
import { Plus, Trash2, GripVertical, ClipboardList, Users, Camera, Download, Upload, ChevronDown, ChevronUp, Circle, CalendarIcon, Loader2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  useDeleteTemplateTask,
  useActiveUsersForAssignment,
  useCreateAssignment,
  useUpdateTemplateBranch,
  useBranches,
  type PhotoRequirement,
  type ChecklistType,
  type Department,
} from '@/hooks/useChecklists';
import { Constants } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';
import { exportTemplatesToXlsx, parseTemplatesFromXlsx } from '@/utils/checklistExcel';
import { useAssignmentCountByTemplate } from '@/hooks/useAssignments';
import AssignmentManager from '@/components/checklists/AssignmentManager';
import WarningRecipientsField from '@/components/checklists/WarningRecipientsField';
import BranchSelect from '@/components/checklists/BranchSelect';

const DEFAULT_DUE_TIMES: Record<ChecklistType, string> = {
  opening: '10:00',
  afternoon: '16:00',
  closing: '22:30',
};

// ─── Create Template Dialog ───

function CreateTemplateDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChecklistType>('opening');
  const [department, setDepartment] = useState<Department>('kitchen');
  const [dueTime, setDueTime] = useState(DEFAULT_DUE_TIMES['opening']);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<{ title: string; photo_requirement: PhotoRequirement }[]>([
    { title: '', photo_requirement: 'none' },
  ]);
  const [warningRecipientUserIds, setWarningRecipientUserIds] = useState<string[]>([]);

  const create = useCreateTemplate();

  const addTask = () => setTasks(prev => [...prev, { title: '', photo_requirement: 'none' }]);
  const removeTask = (idx: number) => setTasks(prev => prev.filter((_, i) => i !== idx));
  const updateTask = (idx: number, field: string, value: string) =>
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));

  const handleCreate = () => {
    if (!title.trim()) { toast.error('Template title is required'); return; }
    const validTasks = tasks.filter(t => t.title.trim());
    if (!validTasks.length) { toast.error('Add at least one task'); return; }

    create.mutate({
      template: {
        title: title.trim(),
        checklist_type: type,
        department,
        branch_id: branchId,
        default_due_time: dueTime + ':00',
        warning_recipient_user_ids: warningRecipientUserIds,
      },
      tasks: validTasks.map((t, i) => ({
        title: t.title.trim(),
        sort_order: i,
        photo_requirement: t.photo_requirement,
      })),
    }, {
      onSuccess: () => {
        toast.success('Template created!');
        setOpen(false);
        resetForm();
        onCreated();
      },
      onError: () => toast.error('Failed to create template'),
    });
  };

  const resetForm = () => {
    setTitle('');
    setType('opening');
    setDepartment('kitchen');
    setDueTime(DEFAULT_DUE_TIMES['opening']);
    setBranchId(null);
    setTasks([{ title: '', photo_requirement: 'none' }]);
    setWarningRecipientUserIds([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> New Template</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Checklist Template</DialogTitle>
          <DialogDescription>Define a reusable checklist with tasks.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Kitchen Opening" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={v => { setType(v as ChecklistType); setDueTime(DEFAULT_DUE_TIMES[v as ChecklistType]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.checklist_type.map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select value={department} onValueChange={v => setDepartment(v as Department)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.department.map(d => (
                    <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Default Due Time</Label>
            <Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="w-36" />
          </div>

          <div>
            <Label>Default Branch</Label>
            <BranchSelect value={branchId} onChange={setBranchId} placeholder="Select branch…" />
            <p className="text-xs text-muted-foreground mt-1">
              Required for new activations. Existing templates without a branch can be edited later.
            </p>
          </div>

          <WarningRecipientsField
            value={warningRecipientUserIds}
            onChange={setWarningRecipientUserIds}
          />

          {/* Tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Tasks</Label>
              <Button variant="ghost" size="sm" onClick={addTask}><Plus className="h-3 w-3 mr-1" /> Add</Button>
            </div>
            <div className="space-y-2">
              {tasks.map((task, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border bg-muted/30 p-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Input
                      value={task.title}
                      onChange={e => updateTask(idx, 'title', e.target.value)}
                      placeholder={`Task ${idx + 1}`}
                      className="h-8 text-sm"
                    />
                    <Select value={task.photo_requirement} onValueChange={v => updateTask(idx, 'photo_requirement', v)}>
                      <SelectTrigger className="h-7 text-xs w-36">
                        <Camera className="h-3 w-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No photo</SelectItem>
                        <SelectItem value="optional">Optional</SelectItem>
                        <SelectItem value="mandatory">Required</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {tasks.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeTask(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign Dialog ───

function AssignDialog({ template }: { template: any }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [periodicity, setPeriodicity] = useState<Database['public']['Enums']['assignment_periodicity']>('once');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState('');
  const [branchId, setBranchId] = useState<string | null>(template?.branch_id ?? null);
  const [warningRecipientUserIds, setWarningRecipientUserIds] = useState<string[]>(
    Array.isArray(template?.warning_recipient_user_ids) ? template.warning_recipient_user_ids : []
  );

  const { data: users, isLoading: usersLoading, isError: usersError } = useActiveUsersForAssignment();
  const createAssignment = useCreateAssignment();

  // Sort users: same department first
  const sortedUsers = [...(users || [])].sort((a, b) => {
    const aDept = a.department === template.department ? 0 : 1;
    const bDept = b.department === template.department ? 0 : 1;
    if (aDept !== bDept) return aDept - bDept;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  const handleAssign = () => {
    if (!userId) { toast.error('Select a user'); return; }
    if (!startDate) { toast.error('Select a start date'); return; }
    if (endDate && endDate < startDate) { toast.error('End date cannot be before start date'); return; }
    if (!branchId) { toast.error('Select a branch'); return; }

    createAssignment.mutate({
      template_id: template.id,
      assigned_to: userId,
      periodicity,
      start_date: format(startDate, 'yyyy-MM-dd'),
      end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
      notes: notes.trim() || null,
      branch_id: branchId,
      warning_recipient_user_ids: warningRecipientUserIds,
    }, {
      onSuccess: () => {
        toast.success(periodicity === 'once' ? 'Checklist assigned!' : 'Recurring checklist assigned and first checklist created!');
        setOpen(false);
        resetForm();
      },
      onError: (err: any) => {
        console.error('Checklist assignment failed:', err);
        toast.error(err.message || 'Failed to assign checklist');
      },
    });
  };

  const resetForm = () => {
    setUserId('');
    setPeriodicity('once');
    setStartDate(new Date());
    setEndDate(undefined);
    setNotes('');
    setBranchId(template?.branch_id ?? null);
    setWarningRecipientUserIds(
      Array.isArray(template?.warning_recipient_user_ids) ? template.warning_recipient_user_ids : []
    );
  };

  const getUserLabel = (u: any) => {
    const name = u.full_name || u.email || 'Unknown';
    const role = u.roles?.[0] ? u.roles[0].charAt(0).toUpperCase() + u.roles[0].slice(1) : '';
    const dept = u.department ? u.department.charAt(0).toUpperCase() + u.department.slice(1) : '';
    const parts = [name, role, dept].filter(Boolean);
    return parts.join(' – ');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={e => e.stopPropagation()}>
          <Users className="h-3.5 w-3.5 mr-1" /> Assign Checklist
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Checklist</DialogTitle>
          <DialogDescription>Assign "{template.title}" to a team member.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* User */}
          <div>
            <Label>Assign to User *</Label>
            {usersLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
              </div>
            ) : usersError ? (
              <p className="text-sm text-destructive py-1">Failed to load users</p>
            ) : !sortedUsers.length ? (
              <p className="text-sm text-muted-foreground py-1">No active users available</p>
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
                <SelectContent>
                  {sortedUsers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {getUserLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Periodicity */}
          <div>
            <Label>Periodicity *</Label>
            <Select value={periodicity} onValueChange={v => setPeriodicity(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.assignment_periodicity.map(p => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PP') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PP') : 'Optional'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} disabled={(d) => d < startDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" rows={2} />
          </div>

          <WarningRecipientsField
            value={warningRecipientUserIds}
            onChange={setWarningRecipientUserIds}
            preferredBranchId={template?.branch_id || null}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleAssign} disabled={createAssignment.isPending || !userId}>
            {createAssignment.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ───

export default function TemplateManager() {
  const { data: templates, isLoading, refetch } = useTemplates();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const deleteTask = useDeleteTemplateTask();
  const { data: assignmentCounts } = useAssignmentCountByTemplate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assignmentManagerTemplate, setAssignmentManagerTemplate] = useState<{ id: string; title: string } | null>(null);

  const handleExport = () => {
    if (!templates?.length) { toast.error('No templates to export'); return; }
    exportTemplatesToXlsx(templates);
    toast.success('Templates exported!');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseTemplatesFromXlsx(file);
      for (const tpl of parsed) {
        await createTemplate.mutateAsync({
          template: { title: tpl.title, checklist_type: tpl.checklist_type, department: tpl.department, branch_id: null, default_due_time: DEFAULT_DUE_TIMES[tpl.checklist_type] + ':00' },
          tasks: tpl.tasks,
        });
      }
      toast.success(`${parsed.length} template(s) imported!`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteTemplate = (templateId: string) => {
    deleteTemplate.mutate(templateId, {
      onSuccess: () => {
        toast.success('Template deleted');
        if (expandedId === templateId) setExpandedId(null);
      },
      onError: (err: any) => {
        const msg = err?.message || 'Failed to delete template';
        console.error('[TemplateManager] delete failed:', { templateId, err });
        toast.error(msg);
      },
    });
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask.mutate(taskId, {
      onSuccess: () => toast.success('Task removed'),
      onError: () => toast.error('Failed to delete task'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Checklist Templates</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <CreateTemplateDialog onCreated={() => refetch()} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : !templates?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No templates yet. Create your first checklist template.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(tpl => {
            const tasks = (tpl as any).tasks || [];
            const taskCount = tasks.length;
            const isExpanded = expandedId === tpl.id;
            const aCount = assignmentCounts?.[tpl.id] || 0;

            return (
              <div key={tpl.id} className="rounded-lg border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : tpl.id)}
                  className="w-full p-4 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {isExpanded ? <ChevronUp className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{tpl.title}</p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">
                          {tpl.checklist_type} · {tpl.department} · {taskCount} task{taskCount !== 1 ? 's' : ''}
                          {aCount > 0 && ` · ${aCount} assignment${aCount !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="capitalize text-xs">{tpl.checklist_type}</Badge>
                      {aCount > 0 && (
                        <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); setAssignmentManagerTemplate({ id: tpl.id, title: tpl.title }); }}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> {aCount} Assignment{aCount !== 1 ? 's' : ''}
                        </Button>
                      )}
                      <AssignDialog template={tpl} />
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t px-4 pb-3 pt-2 space-y-1.5">
                    {tasks.length > 0 ? tasks.map((task: any, idx: number) => (
                      <div key={task.id || idx} className="flex items-center gap-2 text-sm group">
                        <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-foreground">{task.title}</span>
                        {task.photo_requirement !== 'none' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            📸 {task.photo_requirement}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    )) : (
                      <p className="text-xs text-muted-foreground italic">No tasks in this template.</p>
                    )}

                    {/* Delete template button */}
                    <div className="pt-2 border-t mt-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full">
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Template
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{tpl.title}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will deactivate this template only. All existing submitted checklists and history will remain in the database.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteTemplate(tpl.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {assignmentManagerTemplate && (
        <AssignmentManager
          templateId={assignmentManagerTemplate.id}
          templateTitle={assignmentManagerTemplate.title}
          open={!!assignmentManagerTemplate}
          onOpenChange={(open) => { if (!open) setAssignmentManagerTemplate(null); }}
        />
      )}
    </div>
  );
}
