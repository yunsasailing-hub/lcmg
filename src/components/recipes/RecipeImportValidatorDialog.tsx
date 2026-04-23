import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, AlertTriangle } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

import {
  validateRecipeWorkbook,
  type ValidationResult,
  type ValidationStatus,
} from '@/lib/recipeImportValidation';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function StatusBadge({ status }: { status: ValidationStatus }) {
  if (status === 'VALID') return <Badge className="bg-emerald-600 hover:bg-emerald-600">VALID</Badge>;
  if (status === 'WARNING') return <Badge className="bg-amber-500 hover:bg-amber-500">WARNING</Badge>;
  return <Badge variant="destructive">ERROR</Badge>;
}

export default function RecipeImportValidatorDialog({ open, onOpenChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [running, setRunning] = useState(false);

  const reset = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
  };

  const onValidate = async () => {
    if (!file) {
      toast({ title: 'Choose a file', description: 'Select an .xlsx workbook to validate.' });
      return;
    }
    setRunning(true);
    try {
      const r = await validateRecipeWorkbook(file);
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Recipe Import — Step 1 Validation
          </DialogTitle>
          <DialogDescription>
            Upload an .xlsx workbook to validate its structure. No database changes are made in this step.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
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

          {result && (
            <ScrollArea className="max-h-[60vh] pr-3">
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
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}