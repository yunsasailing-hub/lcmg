import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, AlertTriangle, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

import {
  validateRecipeWorkbook,
  checkRecipeMasterAgainstDb,
  type ValidationResult,
  type ValidationStatus,
  type ImportAction,
} from '@/lib/recipeImportValidation';
import { executeRecipeImport, type ImportRunResult } from '@/lib/recipeImportExecution';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function StatusBadge({ status }: { status: ValidationStatus }) {
  if (status === 'VALID') return <Badge className="bg-emerald-600 hover:bg-emerald-600">VALID</Badge>;
  if (status === 'WARNING') return <Badge className="bg-amber-500 hover:bg-amber-500">WARNING</Badge>;
  return <Badge variant="destructive">ERROR</Badge>;
}

function ActionBadge({ action }: { action: ImportAction }) {
  if (action === 'NEW') return <Badge className="bg-sky-600 hover:bg-sky-600">NEW</Badge>;
  if (action === 'UPDATE') return <Badge className="bg-indigo-600 hover:bg-indigo-600">UPDATE</Badge>;
  if (action === 'ERROR') return <Badge variant="destructive">ERROR</Badge>;
  return <Badge variant="secondary">—</Badge>;
}

export default function RecipeImportValidatorDialog({ open, onOpenChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [runResult, setRunResult] = useState<ImportRunResult | null>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setRunResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setRunResult(null);
  };

  const onImport = async () => {
    if (!file || !result) return;
    if (result.errors.length > 0) {
      toast({
        title: 'Import blocked',
        description: 'Resolve all errors before importing.',
        variant: 'destructive',
      });
      return;
    }
    setImporting(true);
    setRunResult(null);
    try {
      const run = await executeRecipeImport(file, result, supabase);
      setRunResult(run);
      toast({
        title: 'Import finished',
        description: `${run.recipesCreated} created, ${run.recipesUpdated} updated, ${run.recipesFailed} failed.`,
      });
    } catch (e) {
      toast({
        title: 'Import failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const onValidate = async () => {
    if (!file) {
      toast({ title: 'Choose a file', description: 'Select an .xlsx workbook to validate.' });
      return;
    }
    setRunning(true);
    try {
      const r = await validateRecipeWorkbook(file);
      // Phase 2A: read-only DB existence check for master recipe codes
      try {
        await checkRecipeMasterAgainstDb(r, supabase as never);
      } catch (err) {
        r.errors.push('Database existence check failed.');
      }
      setResult(r);
    } catch (e) {
      toast({
        title: 'Validation failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Recipe Import
          </DialogTitle>
          <DialogDescription>
            Upload an .xlsx workbook to validate, preview, and import recipe data.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFile}
              className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            <Button onClick={onValidate} disabled={!file || running}>
              <Upload className="h-4 w-4" /> {running ? 'Validating…' : 'Validate Workbook'}
            </Button>
            {file && (
              <span className="text-xs text-muted-foreground truncate">{file.name}</span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {result && (
            <div className="space-y-5">
                {/* Summary */}
                <section className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    {result.workbookValid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <h3 className="font-semibold">Final Validation Summary</h3>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div><span className="text-muted-foreground">File: </span>{result.fileName}</div>
                    <div>
                      <span className="text-muted-foreground">Workbook valid: </span>
                      <strong>{result.workbookValid ? 'Yes' : 'No'}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Errors: </span>
                      <strong className={result.errors.length ? 'text-destructive' : ''}>
                        {result.errors.length}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Warnings: </span>
                      <strong className={result.warnings.length ? 'text-amber-600' : ''}>
                        {result.warnings.length}
                      </strong>
                    </div>
                  </div>
                  {result.fileError && (
                    <p className="mt-2 text-sm text-destructive">{result.fileError}</p>
                  )}
                </section>

                {/* Phase 2B: Import eligibility gate */}
                {(() => {
                  const allowed = result.errors.length === 0;
                  const m = result.masterRows;
                  return (
                    <section
                      className={`rounded-md border p-4 ${
                        allowed
                          ? 'border-emerald-600/40 bg-emerald-500/10'
                          : 'border-destructive/40 bg-destructive/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {allowed ? (
                          <ShieldCheck className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <ShieldAlert className="h-5 w-5 text-destructive" />
                        )}
                        <h3 className={`font-semibold ${allowed ? 'text-emerald-700' : 'text-destructive'}`}>
                          {allowed ? 'IMPORT ALLOWED' : 'IMPORT BLOCKED'}
                        </h3>
                      </div>
                      <p className="mt-1 text-sm">
                        {allowed
                          ? 'No blocking errors found. Import can proceed. Warnings will not block import.'
                          : 'Blocking errors found. Resolve all errors before importing.'}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
                        <div><span className="text-muted-foreground">Total errors: </span><strong className={result.errors.length ? 'text-destructive' : ''}>{result.errors.length}</strong></div>
                        <div><span className="text-muted-foreground">Total warnings: </span><strong className={result.warnings.length ? 'text-amber-600' : ''}>{result.warnings.length}</strong></div>
                        <div><span className="text-muted-foreground">NEW: </span><strong className="text-sky-600">{m.newCount}</strong></div>
                        <div><span className="text-muted-foreground">UPDATE: </span><strong className="text-indigo-600">{m.updateCount}</strong></div>
                        <div><span className="text-muted-foreground">DB duplicate (blocked): </span><strong className={m.dbDuplicateCount ? 'text-destructive' : ''}>{m.dbDuplicateCount}</strong></div>
                        <div><span className="text-muted-foreground">No ingredients: </span><strong className={m.noIngredientsCount ? 'text-amber-600' : ''}>{m.noIngredientsCount}</strong></div>
                        <div><span className="text-muted-foreground">No procedures: </span><strong className={m.noProceduresCount ? 'text-amber-600' : ''}>{m.noProceduresCount}</strong></div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          disabled={!allowed || importing}
                          onClick={onImport}
                        >
                          {importing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {importing ? 'Importing…' : 'Import Recipes'}
                        </Button>
                        {!allowed && (
                          <span className="text-xs text-muted-foreground">
                            Fix blocking errors to enable import.
                          </span>
                        )}
                        {importing && (
                          <span className="text-xs text-muted-foreground">
                            Writing to database — please wait.
                          </span>
                        )}
                      </div>
                    </section>
                  );
                })()}

                {/* Sheet validation */}
                <section>
                  <h3 className="mb-2 font-semibold">Sheet Validation</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sheet</TableHead>
                        <TableHead>Detected</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.sheetChecks.map((s) => (
                        <TableRow key={s.name}>
                          <TableCell className="font-mono text-xs">{s.name}</TableCell>
                          <TableCell>{s.detected ? 'Yes' : 'No'}</TableCell>
                          <TableCell><StatusBadge status={s.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {result.detectedSheets.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      All detected sheets: {result.detectedSheets.join(', ')}
                    </p>
                  )}
                </section>

                {/* Column validation */}
                {result.columnChecks.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-semibold">Column Validation</h3>
                    <div className="space-y-3">
                      {result.columnChecks.map((c) => (
                        <div key={c.sheet} className="rounded-md border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-mono text-xs">{c.sheet}</div>
                            <StatusBadge status={c.status} />
                          </div>
                          <div className="mt-2 grid gap-1 text-xs">
                            <div>
                              <span className="text-muted-foreground">Required: </span>
                              {c.required.join(', ')}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Found: </span>
                              {c.found.length ? c.found.join(', ') : <em>none</em>}
                            </div>
                            {c.aliasMatches && Object.keys(c.aliasMatches).length > 0 && (
                              <div className="text-muted-foreground">
                                Matched:{' '}
                                {Object.entries(c.aliasMatches)
                                  .map(([canon, actual]) =>
                                    canon.toLowerCase() === actual.toLowerCase()
                                      ? canon
                                      : `${canon} ← ${actual}`,
                                  )
                                  .join(', ')}
                              </div>
                            )}
                            {c.missing.length > 0 && (
                              <div className="text-destructive">
                                Missing: {c.missing.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Approved units summary */}
                <section className="rounded-md border p-3">
                  <h3 className="mb-2 font-semibold">Approved Units Summary</h3>
                  {result.approvedUnits.readable ? (
                    <>
                      <p className="text-sm">
                        Total non-blank units: <strong>{result.approvedUnits.total}</strong>
                      </p>
                      {result.approvedUnits.sample.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {result.approvedUnits.sample.map((u, i) => (
                            <Badge key={`${u}-${i}`} variant="secondary" className="font-mono">
                              {u}
                            </Badge>
                          ))}
                          {result.approvedUnits.total > result.approvedUnits.sample.length && (
                            <span className="text-xs text-muted-foreground">
                              +{result.approvedUnits.total - result.approvedUnits.sample.length} more
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">APPROVED_UNITS sheet not readable or missing.</p>
                  )}
                </section>

                {/* Master rows validation (Phase 1B) */}
                {result.masterRows.evaluated && (
                  <section className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">RECIPES_MASTER_IMPORT — Row Validation</h3>
                      <Badge variant={result.masterRows.errors === 0 ? 'secondary' : 'destructive'}>
                        {result.masterRows.errors === 0 ? 'All rows valid' : `${result.masterRows.errors} error(s)`}
                      </Badge>
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                      <div><span className="text-muted-foreground">Visible rows: </span><strong>{result.masterRows.totalVisible}</strong></div>
                      <div><span className="text-muted-foreground">Valid: </span><strong className="text-emerald-600">{result.masterRows.valid}</strong></div>
                      <div><span className="text-muted-foreground">Errors: </span><strong className={result.masterRows.errors ? 'text-destructive' : ''}>{result.masterRows.errors}</strong></div>
                      <div><span className="text-muted-foreground">Warnings: </span><strong className={result.masterRows.warnings ? 'text-amber-600' : ''}>{result.masterRows.warnings}</strong></div>
                      <div><span className="text-muted-foreground">Dup. codes: </span><strong>{result.masterRows.duplicateCodeCount}</strong></div>
                      <div><span className="text-muted-foreground">No ingredients: </span><strong className={result.masterRows.noIngredientsCount ? 'text-amber-600' : ''}>{result.masterRows.noIngredientsCount}</strong></div>
                      <div><span className="text-muted-foreground">No procedures: </span><strong className={result.masterRows.noProceduresCount ? 'text-amber-600' : ''}>{result.masterRows.noProceduresCount}</strong></div>
                      <div><span className="text-muted-foreground">Blank code: </span><strong>{result.masterRows.blankCodeCount}</strong></div>
                      <div><span className="text-muted-foreground">Blank name: </span><strong>{result.masterRows.blankNameCount}</strong></div>
                    </div>
                    {result.masterRows.dbChecked && (
                      <div className="mb-3 rounded-md border border-dashed bg-muted/30 p-2">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">
                          Import Action Preview — DB check is read-only. No changes have been made.
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                          <div><span className="text-muted-foreground">NEW: </span><strong className="text-sky-600">{result.masterRows.newCount}</strong></div>
                          <div><span className="text-muted-foreground">UPDATE: </span><strong className="text-indigo-600">{result.masterRows.updateCount}</strong></div>
                          <div><span className="text-muted-foreground">DB duplicate (blocked): </span><strong className={result.masterRows.dbDuplicateCount ? 'text-destructive' : ''}>{result.masterRows.dbDuplicateCount}</strong></div>
                        </div>
                      </div>
                    )}
                    {result.masterRows.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data rows to preview.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Row</TableHead>
                            <TableHead>recipe_code</TableHead>
                            <TableHead>recipe_name</TableHead>
                            <TableHead className="w-24">Ingredients</TableHead>
                            <TableHead className="w-24">Procedures</TableHead>
                            <TableHead className="w-24">Action</TableHead>
                            <TableHead className="w-24">Status</TableHead>
                            <TableHead>Issues</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.masterRows.rows.map((r) => (
                            <TableRow key={r.rowNumber}>
                              <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {r.recipeCode || <em className="text-muted-foreground">—</em>}
                              </TableCell>
                              <TableCell className="text-sm">
                                {r.recipeName || <em className="text-muted-foreground">—</em>}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                <span className={r.ingredientCount === 0 ? 'text-amber-600' : ''}>
                                  {r.ingredientCount}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                <span className={r.procedureCount === 0 ? 'text-amber-600' : ''}>
                                  {r.procedureCount}
                                </span>
                              </TableCell>
                              <TableCell>
                                <ActionBadge action={r.importAction} />
                              </TableCell>
                              <TableCell><StatusBadge status={r.status} /></TableCell>
                              <TableCell className={`text-xs ${r.status === 'WARNING' ? 'text-amber-600' : 'text-destructive'}`}>
                                {r.issueSummary || <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>
                )}

                {/* Ingredient rows validation (Phase 1C) */}
                {result.ingredientRows?.evaluated && (
                  <section className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">RECIPE_INGREDIENTS_IMPORT — Row Validation</h3>
                      <Badge variant={result.ingredientRows.errors === 0 ? 'secondary' : 'destructive'}>
                        {result.ingredientRows.errors === 0
                          ? 'All rows valid'
                          : `${result.ingredientRows.errors} error(s)`}
                      </Badge>
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                      <div><span className="text-muted-foreground">Visible rows: </span><strong>{result.ingredientRows.totalVisible}</strong></div>
                      <div><span className="text-muted-foreground">Valid: </span><strong className="text-emerald-600">{result.ingredientRows.valid}</strong></div>
                      <div><span className="text-muted-foreground">Errors: </span><strong className={result.ingredientRows.errors ? 'text-destructive' : ''}>{result.ingredientRows.errors}</strong></div>
                      <div><span className="text-muted-foreground">Orphan rows: </span><strong className={result.ingredientRows.orphanCount ? 'text-destructive' : ''}>{result.ingredientRows.orphanCount}</strong></div>
                      <div><span className="text-muted-foreground">Qty defaulted to 0: </span><strong>{result.ingredientRows.blankQuantityNormalizedCount}</strong></div>
                      <div><span className="text-muted-foreground">Invalid unit: </span><strong>{result.ingredientRows.invalidUnitCount}</strong></div>
                      <div><span className="text-muted-foreground">Blank ingredient_code: </span><strong>{result.ingredientRows.blankIngredientCodeCount}</strong></div>
                    </div>
                    {result.ingredientRows.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data rows to preview.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Row</TableHead>
                            <TableHead>recipe_code</TableHead>
                            <TableHead>ingredient_code</TableHead>
                            <TableHead className="w-20">qty</TableHead>
                            <TableHead className="w-24">unit</TableHead>
                            <TableHead className="w-24">Status</TableHead>
                            <TableHead>Issues</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.ingredientRows.rows.map((r) => (
                            <TableRow key={r.rowNumber}>
                              <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {r.recipeCode || <em className="text-muted-foreground">—</em>}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {r.ingredientCode || <em className="text-muted-foreground">—</em>}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {String(r.quantity)}
                                {r.quantityNormalized && (
                                  <span className="ml-1 text-[10px] text-muted-foreground">(defaulted)</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {r.unit || <em className="text-muted-foreground">—</em>}
                              </TableCell>
                              <TableCell><StatusBadge status={r.status} /></TableCell>
                              <TableCell className="text-xs text-destructive">
                                {r.issueSummary || <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>
                )}

                {/* Procedure rows validation (Phase 1E) */}
                {result.procedureRows?.evaluated && (
                  <section className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">RECIPE_PROCEDURE_IMPORT — Row Validation</h3>
                      <Badge variant={result.procedureRows.errors === 0 ? 'secondary' : 'destructive'}>
                        {result.procedureRows.errors === 0
                          ? 'All rows valid'
                          : `${result.procedureRows.errors} error(s)`}
                      </Badge>
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
                      <div><span className="text-muted-foreground">Visible rows: </span><strong>{result.procedureRows.totalVisible}</strong></div>
                      <div><span className="text-muted-foreground">Valid: </span><strong className="text-emerald-600">{result.procedureRows.valid}</strong></div>
                      <div><span className="text-muted-foreground">Errors: </span><strong className={result.procedureRows.errors ? 'text-destructive' : ''}>{result.procedureRows.errors}</strong></div>
                      <div><span className="text-muted-foreground">Orphan rows: </span><strong className={result.procedureRows.orphanCount ? 'text-destructive' : ''}>{result.procedureRows.orphanCount}</strong></div>
                      <div><span className="text-muted-foreground">Blank recipe_code: </span><strong>{result.procedureRows.blankRecipeCodeCount}</strong></div>
                    </div>
                    {result.procedureRows.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data rows to preview.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Row</TableHead>
                            <TableHead>recipe_code</TableHead>
                            <TableHead className="w-20">step</TableHead>
                            <TableHead>instruction</TableHead>
                            <TableHead className="w-24">Status</TableHead>
                            <TableHead>Issues</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.procedureRows.rows.map((r) => (
                            <TableRow key={r.rowNumber}>
                              <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {r.recipeCode || <em className="text-muted-foreground">—</em>}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {r.stepNumber || <em className="text-muted-foreground">—</em>}
                              </TableCell>
                              <TableCell className="text-xs max-w-[280px] truncate" title={r.instruction}>
                                {r.instruction || <em className="text-muted-foreground">—</em>}
                              </TableCell>
                              <TableCell><StatusBadge status={r.status} /></TableCell>
                              <TableCell className="text-xs text-destructive">
                                {r.issueSummary || <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>
                )}

                {/* Errors / Warnings */}
                {(result.errors.length > 0 || result.warnings.length > 0) && (
                  <section className="rounded-md border p-3">
                    <h3 className="mb-2 font-semibold">Error Summary</h3>
                    {result.errors.length > 0 && (
                      <div className="mb-2">
                        <div className="mb-1 flex items-center gap-1 text-sm font-medium text-destructive">
                          <AlertCircle className="h-4 w-4" /> Errors
                        </div>
                        <ul className="ml-5 list-disc space-y-0.5 text-sm">
                          {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                    {result.warnings.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-sm font-medium text-amber-600">
                          <AlertTriangle className="h-4 w-4" /> Warnings
                        </div>
                        <ul className="ml-5 list-disc space-y-0.5 text-sm">
                          {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                  </section>
                )}

                {/* Phase 3: Import Result */}
                {runResult && (
                  <section className="rounded-md border border-emerald-600/40 bg-emerald-500/5 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <h3 className="font-semibold">Import Result</h3>
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
                      <div><span className="text-muted-foreground">Processed: </span><strong>{runResult.totalRecipesProcessed}</strong></div>
                      <div><span className="text-muted-foreground">Created: </span><strong className="text-sky-600">{runResult.recipesCreated}</strong></div>
                      <div><span className="text-muted-foreground">Updated: </span><strong className="text-indigo-600">{runResult.recipesUpdated}</strong></div>
                      <div><span className="text-muted-foreground">Failed: </span><strong className={runResult.recipesFailed ? 'text-destructive' : ''}>{runResult.recipesFailed}</strong></div>
                      <div><span className="text-muted-foreground">With warnings: </span><strong className={runResult.recipesWithWarnings ? 'text-amber-600' : ''}>{runResult.recipesWithWarnings}</strong></div>
                      <div><span className="text-muted-foreground">Ingredient rows inserted: </span><strong>{runResult.ingredientRowsInserted}</strong></div>
                      <div><span className="text-muted-foreground">Procedure rows inserted: </span><strong>{runResult.procedureRowsInserted}</strong></div>
                      <div><span className="text-muted-foreground">Blank ingredient section: </span><strong className={runResult.recipesWithBlankIngredients ? 'text-amber-600' : ''}>{runResult.recipesWithBlankIngredients}</strong></div>
                      <div><span className="text-muted-foreground">Blank procedure section: </span><strong className={runResult.recipesWithBlankProcedures ? 'text-amber-600' : ''}>{runResult.recipesWithBlankProcedures}</strong></div>
                    </div>
                    {runResult.rows.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>recipe_code</TableHead>
                            <TableHead>recipe_name</TableHead>
                            <TableHead className="w-24">Action</TableHead>
                            <TableHead className="w-24">Result</TableHead>
                            <TableHead>Issue summary</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {runResult.rows.map((r) => (
                            <TableRow key={r.recipeCode}>
                              <TableCell className="font-mono text-xs">{r.recipeCode}</TableCell>
                              <TableCell className="text-sm">{r.recipeName || <em className="text-muted-foreground">—</em>}</TableCell>
                              <TableCell>
                                <ActionBadge action={r.importAction} />
                              </TableCell>
                              <TableCell>
                                {r.result === 'SUCCESS' ? (
                                  <Badge className="bg-emerald-600 hover:bg-emerald-600">SUCCESS</Badge>
                                ) : (
                                  <Badge variant="destructive">FAILED</Badge>
                                )}
                              </TableCell>
                              <TableCell className={`text-xs ${r.result === 'FAILED' ? 'text-destructive' : 'text-muted-foreground'}`}>
                                {r.issueSummary}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>
                )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}