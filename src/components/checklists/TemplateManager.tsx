import { useState, useRef } from 'react';
import { Plus, Trash2, GripVertical, ClipboardList, Users, Camera, Download, Upload, ChevronDown, ChevronUp, Circle, Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  useTemplates,
  useCreateTemplate,
  useCreateInstance,
  useDeleteTemplate,
  useDeleteTemplateTask,
  useUpdateTemplate,
  useAddTemplateTask,
  useUpdateTemplateTask,
  useBranches,
  useStaffProfiles,
  type PhotoRequirement,
  type ChecklistType,
  type Department,
} from '@/hooks/useChecklists';
import { Constants } from '@/integrations/supabase/types';
import { exportTemplatesToXlsx, parseTemplatesFromXlsx } from '@/utils/checklistExcel';

// ─── Create Template Dialog ───

function CreateTemplateDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChecklistType>('opening');
  const [department, setDepartment] = useState<Department>('kitchen');
  const [branchId, setBranchId] = useState<string>('');
  const [tasks, setTasks] = useState<{ title: string; photo_requirement: PhotoRequirement }[]>([
    { title: '', photo_requirement: 'none' },
  ]);

  const { data: branches } = useBranches();
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
        branch_id: branchId || null,
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
    setBranchId('');
    setTasks([{ title: '', photo_requirement: 'none' }]);
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
              <Select value={type} onValueChange={v => setType(v as ChecklistType)}>
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
            <Label>Branch (optional)</Label>
            <Select value={branchId || 'none'} onValueChange={v => setBranchId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All branches</SelectItem>
                {branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

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
  const [staffId, setStaffId] = useState('');
  const { data: staff } = useStaffProfiles(template.branch_id || undefined);
  const createInstance = useCreateInstance();

  const handleAssign = () => {
    if (!staffId) { toast.error('Select a staff member'); return; }
    createInstance.mutate({
      template_id: template.id,
      checklist_type: template.checklist_type,
      department: template.department,
      branch_id: template.branch_id,
      assigned_to: staffId,
    }, {
      onSuccess: () => {
        toast.success('Checklist assigned!');
        setOpen(false);
        setStaffId('');
      },
      onError: () => toast.error('Failed to assign checklist'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={e => e.stopPropagation()}>
          <Users className="h-3.5 w-3.5 mr-1" /> Assign Today
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Checklist</DialogTitle>
          <DialogDescription>Assign "{template.title}" to a staff member for today.</DialogDescription>
        </DialogHeader>
        <div>
          <Label>Staff Member</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger><SelectValue placeholder="Select staff..." /></SelectTrigger>
            <SelectContent>
              {staff?.map(s => (
                <SelectItem key={s.id} value={s.user_id}>{s.full_name || s.email || 'Unknown'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleAssign} disabled={createInstance.isPending}>
            {createInstance.isPending ? 'Assigning…' : 'Assign'}
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
  const updateTemplate = useUpdateTemplate();
  const addTask = useAddTemplateTask();
  const updateTask = useUpdateTemplateTask();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<ChecklistType>('opening');
  const [editDept, setEditDept] = useState<Department>('kitchen');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');

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
          template: { title: tpl.title, checklist_type: tpl.checklist_type, department: tpl.department, branch_id: null },
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

  const handleDeleteTemplate = () => {
    if (!deleteDialogId) return;
    const id = deleteDialogId;
    deleteTemplate.mutate(id, {
      onSuccess: () => {
        toast.success('Template deleted successfully');
        if (expandedId === id) setExpandedId(null);
        if (editingId === id) setEditingId(null);
        setDeleteDialogId(null);
      },
      onError: () => {
        toast.error('Failed to delete template. Please try again.');
        setDeleteDialogId(null);
      },
    });
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask.mutate(taskId, {
      onSuccess: () => toast.success('Task removed'),
      onError: () => toast.error('Failed to delete task'),
    });
  };

  const startEditing = (tpl: any) => {
    setEditingId(tpl.id);
    setEditTitle(tpl.title);
    setEditType(tpl.checklist_type);
    setEditDept(tpl.department);
    setEditingTaskId(null);
    setNewTaskTitle('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTaskId(null);
    setNewTaskTitle('');
  };

  const saveTemplateEdits = () => {
    if (!editingId || !editTitle.trim()) {
      toast.error('Template title is required');
      return;
    }
    updateTemplate.mutate({
      templateId: editingId,
      updates: { title: editTitle.trim(), checklist_type: editType, department: editDept },
    }, {
      onSuccess: () => {
        toast.success('Template updated');
        setEditingId(null);
      },
      onError: () => toast.error('Failed to update template'),
    });
  };

  const handleAddTask = (templateId: string, taskCount: number) => {
    if (!newTaskTitle.trim()) { toast.error('Task title is required'); return; }
    addTask.mutate({
      template_id: templateId,
      title: newTaskTitle.trim(),
      sort_order: taskCount,
    }, {
      onSuccess: () => {
        toast.success('Task added');
        setNewTaskTitle('');
      },
      onError: () => toast.error('Failed to add task'),
    });
  };

  const saveTaskEdit = (taskId: string) => {
    if (!editTaskTitle.trim()) { toast.error('Task title is required'); return; }
    updateTask.mutate({
      taskId,
      updates: { title: editTaskTitle.trim() },
    }, {
      onSuccess: () => {
        toast.success('Task updated');
        setEditingTaskId(null);
      },
      onError: () => toast.error('Failed to update task'),
    });
  };

  const templateToDelete = templates?.find(t => t.id === deleteDialogId);

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

      {/* Controlled Delete AlertDialog */}
      <AlertDialog open={!!deleteDialogId} onOpenChange={(open) => { if (!open) setDeleteDialogId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{templateToDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this template and all its tasks. Existing assigned checklists will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplate.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            const isEditing = editingId === tpl.id;

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
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <Badge variant="outline" className="capitalize text-xs">{tpl.checklist_type}</Badge>
                      <AssignDialog template={tpl} />
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t px-4 pb-3 pt-2 space-y-2">
                    {/* Action bar */}
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="sm" className="h-8" onClick={cancelEditing}>
                            <X className="h-3.5 w-3.5 mr-1" /> Cancel
                          </Button>
                          <Button size="sm" className="h-8" onClick={saveTemplateEdits} disabled={updateTemplate.isPending}>
                            <Save className="h-3.5 w-3.5 mr-1" /> {updateTemplate.isPending ? 'Saving…' : 'Save'}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => startEditing(tpl)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8"
                            onClick={() => setDeleteDialogId(tpl.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Template
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Edit template fields */}
                    {isEditing && (
                      <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                        <div>
                          <Label className="text-xs">Template Name</Label>
                          <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Type</Label>
                            <Select value={editType} onValueChange={v => setEditType(v as ChecklistType)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Constants.public.Enums.checklist_type.map(t => (
                                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Department</Label>
                            <Select value={editDept} onValueChange={v => setEditDept(v as Department)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Constants.public.Enums.department.map(d => (
                                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Task list */}
                    {tasks.length > 0 ? tasks.map((task: any, idx: number) => (
                      <div key={task.id || idx} className="flex items-center gap-2 text-sm">
                        {editingTaskId === task.id ? (
                          <>
                            <Input
                              value={editTaskTitle}
                              onChange={e => setEditTaskTitle(e.target.value)}
                              className="h-8 text-sm flex-1"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveTaskEdit(task.id);
                                if (e.key === 'Escape') setEditingTaskId(null);
                              }}
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => saveTaskEdit(task.id)}>
                              <Save className="h-3.5 w-3.5 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingTaskId(null)}>
                              <X className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="flex-1 text-foreground">{task.title}</span>
                            {task.photo_requirement !== 'none' && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                📸 {task.photo_requirement}
                              </Badge>
                            )}
                            {isEditing && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => { setEditingTaskId(task.id); setEditTaskTitle(task.title); }}
                              >
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    )) : (
                      <p className="text-xs text-muted-foreground italic">No tasks in this template.</p>
                    )}

                    {/* Add new task (visible in edit mode) */}
                    {isEditing && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          value={newTaskTitle}
                          onChange={e => setNewTaskTitle(e.target.value)}
                          placeholder="New task title…"
                          className="h-8 text-sm flex-1"
                          onKeyDown={e => { if (e.key === 'Enter') handleAddTask(tpl.id, taskCount); }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => handleAddTask(tpl.id, taskCount)}
                          disabled={addTask.isPending}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
