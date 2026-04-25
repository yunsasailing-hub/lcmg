import { useState, useRef } from 'react';
import { Plus, Trash2, GripVertical, ClipboardList, Users, Camera, MessageSquare, Download, Upload, ChevronDown, ChevronUp, Circle, CalendarIcon, Loader2, Eye } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
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
import { supabase } from '@/integrations/supabase/client';
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  useDeleteTemplateTask,
  useActiveUsersForAssignment,
  useCreateAssignment,
  useBranches,
  useSetTemplateActive,
  type PhotoRequirement,
  type ChecklistType,
  type Department,
  type NoteRequirement,
} from '@/hooks/useChecklists';
import { Constants } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';
import { exportTemplatesToXlsx, parseImportPreview, type ImportPreview } from '@/utils/checklistExcel';
import { useAssignmentCountByTemplate } from '@/hooks/useAssignments';
import AssignmentManager from '@/components/checklists/AssignmentManager';
import WarningRecipientsField from '@/components/checklists/WarningRecipientsField';
import BranchSelect from '@/components/checklists/BranchSelect';
import ImportTemplatesPreviewDialog from '@/components/checklists/ImportTemplatesPreviewDialog';
import { TemplateCodeBadge } from '@/components/checklists/TemplateCodeBadge';

const DEFAULT_DUE_TIMES: Record<ChecklistType, string> = {
  opening: '10:00',
  afternoon: '16:00',
  closing: '22:30',
};

// ─── Template Code helpers ───

const BRANCH_CODE_MAP: Record<string, string> = {
  'la cala': 'LCL',
  'la cala mare': 'LCM',
  'bottega26': 'B26',
  'bottega 26': 'B26',
};

const DEPARTMENT_CODE_MAP: Record<Department, string> = {
  pizza: 'PIZ',
  kitchen: 'KIT',
  service: 'SER',
  bar: 'BAR',
  management: 'MGT',
  office: 'OFF',
  bakery: 'BAK',
};

const TEMPLATE_CODE_REGEX = /^[A-Z0-9]{2,4}-[A-Z]{2,4}-\d{3}$/;

function suggestTemplatePrefix(branchName: string | null | undefined, department: Department): string {
  const b = BRANCH_CODE_MAP[(branchName || '').trim().toLowerCase()] || (branchName?.slice(0, 3).toUpperCase() ?? 'XXX');
  const d = DEPARTMENT_CODE_MAP[department] || 'XXX';
  return `${b}-${d}-`;
}

/** Returns the next progressive number for a given prefix (LCL-PIZ-) → "001". */
function nextProgressive(prefix: string, existingCodes: (string | null | undefined)[]): string {
  const used = existingCodes
    .filter((c): c is string => !!c && c.toUpperCase().startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return String(next).padStart(3, '0');
}

// ─── Create Template Dialog ───

function CreateTemplateDialog({ onCreated, existingTemplates, branches }: { onCreated: () => void; existingTemplates: any[]; branches: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [type, setType] = useState<ChecklistType>('opening');
  const [department, setDepartment] = useState<Department>('kitchen');
  const [dueTime, setDueTime] = useState(DEFAULT_DUE_TIMES['opening']);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [tasks, setTasks] = useState<{
    title: string;
    instructions: string;
    photo_requirement: PhotoRequirement;
    note_requirement: NoteRequirement;
    is_active: boolean;
  }[]>([
    { title: '', instructions: '', photo_requirement: 'none', note_requirement: 'none', is_active: true },
  ]);

  const create = useCreateTemplate();

  // Auto-suggest code from branch+department until user manually edits the code field.
  const branchName = branches.find((b) => b.id === branchId)?.name;
  const suggestedPrefix = suggestTemplatePrefix(branchName, department);
  const suggestedCode = branchId
    ? `${suggestedPrefix}${nextProgressive(suggestedPrefix, existingTemplates.map((t: any) => t.code))}`
    : '';
  const effectiveCode = codeManuallyEdited ? code : suggestedCode;

  const addTask = () => setTasks(prev => [
    ...prev,
    { title: '', instructions: '', photo_requirement: 'none', note_requirement: 'none', is_active: true },
  ]);
  const removeTask = (idx: number) => setTasks(prev => prev.filter((_, i) => i !== idx));
  const updateTask = (idx: number, field: string, value: string | boolean) =>
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));

  const handleCreate = () => {
    if (!title.trim()) { toast.error('Template title is required'); return; }
    const codeTrim = effectiveCode.trim().toUpperCase();
    if (!codeTrim) { toast.error('Template Code is required'); return; }
    if (!TEMPLATE_CODE_REGEX.test(codeTrim)) {
      toast.error('Template Code must look like XXX-XXX-001');
      return;
    }
    const duplicate = existingTemplates.some(
      (t: any) => (t.code || '').toUpperCase() === codeTrim,
    );
    if (duplicate) {
      toast.error('Template Code already exists. Please use a different code.');
      return;
    }
    if (!branchId) { toast.error('Branch is required'); return; }
    const validTasks = tasks.filter(t => t.title.trim());
    if (!validTasks.length) { toast.error('Add at least one task'); return; }

    create.mutate({
      template: {
        title: title.trim(),
        code: codeTrim,
        checklist_type: type,
        department,
        branch_id: branchId,
        default_due_time: dueTime + ':00',
        is_active: isActive,
      },
      tasks: validTasks.map((t, i) => ({
        title: t.instructions.trim()
          ? `${t.title.trim()}\n${t.instructions.trim()}`
          : t.title.trim(),
        sort_order: i,
        photo_requirement: t.photo_requirement,
        note_requirement: t.note_requirement,
        is_active: t.is_active,
      })),
    }, {
      onSuccess: () => {
        toast.success('Template created!');
        setOpen(false);
        resetForm();
        onCreated();
      },
      onError: (err: any) => {
        const msg = err?.message || '';
        if (msg.includes('checklist_templates_code_unique') || msg.toLowerCase().includes('duplicate')) {
          toast.error('Template Code already exists. Please use a different code.');
        } else {
          toast.error('Failed to create template');
        }
      },
    });
  };

  const resetForm = () => {
    setTitle('');
    setCode('');
    setCodeManuallyEdited(false);
    setType('opening');
    setDepartment('kitchen');
    setDueTime(DEFAULT_DUE_TIMES['opening']);
    setBranchId(null);
    setIsActive(true);
    setTasks([{ title: '', instructions: '', photo_requirement: 'none', note_requirement: 'none', is_active: true }]);
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

          <div>
            <Label>Template Code *</Label>
            <Input
              value={effectiveCode}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeManuallyEdited(true); }}
              placeholder="e.g. LCL-PIZ-001"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Format: BRANCH-DEPT-### (e.g. LCL-PIZ-001). Auto-suggested from branch &amp; department.
              {codeManuallyEdited && (
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => { setCodeManuallyEdited(false); setCode(''); }}
                >
                  Reset to suggested
                </button>
              )}
            </p>
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
            <Label>Branch *</Label>
            <BranchSelect value={branchId} onChange={setBranchId} placeholder="Select branch…" />
            <p className="text-xs text-muted-foreground mt-1">
              Branch is part of the template identity and cannot be changed later.
              To use the same checklist on another branch, create a new template.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive templates can't be assigned.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
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
                  <div className="flex flex-col items-center pt-1.5 shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">{idx + 1}</span>
                    <GripVertical className="h-4 w-4 text-muted-foreground mt-1" />
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <Input
                      value={task.title}
                      onChange={e => updateTask(idx, 'title', e.target.value)}
                      placeholder={`Task ${idx + 1} title`}
                      className="h-8 text-sm"
                    />
                    <Textarea
                      value={task.instructions}
                      onChange={e => updateTask(idx, 'instructions', e.target.value)}
                      placeholder="Instructions / notes (optional)"
                      rows={2}
                      className="text-xs"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Select value={task.photo_requirement} onValueChange={v => updateTask(idx, 'photo_requirement', v)}>
                        <SelectTrigger className="h-7 text-xs w-36">
                          <Camera className="h-3 w-3 mr-1" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Photo: No</SelectItem>
                          <SelectItem value="optional">Photo: Optional</SelectItem>
                          <SelectItem value="mandatory">Photo: Required</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={task.note_requirement} onValueChange={v => updateTask(idx, 'note_requirement', v)}>
                        <SelectTrigger className="h-7 text-xs w-36">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Note: No</SelectItem>
                          <SelectItem value="optional">Note: Optional</SelectItem>
                          <SelectItem value="mandatory">Note: Required</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                        <Switch
                          checked={task.is_active}
                          onCheckedChange={(v) => updateTask(idx, 'is_active', v)}
                        />
                        Active
                      </label>
                    </div>
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
  const [warningRecipientUserIds, setWarningRecipientUserIds] = useState<string[]>(
    Array.isArray(template?.warning_recipient_user_ids) ? template.warning_recipient_user_ids : []
  );

  const { data: users, isLoading: usersLoading, isError: usersError } = useActiveUsersForAssignment({ enabled: open });
  const { data: branches } = useBranches();
  const createAssignment = useCreateAssignment();

  const templateBranchId: string | null = template?.branch_id ?? null;
  const templateBranchName = branches?.find((b) => b.id === templateBranchId)?.name ?? null;
  const branchMissing = !templateBranchId;

  // Sort users: same department first
  const sortedUsers = [...(users || [])].sort((a, b) => {
    const aDept = a.department === template.department ? 0 : 1;
    const bDept = b.department === template.department ? 0 : 1;
    if (aDept !== bDept) return aDept - bDept;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  const handleAssign = () => {
    if (branchMissing) {
      toast.error('This template has no branch. Please create a new template with a branch selected.');
      return;
    }
    if (!userId) { toast.error('Select a user'); return; }
    if (!startDate) { toast.error('Select a start date'); return; }
    if (endDate && endDate < startDate) { toast.error('End date cannot be before start date'); return; }

    createAssignment.mutate({
      template_id: template.id,
      assigned_to: userId,
      periodicity,
      start_date: format(startDate, 'yyyy-MM-dd'),
      end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
      notes: notes.trim() || null,
      branch_id: templateBranchId,
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

          {/* Branch */}
          <div>
            <Label>Branch</Label>
            {branchMissing ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                This template has no branch. Please create a new template with a branch selected.
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 p-2 text-sm">
                <Badge variant="outline" className="normal-case">{templateBranchName ?? 'Unknown'}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  Inherited from the template and cannot be changed.
                </p>
              </div>
            )}
          </div>

          <WarningRecipientsField
            value={warningRecipientUserIds}
            onChange={setWarningRecipientUserIds}
            preferredBranchId={template?.branch_id || null}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleAssign} disabled={createAssignment.isPending || !userId || branchMissing}>
            {createAssignment.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ───

export default function TemplateManager() {
  const { hasAnyRole } = useAuth();
  const canManageTemplates = hasAnyRole(['owner', 'manager']);
  const isOwner = hasAnyRole(['owner']);
  // Owner sees all templates (active + inactive); other roles only see active.
  const { data: templates, isLoading, refetch } = useTemplates(undefined, isOwner ? 'all' : 'active');
  const { data: branches } = useBranches();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const deleteTask = useDeleteTemplateTask();
  const setTemplateActive = useSetTemplateActive();
  const { data: assignmentCounts } = useAssignmentCountByTemplate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assignmentManagerTemplate, setAssignmentManagerTemplate] = useState<{ id: string; title: string; code: string | null } | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parsing, setParsing] = useState(false);

  const handleExport = async () => {
    try {
      console.log('[ChecklistExport] starting export');

      // 1. Session check — no edge function involved.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        toast.error('Your session expired. Please sign in again.');
        return;
      }
      console.log('[ChecklistExport] user/session checked');

      // 2. Owner-only gate (uses local roles from useAuth, backed by has_role RPC).
      if (!isOwner) {
        toast.error('Only Owner can export checklist templates.');
        return;
      }
      console.log('[ChecklistExport] owner permission passed');

      if (!templates?.length) {
        toast.error('No templates to export');
        return;
      }

      await exportTemplatesToXlsx(templates);
      console.log('[ChecklistExport] export generated');
      toast.success('Checklist templates exported for review. Missing fields are left empty.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ChecklistExport] failed:', msg);
      if (/session expired|jwt|not authenticated|unauthorized/i.test(msg)) {
        toast.error('Your session expired. Please sign in again.');
      } else {
        toast.error(msg || 'Export failed');
      }
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isOwner) {
      toast.error('Only Owner can import checklist templates.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setParsing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        toast.error('Your session expired. Please sign in again.');
        return;
      }
      const preview = await parseImportPreview(file);
      setImportPreview(preview);
      setPreviewOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Could not read import file');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  const handleToggleActive = (templateId: string, isActive: boolean) => {
    setTemplateActive.mutate(
      { templateId, isActive },
      {
        onSuccess: () => toast.success(isActive ? 'Template set to Active' : 'Template set to Inactive'),
        onError: (err: any) => toast.error(err?.message || 'Failed to update template status'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Checklist Templates</h3>
        <div className="flex items-center gap-2">
          {isOwner && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> Export Templates for Review
            </Button>
          )}
          {isOwner && (
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
              <Upload className="h-4 w-4 mr-1" /> {parsing ? 'Reading…' : 'Import'}
            </Button>
          )}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <CreateTemplateDialog
            onCreated={() => refetch()}
            existingTemplates={templates ?? []}
            branches={branches ?? []}
          />
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
        <div className="space-y-3">
          {templates.map(tpl => {
            const tasks = (tpl as any).tasks || [];
            const taskCount = tasks.length;
            const isExpanded = expandedId === tpl.id;
            const aCount = assignmentCounts?.[tpl.id] || 0;
            const branchName = branches?.find((b) => b.id === (tpl as any).branch_id)?.name;
            const branchMissing = !(tpl as any).branch_id;
            const isTplActive = (tpl as any).is_active !== false;

            return (
              <div key={tpl.id} className="rounded-lg border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : tpl.id)}
                  className="w-full p-4 sm:p-5 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="flex flex-col gap-3">
                    {/* Row 1: title + chevron */}
                    <div className="flex items-start gap-2 min-w-0">
                      {isExpanded ? <ChevronUp className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="mb-1.5">
                          <TemplateCodeBadge code={(tpl as any).code} />
                        </div>
                        <p className="font-heading font-semibold text-base sm:text-lg text-foreground leading-snug break-words line-clamp-2">
                          {(tpl as any).code ? (
                            <>
                              <span className="font-mono text-muted-foreground">{(tpl as any).code}</span>
                              <span className="text-muted-foreground"> · </span>
                            </>
                          ) : null}
                          {tpl.title}
                        </p>
                      </div>
                    </div>

                    {/* Row 2: details on separate lines */}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm pl-7">
                      <div className="flex gap-1.5">
                        <dt className="text-muted-foreground">Branch:</dt>
                        <dd className={cn('font-medium', branchMissing && 'text-destructive')}>
                          {branchMissing ? 'Missing — recreate template' : (branchName ?? 'Unknown')}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted-foreground">Department:</dt>
                        <dd className="font-medium capitalize">{tpl.department}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted-foreground">Type:</dt>
                        <dd className="font-medium capitalize">{tpl.checklist_type}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted-foreground">Due time:</dt>
                        <dd className="font-medium">{(tpl as any).default_due_time?.slice(0, 5) ?? '—'}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted-foreground">Tasks:</dt>
                        <dd className="font-medium">{taskCount}</dd>
                      </div>
                      {aCount > 0 && (
                        <div className="flex gap-1.5">
                          <dt className="text-muted-foreground">Assignments:</dt>
                          <dd className="font-medium">{aCount}</dd>
                        </div>
                      )}
                    </dl>

                    {/* Row 3: status + actions */}
                    <div
                      className="flex flex-wrap items-center gap-2 pl-7"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      <Badge
                        variant={isTplActive ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {isTplActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {isOwner && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch
                            checked={isTplActive}
                            disabled={setTemplateActive.isPending}
                            onCheckedChange={(v) => handleToggleActive(tpl.id, v)}
                            aria-label={isTplActive ? 'Set template inactive' : 'Set template active'}
                          />
                          ON / OFF
                        </label>
                      )}
                      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                        {aCount > 0 && (
                          <Button variant="outline" size="sm" onClick={() => setAssignmentManagerTemplate({ id: tpl.id, title: tpl.title, code: (tpl as any).code ?? null })}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> View Assignments
                          </Button>
                        )}
                        {isTplActive && <AssignDialog template={tpl} />}
                      </div>
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t px-4 pb-3 pt-2 space-y-1.5">
                    {tasks.length > 0 ? tasks.map((task: any, idx: number) => (
                      <div key={task.id || idx} className="flex items-center gap-2 text-sm group">
                        <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-foreground">{task.title}</span>
                        {(task.photo_requirement === 'mandatory' || task.photo_requirement === true) && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            📸 Photo required
                          </Badge>
                        )}
                        {(task.note_requirement === 'mandatory' || task.note_requirement === true) && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            📝 Note required
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
          templateCode={assignmentManagerTemplate.code}
          open={!!assignmentManagerTemplate}
          onOpenChange={(open) => { if (!open) setAssignmentManagerTemplate(null); }}
        />
      )}

      <ImportTemplatesPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        preview={importPreview}
        onImported={() => {
          setImportPreview(null);
          refetch();
        }}
      />
    </div>
  );
}
