import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ImportPreview, ImportTemplatePreview } from '@/utils/checklistExcel';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preview: ImportPreview | null;
  onImported: () => void;
};

export default function ImportTemplatesPreviewDialog({ open, onOpenChange, preview, onImported }: Props) {
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);

  if (!preview) return null;

  const importable = preview.templates.filter((t) => t.errors.length === 0);
  const blocked = preview.totals.blockingErrors > 0 || importable.length === 0;

  const handleConfirm = async () => {
    if (blocked) return;
    setImporting(true);
    const summary = {
      templatesCreated: 0,
      templatesUpdated: 0,
      tasksAdded: 0,
      tasksUpdated: 0,
      tasksArchived: 0,
      tasksSkipped: 0,
    };
    const failures: string[] = [];

    for (const tpl of importable) {
      try {
        const result = await applyTemplateImport(tpl, user?.id ?? null);
        if (tpl.action === 'create') summary.templatesCreated += 1;
        else summary.templatesUpdated += 1;
        summary.tasksAdded += result.tasksAdded;
        summary.tasksUpdated += result.tasksUpdated;
        summary.tasksArchived += result.tasksArchived;
        summary.tasksSkipped += result.tasksSkipped;
      } catch (err: any) {
        failures.push(`${tpl.code}: ${err?.message || 'failed'}`);
      }
    }

    setImporting(false);
    if (failures.length) {
      toast.error(`Some templates failed: ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '…' : ''}`);
    } else {
      toast.success(
        `Templates: ${summary.templatesCreated} created, ${summary.templatesUpdated} updated. ` +
        `Tasks: ${summary.tasksAdded} added, ${summary.tasksUpdated} updated, ${summary.tasksArchived} archived` +
        (summary.tasksSkipped ? `, ${summary.tasksSkipped} skipped` : '') + '.'
      );
    }
    onImported();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Import</DialogTitle>
          <DialogDescription>
            Review what will be imported. Nothing is written until you click Confirm Import.
          </DialogDescription>
        </DialogHeader>

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <Stat label="Templates detected" value={preview.totals.detected} />
          <Stat label="To create" value={preview.totals.toCreate} tone="success" />
          <Stat label="To update" value={preview.totals.toUpdate} tone="info" />
          <Stat label="Total task rows" value={preview.totals.totalTaskRows} />
          <Stat label="Rows with missing fields" value={preview.totals.rowsWithMissingFields} tone={preview.totals.rowsWithMissingFields ? 'warn' : 'muted'} />
          <Stat label="Blocking errors" value={preview.totals.blockingErrors} tone={preview.totals.blockingErrors ? 'error' : 'success'} />
        </div>

        {preview.globalErrors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-1">
            {preview.globalErrors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
          <div className="space-y-2 py-2">
            {preview.templates.map((tpl) => (
              <TemplateRow key={tpl.code} tpl={tpl} />
            ))}
            {!preview.templates.length && (
              <p className="text-sm text-muted-foreground text-center py-6">No templates detected in this file.</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={blocked || importing}>
            {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…</> : `Confirm Import (${importable.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone = 'muted' }: { label: string; value: number; tone?: 'muted' | 'success' | 'info' | 'warn' | 'error' }) {
  const cls = {
    muted: 'bg-muted/40 text-foreground',
    success: 'bg-primary/10 text-primary',
    info: 'bg-secondary/40 text-foreground',
    warn: 'bg-accent/40 text-accent-foreground',
    error: 'bg-destructive/10 text-destructive',
  }[tone];
  return (
    <div className={`rounded-md border p-2 ${cls}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function TemplateRow({ tpl }: { tpl: ImportTemplatePreview }) {
  const hasErrors = tpl.errors.length > 0;
  return (
    <div className={`rounded-md border p-3 ${hasErrors ? 'border-destructive/40 bg-destructive/5' : 'bg-card'}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs">{tpl.code}</span>
            <span className="font-medium truncate">{tpl.title || <em className="text-muted-foreground">no name</em>}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {tpl.branch_name || '—'} · {tpl.department || '—'} · {tpl.checklist_type || '—'} · due {tpl.default_due_time || '—'} · {tpl.tasks.length} task(s)
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {tpl.action === 'create' ? (
            <Badge variant="outline" className="text-[10px]"><PlusCircle className="h-3 w-3 mr-1" /> Create</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]"><RefreshCw className="h-3 w-3 mr-1" /> Update</Badge>
          )}
          {hasErrors ? (
            <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" /> Blocked</Badge>
          ) : (
            <Badge className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Ready</Badge>
          )}
        </div>
      </div>
      {hasErrors && (
        <ul className="mt-2 text-xs text-destructive space-y-0.5">
          {tpl.errors.map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}
    </div>
  );
}

// ─── Apply one template (create or update + replace tasks) ───

type ApplyResult = {
  tasksAdded: number;
  tasksUpdated: number;
  tasksArchived: number;
  tasksSkipped: number;
};

async function applyTemplateImport(tpl: ImportTemplatePreview, userId: string | null): Promise<ApplyResult> {
  const result: ApplyResult = { tasksAdded: 0, tasksUpdated: 0, tasksArchived: 0, tasksSkipped: 0 };

  // Find existing template by code (if any).
  const { data: existing, error: findErr } = await supabase
    .from('checklist_templates')
    .select('id')
    .eq('code', tpl.code)
    .maybeSingle();
  if (findErr) throw findErr;

  const templatePayload = {
    title: tpl.title,
    code: tpl.code,
    branch_id: tpl.branch_id,
    department: tpl.department as any,
    checklist_type: tpl.checklist_type as any,
    default_due_time: tpl.default_due_time.length === 5 ? `${tpl.default_due_time}:00` : tpl.default_due_time,
    is_active: tpl.is_active,
  };

  let templateId: string;
  let isNewTemplate = false;
  if (existing) {
    templateId = existing.id;
    const { error: updErr } = await supabase
      .from('checklist_templates')
      .update(templatePayload)
      .eq('id', templateId);
    if (updErr) throw updErr;
  } else {
    const { data: created, error: insErr } = await supabase
      .from('checklist_templates')
      .insert({ ...templatePayload, created_by: userId } as any)
      .select('id')
      .single();
    if (insErr) throw insErr;
    templateId = created.id;
    isNewTemplate = true;
  }

  // Build the desired task list from the import file.
  const desiredTasks = tpl.tasks.map((t, idx) => ({
    title: t.instruction ? `${t.title}\n${t.instruction}` : t.title,
    sort_order: t.task_no ?? idx,
    photo_requirement: (t.photo_required ? 'mandatory' : 'none') as 'mandatory' | 'none',
    note_requirement: (t.note_required ? 'mandatory' : 'none') as 'mandatory' | 'none',
  }));

  // Fast path: brand-new template — just insert all tasks.
  if (isNewTemplate) {
    if (desiredTasks.length) {
      const { error: tErr } = await supabase
        .from('checklist_template_tasks')
        .insert(
          desiredTasks.map((t) => ({
            template_id: templateId,
            title: t.title,
            sort_order: t.sort_order,
            photo_requirement: t.photo_requirement as any,
            note_requirement: t.note_requirement as any,
            is_active: true,
          })) as any
        );
      if (tErr) throw tErr;
      result.tasksAdded += desiredTasks.length;
    }
    return result;
  }

  // ─── Diff-merge mode for existing template ───

  // Load current active tasks for this template.
  const { data: existingTasks, error: exErr } = await supabase
    .from('checklist_template_tasks')
    .select('id, title, sort_order, photo_requirement, note_requirement, is_active')
    .eq('template_id', templateId);
  if (exErr) throw exErr;

  const existingActive = (existingTasks ?? []).filter((t) => t.is_active);

  // Bulk-load completion counts for these tasks.
  const taskIds = existingActive.map((t) => t.id);
  const historyMap = new Map<string, number>();
  if (taskIds.length) {
    const { data: comps, error: cErr } = await supabase
      .from('checklist_task_completions')
      .select('task_id')
      .in('task_id', taskIds);
    if (cErr) throw cErr;
    for (const c of comps ?? []) {
      historyMap.set(c.task_id, (historyMap.get(c.task_id) ?? 0) + 1);
    }
  }
  const hasHistory = (id: string) => (historyMap.get(id) ?? 0) > 0;

  // Match desired vs existing by sort_order (stable key from import).
  const existingBySort = new Map<number, typeof existingActive[number]>();
  for (const t of existingActive) existingBySort.set(t.sort_order, t);

  const desiredSortKeys = new Set(desiredTasks.map((t) => t.sort_order));

  // 1) Process tasks present in the import file.
  for (const want of desiredTasks) {
    const current = existingBySort.get(want.sort_order);
    if (!current) {
      // New task → insert.
      const { error } = await supabase.from('checklist_template_tasks').insert({
        template_id: templateId,
        title: want.title,
        sort_order: want.sort_order,
        photo_requirement: want.photo_requirement as any,
        note_requirement: want.note_requirement as any,
        is_active: true,
      } as any);
      if (error) throw error;
      result.tasksAdded += 1;
      continue;
    }

    const changed =
      current.title !== want.title ||
      current.photo_requirement !== want.photo_requirement ||
      current.note_requirement !== want.note_requirement;

    if (!changed) continue;

    if (!hasHistory(current.id)) {
      // Safe in-place update.
      const { error } = await supabase
        .from('checklist_template_tasks')
        .update({
          title: want.title,
          photo_requirement: want.photo_requirement as any,
          note_requirement: want.note_requirement as any,
        })
        .eq('id', current.id);
      if (error) throw error;
      result.tasksUpdated += 1;
    } else {
      // Has history → archive old, insert new version preserving sort_order.
      const { error: archErr } = await supabase
        .from('checklist_template_tasks')
        .update({ is_active: false })
        .eq('id', current.id);
      if (archErr) throw archErr;
      result.tasksArchived += 1;

      const { error: insErr } = await supabase.from('checklist_template_tasks').insert({
        template_id: templateId,
        title: want.title,
        sort_order: want.sort_order,
        photo_requirement: want.photo_requirement as any,
        note_requirement: want.note_requirement as any,
        is_active: true,
      } as any);
      if (insErr) throw insErr;
      result.tasksAdded += 1;
    }
  }

  // 2) Tasks that exist but are no longer in the import file.
  for (const current of existingActive) {
    if (desiredSortKeys.has(current.sort_order)) continue;
    if (hasHistory(current.id)) {
      const { error } = await supabase
        .from('checklist_template_tasks')
        .update({ is_active: false })
        .eq('id', current.id);
      if (error) throw error;
      result.tasksArchived += 1;
    } else {
      const { error } = await supabase
        .from('checklist_template_tasks')
        .delete()
        .eq('id', current.id);
      if (error) {
        // FK or other issue — fall back to archive so import still completes.
        const { error: aErr } = await supabase
          .from('checklist_template_tasks')
          .update({ is_active: false })
          .eq('id', current.id);
        if (aErr) {
          result.tasksSkipped += 1;
          continue;
        }
        result.tasksArchived += 1;
      }
    }
  }

  return result;
}