import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, GripVertical, ClipboardList, Users, Camera, Download, Upload, ChevronDown, ChevronUp, Circle, Pencil, Save, X, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  useTemplates, useCreateTemplate, useCreateInstance, useDeleteTemplate, useDeleteTemplateTask,
  useUpdateTemplate, useAddTemplateTask, useUpdateTemplateTask, useBranches, useStaffProfiles,
  type PhotoRequirement, type ChecklistType, type Department,
} from '@/hooks/useChecklists';
import { Constants } from '@/integrations/supabase/types';
import { exportTemplatesToXlsx, parseTemplatesFromXlsx } from '@/utils/checklistExcel';

type ChecklistFrequency = 'daily' | 'weekly' | 'monthly' | 'determinate_date';

const FREQUENCY_OPTIONS: { value: ChecklistFrequency; labelKey: string }[] = [
  { value: 'daily', labelKey: 'checklists.frequencyDaily' },
  { value: 'weekly', labelKey: 'checklists.frequencyWeekly' },
  { value: 'monthly', labelKey: 'checklists.frequencyMonthly' },
  { value: 'determinate_date', labelKey: 'checklists.frequencyDeterminate' },
];

function CreateTemplateDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChecklistType>('opening');
  const [department, setDepartment] = useState<Department | ''>('');
  const [branchId, setBranchId] = useState<string>('');
  const [frequency, setFrequency] = useState<ChecklistFrequency | ''>('');
  const [specificDate, setSpecificDate] = useState<Date | undefined>();
  const [assignedStaff, setAssignedStaff] = useState<string>('');
  const [tasks, setTasks] = useState<{ title: string; photo_requirement: PhotoRequirement }[]>([
    { title: '', photo_requirement: 'none' },
  ]);

  const { data: branches } = useBranches();
  const { data: staff } = useStaffProfiles(branchId || undefined);
  const create = useCreateTemplate();

  const addTask = () => setTasks(prev => [...prev, { title: '', photo_requirement: 'none' }]);
  const removeTask = (idx: number) => setTasks(prev => prev.filter((_, i) => i !== idx));
  const updateTask = (idx: number, field: string, value: string) =>
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));

  const handleCreate = () => {
    if (!title.trim()) { toast.error(t('checklists.titleRequired')); return; }
    if (!branchId) { toast.error(t('checklists.branchRequired')); return; }
    if (!department) { toast.error(t('checklists.frequencyRequired')); return; }
    if (!frequency) { toast.error(t('checklists.frequencyRequired')); return; }
    if (!assignedStaff) { toast.error(t('checklists.assigneeRequired')); return; }
    if (frequency === 'determinate_date' && !specificDate) { toast.error(t('checklists.specificDateRequired')); return; }
    const validTasks = tasks.filter(t => t.title.trim());
    if (!validTasks.length) { toast.error(t('checklists.addOneTask')); return; }

    create.mutate({
      template: {
        title: title.trim(),
        checklist_type: type,
        department: department as Department,
        branch_id: branchId,
        frequency: frequency as any,
        default_assigned_to: assignedStaff,
        specific_date: frequency === 'determinate_date' && specificDate
          ? format(specificDate, 'yyyy-MM-dd')
          : null,
      },
      tasks: validTasks.map((t, i) => ({ title: t.title.trim(), sort_order: i, photo_requirement: t.photo_requirement })),
    }, {
      onSuccess: () => { toast.success(t('checklists.created')); setOpen(false); resetForm(); onCreated(); },
      onError: () => toast.error(t('checklists.failCreate')),
    });
  };

  const resetForm = () => {
    setTitle(''); setType('opening'); setDepartment(''); setBranchId('');
    setFrequency(''); setSpecificDate(undefined); setAssignedStaff('');
    setTasks([{ title: '', photo_requirement: 'none' }]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> {t('checklists.newTemplate')}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('checklists.createTemplate')}</DialogTitle>
          <DialogDescription>{t('checklists.createTemplateDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('checklists.templateTitle')} *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('checklists.templateTitlePlaceholder')} />
          </div>

          <div>
            <Label>{t('checklists.branch')} *</Label>
            <Select value={branchId || ''} onValueChange={v => { setBranchId(v); setAssignedStaff(''); }}>
              <SelectTrigger><SelectValue placeholder={t('checklists.branch')} /></SelectTrigger>
              <SelectContent>
                {branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('checklists.type')}</Label>
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
              <Label>{t('login.department')} *</Label>
              <Select value={department || ''} onValueChange={v => setDepartment(v as Department)}>
                <SelectTrigger><SelectValue placeholder={t('login.selectDept')} /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.department.map(d => (
                    <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t('checklists.frequency')} *</Label>
            <Select value={frequency || ''} onValueChange={v => setFrequency(v as ChecklistFrequency)}>
              <SelectTrigger><SelectValue placeholder={t('checklists.frequency')} /></SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{t(f.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {frequency === 'determinate_date' && (
            <div>
              <Label>{t('checklists.specificDate')} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !specificDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {specificDate ? format(specificDate, 'PP') : t('checklists.specificDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={specificDate} onSelect={setSpecificDate}
                    disabled={d => d < new Date(new Date().toDateString())}
                    className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div>
            <Label>{t('checklists.defaultAssignee')} *</Label>
            <Select value={assignedStaff || ''} onValueChange={setAssignedStaff} disabled={!branchId}>
              <SelectTrigger><SelectValue placeholder={branchId ? t('checklists.selectStaff') : t('checklists.branchRequired')} /></SelectTrigger>
              <SelectContent>
                {staff?.map(s => (
                  <SelectItem key={s.id} value={s.user_id}>{s.full_name || s.email || 'Unknown'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t('checklists.tasks')}</Label>
              <Button variant="ghost" size="sm" onClick={addTask}><Plus className="h-3 w-3 mr-1" /> {t('checklists.add')}</Button>
            </div>
            <div className="space-y-2">
              {tasks.map((task, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border bg-muted/30 p-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Input value={task.title} onChange={e => updateTask(idx, 'title', e.target.value)} placeholder={t('checklists.taskPlaceholder', { num: idx + 1 })} className="h-8 text-sm" />
                    <Select value={task.photo_requirement} onValueChange={v => updateTask(idx, 'photo_requirement', v)}>
                      <SelectTrigger className="h-7 text-xs w-36">
                        <Camera className="h-3 w-3 mr-1" /><SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('checklists.noPhoto')}</SelectItem>
                        <SelectItem value="optional">{t('checklists.optional')}</SelectItem>
                        <SelectItem value="mandatory">{t('checklists.required')}</SelectItem>
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
          <Button variant="outline" onClick={() => setOpen(false)}>{t('checklists.cancel')}</Button>
          <Button onClick={handleCreate} disabled={create.isPending}>
            {create.isPending ? t('checklists.creating') : t('checklists.createTemplate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ template }: { template: any }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState('');
  const { data: staff } = useStaffProfiles(template.branch_id || undefined);
  const createInstance = useCreateInstance();

  const handleAssign = () => {
    if (!staffId) { toast.error(t('checklists.selectStaffError')); return; }
    createInstance.mutate({
      template_id: template.id, checklist_type: template.checklist_type,
      department: template.department, branch_id: template.branch_id, assigned_to: staffId,
    }, {
      onSuccess: () => { toast.success(t('checklists.assigned')); setOpen(false); setStaffId(''); },
      onError: () => toast.error(t('checklists.failAssign')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={e => e.stopPropagation()}>
          <Users className="h-3.5 w-3.5 mr-1" /> {t('checklists.assignToday')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('checklists.assignChecklist')}</DialogTitle>
          <DialogDescription>{t('checklists.assignDesc', { title: template.title })}</DialogDescription>
        </DialogHeader>
        <div>
          <Label>{t('checklists.staffMember')}</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger><SelectValue placeholder={t('checklists.selectStaff')} /></SelectTrigger>
            <SelectContent>
              {staff?.map(s => (
                <SelectItem key={s.id} value={s.user_id}>{s.full_name || s.email || 'Unknown'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('checklists.cancel')}</Button>
          <Button onClick={handleAssign} disabled={createInstance.isPending}>
            {createInstance.isPending ? t('checklists.assigning') : t('checklists.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TemplateManager() {
  const { t } = useTranslation();
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
    if (!templates?.length) { toast.error(t('checklists.noExport')); return; }
    exportTemplatesToXlsx(templates);
    toast.success(t('checklists.exported'));
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const parsed = await parseTemplatesFromXlsx(file);
      for (const tpl of parsed) {
        await createTemplate.mutateAsync({
          template: { title: tpl.title, checklist_type: tpl.checklist_type, department: tpl.department, branch_id: null },
          tasks: tpl.tasks,
        });
      }
      toast.success(t('checklists.imported', { count: parsed.length }));
      refetch();
    } catch (err: any) { toast.error(err.message || t('checklists.importFailed')); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteTemplate = () => {
    if (!deleteDialogId) return;
    const id = deleteDialogId;
    deleteTemplate.mutate(id, {
      onSuccess: () => {
        toast.success(t('checklists.deleted'));
        if (expandedId === id) setExpandedId(null);
        if (editingId === id) setEditingId(null);
        setDeleteDialogId(null);
      },
      onError: (error: any) => {
        console.error('Failed to delete template', error);
        toast.error(error?.message || t('checklists.failDelete'));
      },
    });
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask.mutate(taskId, {
      onSuccess: () => toast.success(t('checklists.taskRemoved')),
      onError: () => toast.error(t('checklists.failDeleteTask')),
    });
  };

  const startEditing = (tpl: any) => {
    setEditingId(tpl.id); setEditTitle(tpl.title); setEditType(tpl.checklist_type);
    setEditDept(tpl.department); setEditingTaskId(null); setNewTaskTitle('');
  };

  const cancelEditing = () => { setEditingId(null); setEditingTaskId(null); setNewTaskTitle(''); };

  const saveTemplateEdits = () => {
    if (!editingId || !editTitle.trim()) { toast.error(t('checklists.titleRequired')); return; }
    updateTemplate.mutate({
      templateId: editingId,
      updates: { title: editTitle.trim(), checklist_type: editType, department: editDept },
    }, {
      onSuccess: () => { toast.success(t('checklists.templateUpdated')); setEditingId(null); },
      onError: () => toast.error(t('checklists.failUpdate')),
    });
  };

  const handleAddTask = (templateId: string, taskCount: number) => {
    if (!newTaskTitle.trim()) { toast.error(t('checklists.taskTitleRequired')); return; }
    addTask.mutate({ template_id: templateId, title: newTaskTitle.trim(), sort_order: taskCount }, {
      onSuccess: () => { toast.success(t('checklists.taskAdded')); setNewTaskTitle(''); },
      onError: () => toast.error(t('checklists.failAddTask')),
    });
  };

  const saveTaskEdit = (taskId: string) => {
    if (!editTaskTitle.trim()) { toast.error(t('checklists.taskTitleRequired')); return; }
    updateTask.mutate({ taskId, updates: { title: editTaskTitle.trim() } }, {
      onSuccess: () => { toast.success(t('checklists.taskUpdated')); setEditingTaskId(null); },
      onError: () => toast.error(t('checklists.failUpdateTask')),
    });
  };

  const templateToDelete = templates?.find(t => t.id === deleteDialogId);

  const getFrequencyLabel = (freq: string) => {
    const opt = FREQUENCY_OPTIONS.find(f => f.value === freq);
    return opt ? t(opt.labelKey) : freq;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">{t('checklists.checklistTemplates')}</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> {t('checklists.export')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> {t('checklists.import')}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <CreateTemplateDialog onCreated={() => refetch()} />
        </div>
      </div>

      <AlertDialog open={!!deleteDialogId} onOpenChange={(open) => { if (!open) setDeleteDialogId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('checklists.deleteTitle', { title: templateToDelete?.title })}</AlertDialogTitle>
            <AlertDialogDescription>{t('checklists.deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('checklists.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); handleDeleteTemplate(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteTemplate.isPending}>
              {deleteTemplate.isPending ? t('checklists.deleting') : t('checklists.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : !templates?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{t('checklists.noTemplates')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(tpl => {
            const tasks = (tpl as any).tasks || [];
            const taskCount = tasks.length;
            const isExpanded = expandedId === tpl.id;
            const isEditing = editingId === tpl.id;
            const freq = (tpl as any).frequency;

            return (
              <div key={tpl.id} className="rounded-lg border bg-card overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : tpl.id)} className="w-full p-4 text-left hover:bg-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {isExpanded ? <ChevronUp className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{tpl.title}</p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">
                          {tpl.checklist_type} · {tpl.department} · {taskCount} {taskCount !== 1 ? t('checklists.tasks_plural') : t('checklists.task')}
                          {freq && <> · {getFrequencyLabel(freq)}</>}
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
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="sm" className="h-8" onClick={cancelEditing}>
                            <X className="h-3.5 w-3.5 mr-1" /> {t('checklists.cancel')}
                          </Button>
                          <Button size="sm" className="h-8" onClick={saveTemplateEdits} disabled={updateTemplate.isPending}>
                            <Save className="h-3.5 w-3.5 mr-1" /> {updateTemplate.isPending ? t('checklists.saving') : t('checklists.save')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => startEditing(tpl)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> {t('checklists.edit')}
                          </Button>
                          <Button variant="destructive" size="sm" className="h-8" onClick={() => setDeleteDialogId(tpl.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {t('checklists.deleteTemplate')}
                          </Button>
                        </>
                      )}
                    </div>

                    {isEditing && (
                      <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                        <div>
                          <Label className="text-xs">{t('checklists.templateName')}</Label>
                          <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">{t('checklists.type')}</Label>
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
                            <Label className="text-xs">{t('login.department')}</Label>
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

                    {tasks.length > 0 ? tasks.map((task: any, idx: number) => (
                      <div key={task.id || idx} className="flex items-center gap-2 text-sm">
                        {editingTaskId === task.id ? (
                          <>
                            <Input value={editTaskTitle} onChange={e => setEditTaskTitle(e.target.value)}
                              className="h-8 text-sm flex-1" autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') saveTaskEdit(task.id); if (e.key === 'Escape') setEditingTaskId(null); }} />
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
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">📸 {task.photo_requirement}</Badge>
                            )}
                            {isEditing && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                                onClick={() => { setEditingTaskId(task.id); setEditTaskTitle(task.title); }}>
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeleteTask(task.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    )) : (
                      <p className="text-xs text-muted-foreground italic">{t('checklists.noTasks')}</p>
                    )}

                    {isEditing && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                          placeholder={t('checklists.newTaskPlaceholder')} className="h-8 text-sm flex-1"
                          onKeyDown={e => { if (e.key === 'Enter') handleAddTask(tpl.id, taskCount); }} />
                        <Button variant="outline" size="sm" className="h-8 shrink-0"
                          onClick={() => handleAddTask(tpl.id, taskCount)} disabled={addTask.isPending}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> {t('checklists.add')}
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
