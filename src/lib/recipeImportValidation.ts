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
  aliasMatches?: Record<string, string>; // canonical -> actual header used
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
  RECIPE_INGREDIENTS_IMPORT: ['recipe_code', 'ingredient_code', 'quantity', 'unit'],
  RECIPE_PROCEDURE_IMPORT: ['recipe_code', 'step_number', 'instruction'],
  APPROVED_UNITS: ['unit'],
};

// Canonical field -> accepted header aliases (all lower-case for matching).
// Canonical name itself is always accepted.
export const COLUMN_ALIASES: Record<string, Record<string, string[]>> = {
  RECIPES_MASTER_IMPORT: {
    recipe_code: ['recipe_code', 'recipe_id'],
    recipe_name: ['recipe_name', 'name'],
  },
  RECIPE_INGREDIENTS_IMPORT: {
    recipe_code: ['recipe_code', 'recipe_id'],
    ingredient_code: ['ingredient_code'],
    quantity: ['quantity', 'qty'],
    unit: ['unit'],
  },
  RECIPE_PROCEDURE_IMPORT: {
    recipe_code: ['recipe_code', 'recipe_id'],
    step_number: ['step_number', 'step_no'],
    instruction: ['instruction'],
  },
  APPROVED_UNITS: {
    unit: ['unit', 'approved_unit'],
  },
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** Resolve the actual header (in original casing) that satisfies a canonical field, if any. */
function findAliasMatch(
  headerLowerToOriginal: Map<string, string>,
  aliases: string[],
): string | undefined {
  for (const a of aliases) {
    const hit = headerLowerToOriginal.get(norm(a));
    if (hit) return hit;
  }
  return undefined;
}

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
    const aliasMap = COLUMN_ALIASES[sheet] ?? {};
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
    const headerLowerToOriginal = new Map<string, string>();
    for (const h of header) headerLowerToOriginal.set(norm(h), h);
    const aliasMatches: Record<string, string> = {};
    const missing: string[] = [];
    for (const canonical of required) {
      const aliases = aliasMap[canonical] ?? [canonical];
      const hit = findAliasMatch(headerLowerToOriginal, aliases);
      if (hit) aliasMatches[canonical] = hit;
      else missing.push(canonical);
    }
    const status: ValidationStatus = missing.length ? 'ERROR' : 'VALID';
    result.columnChecks.push({ sheet, required, found: header, missing, status, aliasMatches });
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
      // Accept 'unit' or 'approved_unit' (case-insensitive)
      const unitAliases = COLUMN_ALIASES.APPROVED_UNITS.unit;
      const units: string[] = [];
      for (const row of rows) {
        const key = Object.keys(row).find((k) => unitAliases.includes(norm(k)));
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

  // Phase 1B: Row validation for RECIPES_MASTER_IMPORT only.
  const masterReal = sheetByLower.get(norm('RECIPES_MASTER_IMPORT'));
  const masterCol = result.columnChecks.find((c) => c.sheet === 'RECIPES_MASTER_IMPORT');
  if (masterReal && masterCol && masterCol.status === 'VALID') {
    try {
      const ws = wb.Sheets[masterReal];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: '',
        blankrows: false,
      });
      // Resolve actual header keys case-insensitively
      const sample = rawRows[0] ?? {};
      const keyMap = new Map<string, string>();
      for (const k of Object.keys(sample)) keyMap.set(norm(k), k);
      // Fallback: scan all rows for keys (in case first row is blank-ish)
      if (keyMap.size === 0) {
        for (const r of rawRows) for (const k of Object.keys(r)) keyMap.set(norm(k), k);
      }
      const masterAliases = COLUMN_ALIASES.RECIPES_MASTER_IMPORT;
      const codeKey =
        masterAliases.recipe_code.map((a) => keyMap.get(a)).find(Boolean) as string | undefined;
      const nameKey =
        masterAliases.recipe_name.map((a) => keyMap.get(a)).find(Boolean) as string | undefined;

      const rows: MasterRowCheck[] = [];
      const codeOccurrences = new Map<string, number[]>();

      rawRows.forEach((row, idx) => {
        const codeRaw = codeKey ? String(row[codeKey] ?? '').trim() : '';
        const nameRaw = nameKey ? String(row[nameKey] ?? '').trim() : '';
        // Detect "completely blank" by checking all values across the row
        const anyOtherMeaningful = Object.values(row).some(
          (v) => String(v ?? '').trim() !== '',
        );
        if (!codeRaw && !nameRaw && !anyOtherMeaningful) return; // ignore fully-blank

        const rowNumber = idx + 2; // header is row 1, data starts at row 2
        const issues: string[] = [];
        if (!codeRaw) issues.push('Missing recipe_code');
        if (!nameRaw) issues.push('Missing recipe_name');

        rows.push({
          rowNumber,
          recipeCode: codeRaw,
          recipeName: nameRaw,
          status: 'VALID',
          issues,
          issueSummary: '',
        });

        if (codeRaw) {
          const key = codeRaw.toLowerCase();
          const list = codeOccurrences.get(key) ?? [];
          list.push(rows.length - 1);
          codeOccurrences.set(key, list);
        }
      });

      // Mark duplicates
      let duplicateCodeCount = 0;
      for (const [, indices] of codeOccurrences) {
        if (indices.length > 1) {
          for (const i of indices) {
            rows[i].issues.push('Duplicate recipe_code');
            duplicateCodeCount += 1;
          }
        }
      }

      let blankCodeCount = 0;
      let blankNameCount = 0;
      let validCount = 0;
      let errorCount = 0;
      for (const r of rows) {
        if (r.issues.includes('Missing recipe_code')) blankCodeCount += 1;
        if (r.issues.includes('Missing recipe_name')) blankNameCount += 1;
        if (r.issues.length > 0) {
          r.status = 'ERROR';
          r.issueSummary = r.issues.join('; ');
          errorCount += 1;
        } else {
          r.status = 'VALID';
          r.issueSummary = '';
          validCount += 1;
        }
      }

      result.masterRows = {
        evaluated: true,
        totalVisible: rows.length,
        valid: validCount,
        errors: errorCount,
        duplicateCodeCount,
        blankCodeCount,
        blankNameCount,
        rows,
      };

      if (errorCount > 0) {
        errors.push(
          `RECIPES_MASTER_IMPORT has ${errorCount} row(s) with issues.`,
        );
      }
    } catch {
      errors.push('RECIPES_MASTER_IMPORT rows could not be read.');
    }
  }

  result.workbookValid = errors.length === 0;
  return result;
}