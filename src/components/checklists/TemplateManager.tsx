import { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, GripVertical, ClipboardList, Users, Camera, Download, Upload, ChevronDown, ChevronUp, Circle, Pencil, Save, X, AlertCircle, Eye, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  useTemplates, useCreateTemplate, useDeleteTemplate, useDeleteTemplateTask,
  useUpdateTemplate, useAddTemplateTask, useUpdateTemplateTask, useStaffProfiles, useCreateAssignment,
  useTemplateAssignments, useAllTemplateAssignmentCounts,
  type PhotoRequirement, type ChecklistType, type Department,
} from '@/hooks/useChecklists';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Constants } from '@/integrations/supabase/types';
import { exportTemplatesToXlsx, parseTemplatesFromXlsx } from '@/utils/checklistExcel';

function CreateTemplateDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChecklistType>('opening');
  const [department, setDepartment] = useState<Department>('kitchen');
  const [tasks, setTasks] = useState<{ title: string; photo_requirement: PhotoRequirement }[]>([
    { title: '', photo_requirement: 'none' },
  ]);

  const create = useCreateTemplate();

  const addTask = () => setTasks(prev => [...prev, { title: '', photo_requirement: 'none' }]);
  const removeTask = (idx: number) => setTasks(prev => prev.filter((_, i) => i !== idx));
  const updateTask = (idx: number, field: string, value: string) =>
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));

  const handleCreate = () => {
    if (!title.trim()) { toast.error(t('checklists.titleRequired')); return; }
    const validTasks = tasks.filter(t => t.title.trim());
    if (!validTasks.length) { toast.error(t('checklists.addOneTask')); return; }

    create.mutate({
      template: { title: title.trim(), checklist_type: type, department, branch_id: null },
      tasks: validTasks.map((t, i) => ({ title: t.title.trim(), sort_order: i, photo_requirement: t.photo_requirement })),
    }, {
      onSuccess: () => { toast.success(t('checklists.created')); setOpen(false); resetForm(); onCreated(); },
      onError: () => toast.error(t('checklists.failCreate')),
    });
  };

  const resetForm = () => {
    setTitle(''); setType('opening'); setDepartment('kitchen');
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
            <Label>{t('checklists.templateTitle')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('checklists.templateTitlePlaceholder')} />
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
              <Label>{t('login.department')}</Label>
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
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [periodicity, setPeriodicity] = useState('once');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const { data: staff, isLoading: staffLoading, isError: staffError } = useStaffProfiles();
  const createAssignment = useCreateAssignment();

  const sortedStaff = useMemo(() => {
    if (!staff) return [];
    return [...staff].sort((a, b) => {
      const aDept = a.department === template.department ? 0 : 1;
      const bDept = b.department === template.department ? 0 : 1;
      if (aDept !== bDept) return aDept - bDept;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });
  }, [staff, template.department]);

  const handleAssign = () => {
    if (!staffId) { toast.error(t('checklists.selectStaffError')); return; }
    if (!startDate) { toast.error(t('assign.startDateRequired')); return; }
    createAssignment.mutate({
      template_id: template.id,
      assigned_to: staffId,
      branch_id: template.branch_id,
      periodicity,
      start_date: startDate,
      end_date: endDate || null,
      notes: notes.trim() || null,
      created_by: user?.id || null,
    }, {
      onSuccess: () => {
        toast.success(t('checklists.assigned'));
        setOpen(false);
        resetForm();
      },
      onError: () => toast.error(t('checklists.failAssign')),
    });
  };

  const resetForm = () => {
    setStaffId(''); setPeriodicity('once');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(''); setNotes('');
  };

  const formatUserLabel = (s: any) => {
    const name = s.full_name || s.email || 'Unknown';
    const dept = s.department ? t(`departments.${s.department}`) : '';
    const pos = s.position || '';
    return [name, pos, dept].filter(Boolean).join(' – ');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={e => e.stopPropagation()}>
          <Users className="h-3.5 w-3.5 mr-1" /> {t('assign.assignChecklist')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('assign.assignChecklist')}</DialogTitle>
          <DialogDescription>{t('assign.assignDesc', { title: template.title })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('assign.assignTo')}</Label>
            {staffLoading ? (
              <p className="text-sm text-muted-foreground py-2">{t('common.loading')}</p>
            ) : staffError ? (
              <p className="text-sm text-destructive py-2 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> {t('assign.loadError')}
              </p>
            ) : sortedStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">{t('assign.noUsers')}</p>
            ) : (
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder={t('assign.selectUser')} /></SelectTrigger>
                <SelectContent>
                  {sortedStaff.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{formatUserLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label>{t('assign.periodicity')}</Label>
            <Select value={periodicity} onValueChange={setPeriodicity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="once">{t('assign.oneTime')}</SelectItem>
                <SelectItem value="daily">{t('assign.daily')}</SelectItem>
                <SelectItem value="weekly">{t('assign.weekly')}</SelectItem>
                <SelectItem value="biweekly">{t('assign.biweekly')}</SelectItem>
                <SelectItem value="monthly">{t('assign.monthly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('assign.startDate')}</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>{t('assign.endDate')}</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} />
            </div>
          </div>

          <div>
            <Label>{t('assign.notes')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={t('assign.notesPlaceholder')} className="resize-none h-20" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('checklists.cancel')}</Button>
          <Button onClick={handleAssign} disabled={createAssignment.isPending || !staffId || !startDate}>
            {createAssignment.isPending ? t('checklists.assigning') : t('assign.assignChecklist')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ViewAssignmentsDialog({ templateId, templateTitle }: { templateId: string; templateTitle: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: assignments, isLoading } = useTemplateAssignments(open ? templateId : null);

  const statusColor = (s: string) => {
    if (s === 'active') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (s === 'paused') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-muted text-muted-foreground';
  };

  const periodicityLabel = (p: string) => {
    const map: Record<string, string> = { once: t('assign.oneTime'), daily: t('assign.daily'), weekly: t('assign.weekly'), biweekly: t('assign.biweekly'), monthly: t('assign.monthly') };
    return map[p] || p;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={e => e.stopPropagation()}>
          <Eye className="h-3.5 w-3.5 mr-1" /> {t('assign.viewAssignments')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('assign.manageAssignments')}</DialogTitle>
          <DialogDescription>{templateTitle}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : !assignments?.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('assign.noAssignments')}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('assign.assignedUser')}</TableHead>
                  <TableHead>{t('assign.periodicity')}</TableHead>
                  <TableHead>{t('assign.startDate')}</TableHead>
                  <TableHead>{t('assign.endDate')}</TableHead>
                  <TableHead>{t('assign.statusLabel')}</TableHead>
                  <TableHead>{t('assign.createdBy')}</TableHead>
                  <TableHead>{t('assign.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.assigned_profile?.full_name || '—'}
                      {a.assigned_profile?.position && (
                        <span className="block text-xs text-muted-foreground">{a.assigned_profile.position}</span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{periodicityLabel(a.periodicity)}</TableCell>
                    <TableCell>{a.start_date}</TableCell>
                    <TableCell>{a.end_date || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs capitalize ${statusColor(a.status)}`}>
                        {a.status === 'active' ? t('assign.active') : a.status === 'paused' ? t('assign.paused') : t('assign.ended')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{a.created_by_profile?.full_name || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
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
  const { data: assignmentCounts } = useAllTemplateAssignmentCounts();
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
            const activeCount = assignmentCounts?.get(tpl.id) || 0;

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
                        </p>
                        {activeCount > 0 && (
                          <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {t('assign.activeAssignments', { count: activeCount })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <Badge variant="outline" className="capitalize text-xs">{tpl.checklist_type}</Badge>
                      <ViewAssignmentsDialog templateId={tpl.id} templateTitle={tpl.title} />
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
