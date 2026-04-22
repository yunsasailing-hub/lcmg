import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

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
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useChecklists';
import {
  useRecipes, useRecipeTypes, RECIPE_DEPARTMENTS, type RecipeDepartment,
} from '@/hooks/useRecipes';
import { useRecipeUnits } from '@/hooks/useIngredients';

/** Sheet & column contract — keep in sync with the user-facing template. */
const SHEET_NAME = 'RECIPES_MASTER_IMPORT';
const COLUMNS = [
  'recipe_id',
  'name',
  'type',
  'department',
  'branch',
  'yield_qty',
  'yield_unit',
  'use_as_ingredient',
  'active',
  'description',
] as const;
type Col = typeof COLUMNS[number];

const REQUIRED: Col[] = [
  'recipe_id', 'name', 'type', 'department', 'branch',
  'yield_qty', 'yield_unit', 'use_as_ingredient', 'active',
];

type RowSeverity = 'valid' | 'duplicate' | 'invalid';
type RowAction = 'create' | 'skip';

interface ImportRow {
  rowIndex: number;            // 1-based excel row (header = 1)
  raw: Record<string, unknown>;
  errors: string[];
  severity: RowSeverity;
  action: RowAction;
  // resolved
  recipe_id: string;
  name: string;
  recipe_type_id: string | null;
  department: RecipeDepartment | null;
  branch_id: string | null | 'global';
  yield_quantity: number | null;
  yield_unit_id: string | null;
  use_as_ingredient: boolean | null;
  is_active: boolean | null;
  description: string | null;
}

interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  failures: { rowIndex: number; recipe_id: string; reason: string }[];
}

const SEVERITY_LABEL: Record<RowSeverity, string> = {
  valid: 'VALID',
  duplicate: 'DUPLICATE',
  invalid: 'INVALID',
};
const SEVERITY_VARIANT: Record<RowSeverity, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  valid: 'default',
  duplicate: 'secondary',
  invalid: 'destructive',
};

function parseBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (v === 1) return true;
    if (v === 0) return false;
    return null;
  }
  const s = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'no', 'n', '0'].includes(s)) return false;
  return null;
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function strOrEmpty(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RecipeMasterImportDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existingRecipes = [] } = useRecipes(true);
  const { data: types = [] } = useRecipeTypes(true);
  const { data: branches = [] } = useBranches();
  // Only approved (active) units accepted in imports
  const { data: units = [] } = useRecipeUnits(false);

  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const existingCodeMap = useMemo(() => {
    const m = new Map<string, string>();
    existingRecipes.forEach(r => { if (r.code) m.set(r.code.trim().toLowerCase(), r.id); });
    return m;
  }, [existingRecipes]);

  const typeMap = useMemo(() => {
    const m = new Map<string, string>();
    types.forEach(t => m.set(t.name_en.trim().toLowerCase(), t.id));
    return m;
  }, [types]);

  const branchMap = useMemo(() => {
    const m = new Map<string, string>();
    branches.forEach(b => m.set(b.name.trim().toLowerCase(), b.id));
    return m;
  }, [branches]);

  const unitMap = useMemo(() => {
    const m = new Map<string, string>();
    units.forEach(u => {
      m.set(u.code.trim().toLowerCase(), u.id);
      m.set(u.name_en.trim().toLowerCase(), u.id);
      if (u.name_vi) m.set(u.name_vi.trim().toLowerCase(), u.id);
    });
    return m;
  }, [units]);

  const stats = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter(r => r.severity === 'valid').length;
    const duplicate = rows.filter(r => r.severity === 'duplicate').length;
    const invalid = rows.filter(r => r.severity === 'invalid').length;
    const willCreate = rows.filter(r => r.action === 'create' && r.severity === 'valid').length;
    return { total, valid, duplicate, invalid, willCreate };
  }, [rows]);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setRows([]);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const example = [{
      recipe_id: 'PIZZA-001',
      name: 'Margherita Pizza',
      type: types[0]?.name_en ?? 'Main',
      department: 'kitchen',
      branch: branches[0]?.name ?? 'global',
      yield_qty: 1,
      yield_unit: units[0]?.code ?? 'pcs',
      use_as_ingredient: 'No',
      active: 'Yes',
      description: 'Classic tomato, mozzarella, basil',
    }];
    const ws = XLSX.utils.json_to_sheet(example, { header: [...COLUMNS] });
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

    // Allowed values reference sheet
    const ref: any[][] = [
      ['ALLOWED VALUES'],
      [],
      ['departments', ...RECIPE_DEPARTMENTS],
      ['types', ...types.map(t => t.name_en)],
      ['branches', 'global', ...branches.map(b => b.name)],
      ['units (code)', ...units.map(u => u.code)],
      ['boolean', 'Yes', 'No', 'TRUE', 'FALSE', '1', '0'],
    ];
    const wsRef = XLSX.utils.aoa_to_sheet(ref);
    XLSX.utils.book_append_sheet(wb, wsRef, 'Allowed Values');
    XLSX.writeFile(wb, 'recipes-master-import-template.xlsx');
  };

  const validateRow = (raw: Record<string, unknown>, rowIndex: number): ImportRow => {
    const errors: string[] = [];
    const recipe_id = strOrEmpty(raw.recipe_id);
    const name = strOrEmpty(raw.name);
    const typeStr = strOrEmpty(raw.type);
    const deptStr = strOrEmpty(raw.department).toLowerCase();
    const branchStr = strOrEmpty(raw.branch);
    const yieldQty = parseNumber(raw.yield_qty);
    const unitStr = strOrEmpty(raw.yield_unit);
    const useAsIng = parseBool(raw.use_as_ingredient);
    const active = parseBool(raw.active);
    const description = strOrEmpty(raw.description) || null;

    if (!recipe_id) errors.push('recipe_id is required');
    if (!name) errors.push('name is required');

    let recipe_type_id: string | null = null;
    if (!typeStr) errors.push('type is required');
    else {
      recipe_type_id = typeMap.get(typeStr.toLowerCase()) ?? null;
      if (!recipe_type_id) errors.push(`type "${typeStr}" not found`);
    }

    let department: RecipeDepartment | null = null;
    if (!deptStr) errors.push('department is required');
    else if ((RECIPE_DEPARTMENTS as string[]).includes(deptStr)) {
      department = deptStr as RecipeDepartment;
    } else {
      errors.push(`department "${deptStr}" not allowed (use: ${RECIPE_DEPARTMENTS.join(', ')})`);
    }

    let branch_id: string | null | 'global' = null;
    if (!branchStr) errors.push('branch is required');
    else if (branchStr.toLowerCase() === 'global') branch_id = 'global';
    else {
      const id = branchMap.get(branchStr.toLowerCase());
      if (id) branch_id = id;
      else errors.push(`branch "${branchStr}" not found (use "global" or an existing branch name)`);
    }

    if (yieldQty === null) errors.push('yield_qty is required');
    else if (yieldQty <= 0) errors.push('yield_qty must be > 0');

    let yield_unit_id: string | null = null;
    if (!unitStr) errors.push('yield_unit is required');
    else {
      yield_unit_id = unitMap.get(unitStr.toLowerCase()) ?? null;
      if (!yield_unit_id) errors.push(`yield_unit "${unitStr}" not found`);
    }

    if (useAsIng === null) errors.push('use_as_ingredient is required (Yes/No)');
    if (active === null) errors.push('active is required (Yes/No)');

    let severity: RowSeverity = errors.length ? 'invalid' : 'valid';
    let action: RowAction = severity === 'valid' ? 'create' : 'skip';

    if (severity === 'valid' && existingCodeMap.has(recipe_id.toLowerCase())) {
      severity = 'duplicate';
      action = 'skip';
      errors.push('recipe_id already exists');
    }

    return {
      rowIndex, raw, errors, severity, action,
      recipe_id, name,
      recipe_type_id, department, branch_id,
      yield_quantity: yieldQty,
      yield_unit_id,
      use_as_ingredient: useAsIng,
      is_active: active,
      description,
    };
  };

  const onFile = async (file: File) => {
    try {
      setBusy(true);
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames.find(s => s.toUpperCase() === SHEET_NAME) ?? wb.SheetNames[0];
      if (!sheetName) throw new Error('No sheet found in workbook');
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
      if (!json.length) throw new Error('Sheet is empty');
      // Header check
      const headers = Object.keys(json[0]);
      const missing = REQUIRED.filter(c => !headers.includes(c));
      if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);

      const validated = json.map((r, idx) => validateRow(r, idx + 2));
      setRows(validated);
      setStep('preview');
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runImport = async () => {
    setBusy(true);
    const failures: ImportSummary['failures'] = [];
    let created = 0;
    let skipped = 0;

    for (const r of rows) {
      if (r.action === 'skip' || r.severity !== 'valid') {
        skipped++;
        continue;
      }
      try {
        const payload: any = {
          code: r.recipe_id,
          name_en: r.name,
          recipe_type_id: r.recipe_type_id,
          department: r.department,
          branch_id: r.branch_id === 'global' ? null : r.branch_id,
          yield_quantity: r.yield_quantity,
          yield_unit_id: r.yield_unit_id,
          use_as_ingredient: !!r.use_as_ingredient,
          is_active: !!r.is_active,
          description: r.description,
          status: r.is_active ? 'active' : 'draft',
          created_by: user?.id ?? null,
        };
        const { error } = await supabase.from('recipes').insert(payload);
        if (error) throw error;
        created++;
      } catch (e: any) {
        failures.push({
          rowIndex: r.rowIndex,
          recipe_id: r.recipe_id,
          reason: e?.message ?? String(e),
        });
      }
    }

    setSummary({
      total: rows.length,
      created,
      skipped,
      failed: failures.length,
      failures,
    });
    setStep('result');
    setBusy(false);
    qc.invalidateQueries({ queryKey: ['recipes'] });
    toast({ title: 'Import complete', description: `${created} created, ${skipped} skipped, ${failures.length} failed` });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Bulk Import — Recipe Master
          </DialogTitle>
          <DialogDescription>
            Upload an .xlsx file with sheet <code className="rounded bg-muted px-1">{SHEET_NAME}</code>. Only Recipe Master fields are imported in this step — ingredient lines and procedures will be added later.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="rounded-md border border-dashed p-6 text-center">
              <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Required columns: {REQUIRED.join(', ')}<br />
                Optional: description
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  <Upload className="h-4 w-4" /> Choose .xlsx file
                </Button>
                <Button variant="outline" onClick={downloadTemplate} disabled={busy}>
                  <Download className="h-4 w-4" /> Download template
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              <p><strong>Boolean values:</strong> Yes/No, TRUE/FALSE, 1/0</p>
              <p><strong>Branch:</strong> use "global" or an existing branch name</p>
              <p><strong>Department:</strong> {RECIPE_DEPARTMENTS.join(', ')}</p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{fileName}</Badge>
              <Badge variant="default">{stats.valid} valid</Badge>
              <Badge variant="secondary">{stats.duplicate} duplicate</Badge>
              <Badge variant="destructive">{stats.invalid} invalid</Badge>
              <span className="ml-auto text-muted-foreground">
                Will create: <strong>{stats.willCreate}</strong> / {stats.total}
              </span>
            </div>

            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                <TabsTrigger value="valid">Valid ({stats.valid})</TabsTrigger>
                <TabsTrigger value="duplicate">Duplicates ({stats.duplicate})</TabsTrigger>
                <TabsTrigger value="invalid">Invalid ({stats.invalid})</TabsTrigger>
              </TabsList>
              {(['all', 'valid', 'duplicate', 'invalid'] as const).map(tab => (
                <TabsContent key={tab} value={tab} className="mt-2">
                  <ScrollArea className="h-[360px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Row</TableHead>
                          <TableHead className="w-24">Status</TableHead>
                          <TableHead>recipe_id</TableHead>
                          <TableHead>name</TableHead>
                          <TableHead>type</TableHead>
                          <TableHead>department</TableHead>
                          <TableHead>branch</TableHead>
                          <TableHead>yield</TableHead>
                          <TableHead>active</TableHead>
                          <TableHead>use_as_ing</TableHead>
                          <TableHead>Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows
                          .filter(r => tab === 'all' || r.severity === tab)
                          .map(r => (
                            <TableRow key={r.rowIndex}>
                              <TableCell className="font-mono text-xs">{r.rowIndex}</TableCell>
                              <TableCell>
                                <Badge variant={SEVERITY_VARIANT[r.severity]}>
                                  {SEVERITY_LABEL[r.severity]}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{r.recipe_id || '—'}</TableCell>
                              <TableCell className="text-sm">{r.name || '—'}</TableCell>
                              <TableCell className="text-xs">{strOrEmpty(r.raw.type) || '—'}</TableCell>
                              <TableCell className="text-xs">{strOrEmpty(r.raw.department) || '—'}</TableCell>
                              <TableCell className="text-xs">{strOrEmpty(r.raw.branch) || '—'}</TableCell>
                              <TableCell className="text-xs">
                                {r.yield_quantity ?? '—'} {strOrEmpty(r.raw.yield_unit)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {r.is_active === null ? '—' : r.is_active ? 'Yes' : 'No'}
                              </TableCell>
                              <TableCell className="text-xs">
                                {r.use_as_ingredient === null ? '—' : r.use_as_ingredient ? 'Yes' : 'No'}
                              </TableCell>
                              <TableCell className="text-xs text-destructive">
                                {r.errors.length > 0 ? r.errors.join('; ') : ''}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>

            {stats.invalid > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <strong>{stats.invalid} invalid row(s) will be skipped.</strong> Fix the errors in your file and re-upload, or proceed to import only the {stats.valid} valid rows. Duplicates are also skipped.
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'result' && summary && (
          <div className="space-y-3">
            <div className="rounded-md border p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h3 className="font-medium">Import summary</h3>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">Total rows</div><div className="text-lg font-semibold">{summary.total}</div></div>
                <div><div className="text-xs text-muted-foreground">Created</div><div className="text-lg font-semibold text-primary">{summary.created}</div></div>
                <div><div className="text-xs text-muted-foreground">Skipped</div><div className="text-lg font-semibold">{summary.skipped}</div></div>
                <div><div className="text-xs text-muted-foreground">Failed</div><div className="text-lg font-semibold text-destructive">{summary.failed}</div></div>
              </div>
            </div>
            {summary.failures.length > 0 && (
              <ScrollArea className="h-[240px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>recipe_id</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.failures.map(f => (
                      <TableRow key={f.rowIndex}>
                        <TableCell className="font-mono text-xs">{f.rowIndex}</TableCell>
                        <TableCell className="font-mono text-xs">{f.recipe_id}</TableCell>
                        <TableCell className="text-xs text-destructive">{f.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>Close</Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={reset} disabled={busy}>Choose different file</Button>
              <Button onClick={runImport} disabled={busy || stats.willCreate === 0}>
                {busy ? 'Importing…' : `Import ${stats.willCreate} recipe(s)`}
              </Button>
            </>
          )}
          {step === 'result' && (
            <>
              <Button variant="outline" onClick={reset}>Import another file</Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}