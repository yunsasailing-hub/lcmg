import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  useIngredients, useIngredientTypes, useRecipeCategories, useRecipeUnits, useStorehouses,
} from '@/hooks/useIngredients';
import {
  ACTION_LABEL,
  COLUMNS,
  readFileAsRows,
  validateRows,
  type ImportRow,
  type ImportSummary,
  type RowAction,
  type RowSeverity,
} from '@/lib/ingredientImportExport';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SEVERITY_LABEL: Record<RowSeverity, string> = {
  valid: 'VALID',
  warning: 'WARNING',
  invalid: 'INVALID',
};

export default function IngredientImportDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ingredients = [] } = useIngredients(true);
  const { data: types = [] } = useIngredientTypes(true);
  const { data: categories = [] } = useRecipeCategories(true);
  const { data: units = [] } = useRecipeUnits(true);
  const { data: storehouses = [] } = useStorehouses(true);

  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'all' | RowSeverity>('all');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [failures, setFailures] = useState<{ rowNumber: number; code: string; error: string }[]>([]);

  const counts = useMemo(() => {
    const c = { valid: 0, warning: 0, invalid: 0, create: 0, update: 0 };
    for (const r of rows) {
      c[r.severity]++;
      if (r.action === 'create') c.create++;
      else if (r.action === 'update') c.update++;
    }
    return c;
  }, [rows]);

  const visibleRows = useMemo(
    () => (tab === 'all' ? rows : rows.filter((r) => r.severity === tab)),
    [rows, tab],
  );

  const reset = () => {
    setStep('upload');
    setFileName('');
    setRows([]);
    setSummary(null);
    setFailures([]);
    setTab('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const fileRows = await readFileAsRows(file);
      if (fileRows.length === 0) {
        toast({
          title: t('common.error'),
          description: 'No data rows found in file.',
          variant: 'destructive',
        });
        return;
      }
      const validated = validateRows(fileRows, {
        ingredients,
        types,
        categories,
        units,
        storehouses,
      });
      setFileName(file.name);
      setRows(validated);
      setStep('preview');
    } catch (e) {
      toast({
        title: t('common.error'),
        description: (e as Error).message ?? 'Failed to parse file.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const confirmImport = async () => {
    setBusy(true);
    let created = 0;
    let updated = 0;
    let failed = 0;
    const skipped = rows.filter((r) => r.severity === 'invalid').length;
    const localFailures: typeof failures = [];

    for (const r of rows) {
      if (r.severity === 'invalid' || !r.parsed) continue;
      try {
        if (r.existingId) {
          const { error } = await supabase
            .from('ingredients')
            .update({ ...r.parsed, updated_by: user?.id ?? null })
            .eq('id', r.existingId);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase
            .from('ingredients')
            .insert({ ...r.parsed, created_by: user?.id ?? null });
          if (error) throw error;
          created++;
        }
      } catch (e) {
        failed++;
        localFailures.push({
          rowNumber: r.rowNumber,
          code: r.parsed?.code ?? '',
          error: (e as Error).message ?? 'Unknown error',
        });
      }
    }

    const result: ImportSummary = {
      total: rows.length,
      created,
      updated,
      skipped,
      failed,
    };

    // Audit log (best-effort)
    try {
      await supabase.from('recipe_import_logs').insert({
        entity: 'ingredient',
        operation: 'import',
        total_rows: result.total,
        success_rows: created + updated,
        error_rows: skipped + failed,
        performed_by: user?.id ?? null,
        details: {
          file_name: fileName,
          created,
          updated,
          skipped,
          failed,
          failures: localFailures.slice(0, 100),
        },
      });
    } catch {
      /* non-blocking */
    }

    setSummary(result);
    setFailures(localFailures);
    setStep('result');
    setBusy(false);
    qc.invalidateQueries({ queryKey: ['ingredients'] });

    toast({
      title: 'Import complete',
      description: `Created ${created} · Updated ${updated} · Skipped ${skipped} · Failed ${failed}`,
    });
  };

  const sevBadge = (s: RowSeverity) => {
    const cls =
      s === 'valid'
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        : s === 'warning'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
          : 'bg-destructive/15 text-destructive border-destructive/30';
    return (
      <Badge variant="outline" className={cls}>
        {SEVERITY_LABEL[s]}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Ingredients
          </DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx) or CSV file. Values are matched case-insensitively against
            active option lists. Rows with missing required fields or invalid options are skipped.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <div className="rounded-full bg-muted p-6">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">Choose a spreadsheet to import</p>
              <p className="text-sm text-muted-foreground">
                Accepted formats: .xlsx, .csv · Required columns: {COLUMNS.id}, {COLUMNS.name},{' '}
                {COLUMNS.type}, {COLUMNS.category}, {COLUMNS.unit}, {COLUMNS.active}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={onPickFile}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4" />
              {busy ? 'Reading…' : 'Select file'}
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 flex flex-col min-h-0 gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{fileName}</span>
              <span className="text-muted-foreground">·</span>
              <span>{rows.length} rows</span>
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3" /> {counts.valid} valid
              </Badge>
              <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                <AlertTriangle className="h-3 w-3" /> {counts.warning} warnings
              </Badge>
              <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
                <AlertCircle className="h-3 w-3" /> {counts.invalid} invalid
              </Badge>
              <span className="ml-auto text-muted-foreground">
                Will create {counts.create} · update {counts.update}
              </span>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
                <TabsTrigger value="valid">Valid ({counts.valid})</TabsTrigger>
                <TabsTrigger value="warning">Warnings ({counts.warning})</TabsTrigger>
                <TabsTrigger value="invalid">Invalid ({counts.invalid})</TabsTrigger>
              </TabsList>
              <TabsContent value={tab} className="mt-3">
                <ScrollArea className="h-[50vh] rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead className="w-20">Action</TableHead>
                        <TableHead>{COLUMNS.id}</TableHead>
                        <TableHead>{COLUMNS.name}</TableHead>
                        <TableHead>{COLUMNS.type}</TableHead>
                        <TableHead>{COLUMNS.category}</TableHead>
                        <TableHead>{COLUMNS.unit}</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((r) => (
                        <TableRow key={r.rowNumber}>
                          <TableCell className="text-xs text-muted-foreground">{r.rowNumber}</TableCell>
                          <TableCell>{sevBadge(r.severity)}</TableCell>
                          <TableCell className="text-xs uppercase">{r.action}</TableCell>
                          <TableCell className="font-mono text-xs">{r.raw[COLUMNS.id]}</TableCell>
                          <TableCell className="text-sm">{r.raw[COLUMNS.name]}</TableCell>
                          <TableCell className="text-sm">{r.raw[COLUMNS.type]}</TableCell>
                          <TableCell className="text-sm">{r.raw[COLUMNS.category]}</TableCell>
                          <TableCell className="text-sm">{r.raw[COLUMNS.unit]}</TableCell>
                          <TableCell className="text-xs">
                            {r.errors.length > 0 && (
                              <ul className="list-disc list-inside text-destructive space-y-0.5">
                                {r.errors.map((e, i) => (
                                  <li key={`e${i}`}>{e}</li>
                                ))}
                              </ul>
                            )}
                            {r.warnings.length > 0 && (
                              <ul className="list-disc list-inside text-amber-600 dark:text-amber-400 space-y-0.5">
                                {r.warnings.map((w, i) => (
                                  <li key={`w${i}`}>{w}</li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {visibleRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                            No rows in this view.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {step === 'result' && summary && (
          <div className="flex-1 flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatBox label="Total" value={summary.total} />
              <StatBox label="Created" value={summary.created} tone="emerald" />
              <StatBox label="Updated" value={summary.updated} tone="sky" />
              <StatBox label="Skipped" value={summary.skipped} tone="amber" />
              <StatBox label="Failed" value={summary.failed} tone="destructive" />
            </div>
            {failures.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Failures</p>
                <ScrollArea className="h-[40vh] rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>{COLUMNS.id}</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failures.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{f.rowNumber}</TableCell>
                          <TableCell className="font-mono text-xs">{f.code}</TableCell>
                          <TableCell className="text-xs text-destructive">{f.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t pt-3">
          {step === 'upload' && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={reset} disabled={busy}>
                Choose another file
              </Button>
              <Button
                onClick={confirmImport}
                disabled={busy || counts.valid + counts.warning === 0}
              >
                {busy
                  ? 'Importing…'
                  : `Confirm import (${counts.create + counts.update})`}
              </Button>
            </>
          )}
          {step === 'result' && (
            <Button onClick={() => handleClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'emerald' | 'sky' | 'amber' | 'destructive';
}) {
  const toneCls =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'sky'
        ? 'text-sky-600 dark:text-sky-400'
        : tone === 'amber'
          ? 'text-amber-600 dark:text-amber-400'
          : tone === 'destructive'
            ? 'text-destructive'
            : 'text-foreground';
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
