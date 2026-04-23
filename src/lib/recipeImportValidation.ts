import * as XLSX from 'xlsx';

export type ValidationStatus = 'VALID' | 'WARNING' | 'ERROR';

export interface SheetCheck {
  name: string;
  detected: boolean;
  status: ValidationStatus;
}

export interface ColumnCheck {
  sheet: string;
  required: string[];
  found: string[];
  missing: string[];
  status: ValidationStatus;
}

export interface ApprovedUnitsSummary {
  total: number;
  sample: string[];
  readable: boolean;
}

export interface MasterRowCheck {
  rowNumber: number; // 1-based excel row number (header=1)
  recipeCode: string;
  recipeName: string;
  status: Extract<ValidationStatus, 'VALID' | 'ERROR'>;
  issues: string[];
  issueSummary: string;
}

export interface MasterRowsSummary {
  evaluated: boolean;
  totalVisible: number;
  valid: number;
  errors: number;
  duplicateCodeCount: number;
  blankCodeCount: number;
  blankNameCount: number;
  rows: MasterRowCheck[];
}

export interface ValidationResult {
  fileName: string;
  fileReadable: boolean;
  fileError?: string;
  detectedSheets: string[];
  sheetChecks: SheetCheck[];
  columnChecks: ColumnCheck[];
  approvedUnits: ApprovedUnitsSummary;
  masterRows: MasterRowsSummary;
  errors: string[];
  warnings: string[];
  workbookValid: boolean;
}

export const REQUIRED_SHEETS = [
  'RECIPES_MASTER_IMPORT',
  'RECIPE_INGREDIENTS_IMPORT',
  'RECIPE_PROCEDURE_IMPORT',
  'APPROVED_UNITS',
] as const;

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  RECIPES_MASTER_IMPORT: ['recipe_code', 'recipe_name'],
  RECIPE_INGREDIENTS_IMPORT: [
    'recipe_code', 'line_order', 'ingredient_code', 'ingredient_name', 'quantity', 'unit',
  ],
  RECIPE_PROCEDURE_IMPORT: ['recipe_code', 'step_number', 'instruction'],
  APPROVED_UNITS: ['unit'],
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

function readHeaderRow(ws: XLSX.WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  const header = (rows[0] ?? []) as unknown[];
  return header.map((h) => String(h ?? '').trim()).filter(Boolean);
}

export async function validateRecipeWorkbook(file: File): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result: ValidationResult = {
    fileName: file.name,
    fileReadable: false,
    detectedSheets: [],
    sheetChecks: [],
    columnChecks: [],
    approvedUnits: { total: 0, sample: [], readable: false },
    masterRows: {
      evaluated: false,
      totalVisible: 0,
      valid: 0,
      errors: 0,
      duplicateCodeCount: 0,
      blankCodeCount: 0,
      blankNameCount: 0,
      rows: [],
    },
    errors,
    warnings,
    workbookValid: false,
  };

  let wb: XLSX.WorkBook;
  try {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array' });
    result.fileReadable = true;
  } catch (e) {
    result.fileError = 'File could not be read. Please upload a valid .xlsx workbook.';
    errors.push(result.fileError);
    return result;
  }

  result.detectedSheets = wb.SheetNames.slice();
  const detectedLower = new Set(result.detectedSheets.map(norm));

  // Sheet checks
  for (const name of REQUIRED_SHEETS) {
    const detected = detectedLower.has(norm(name));
    result.sheetChecks.push({
      name,
      detected,
      status: detected ? 'VALID' : 'ERROR',
    });
    if (!detected) errors.push(`Missing required sheet: ${name}`);
  }

  // Resolve real sheet names case-insensitively
  const sheetByLower = new Map(wb.SheetNames.map((n) => [norm(n), n]));

  // Column checks (only for sheets that exist)
  for (const sheet of REQUIRED_SHEETS) {
    const required = REQUIRED_COLUMNS[sheet];
    const realName = sheetByLower.get(norm(sheet));
    if (!realName) continue;
    let header: string[] = [];
    try {
      header = readHeaderRow(wb.Sheets[realName]);
    } catch {
      errors.push(`Sheet ${sheet} could not be read.`);
      result.columnChecks.push({ sheet, required, found: [], missing: required, status: 'ERROR' });
      continue;
    }
    const headerLower = new Set(header.map(norm));
    const missing = required.filter((c) => !headerLower.has(norm(c)));
    const status: ValidationStatus = missing.length ? 'ERROR' : 'VALID';
    result.columnChecks.push({ sheet, required, found: header, missing, status });
    if (missing.length) {
      errors.push(`Sheet ${sheet} is missing column(s): ${missing.join(', ')}`);
    }
  }

  // Approved units
  const auName = sheetByLower.get(norm('APPROVED_UNITS'));
  if (auName) {
    try {
      const ws = wb.Sheets[auName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      // case-insensitive 'unit' column
      const units: string[] = [];
      for (const row of rows) {
        const key = Object.keys(row).find((k) => norm(k) === 'unit');
        if (!key) continue;
        const v = String(row[key] ?? '').trim();
        if (v) units.push(v);
      }
      result.approvedUnits = {
        total: units.length,
        sample: units.slice(0, 12),
        readable: true,
      };
      if (units.length === 0) {
        warnings.push('APPROVED_UNITS is readable but contains no unit values.');
      }
    } catch {
      errors.push('APPROVED_UNITS sheet could not be read.');
      result.approvedUnits.readable = false;
    }
  }

  // Optional: warn if any required sheet is empty (readable but no data rows)
  for (const sheet of REQUIRED_SHEETS) {
    const realName = sheetByLower.get(norm(sheet));
    if (!realName) continue;
    try {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[realName], {
        header: 1, blankrows: false,
      });
      if (rows.length <= 1) warnings.push(`Sheet ${sheet} has no data rows.`);
    } catch { /* already reported */ }
  }

  result.workbookValid = errors.length === 0;
  return result;
}