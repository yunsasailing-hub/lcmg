import * as XLSX from 'xlsx';

export type ValidationStatus = 'VALID' | 'WARNING' | 'ERROR';

export type ImportAction = 'NEW' | 'UPDATE' | 'ERROR' | 'PENDING';

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
  values?: string[]; // full normalized list (lowercased, trimmed) — internal use
}

export interface MasterRowCheck {
  rowNumber: number; // 1-based excel row number (header=1)
  recipeCode: string;
  recipeName: string;
  status: ValidationStatus;
  issues: string[];
  issueSummary: string;
  ingredientCount: number;
  procedureCount: number;
  importAction: ImportAction;
}

export interface MasterRowsSummary {
  evaluated: boolean;
  totalVisible: number;
  valid: number;
  errors: number;
  warnings: number;
  duplicateCodeCount: number;
  blankCodeCount: number;
  blankNameCount: number;
  noIngredientsCount: number;
  noProceduresCount: number;
  newCount: number;
  updateCount: number;
  dbDuplicateCount: number;
  dbChecked: boolean;
  rows: MasterRowCheck[];
}

export interface IngredientRowCheck {
  rowNumber: number;
  recipeCode: string;
  ingredientCode: string;
  quantity: number | string; // normalized (number) or original string when invalid
  unit: string;
  status: Extract<ValidationStatus, 'VALID' | 'ERROR'>;
  issues: string[];
  issueSummary: string;
  quantityNormalized: boolean; // true when blank quantity defaulted to 0
  isOrphan: boolean; // recipe_code not found in RECIPES_MASTER_IMPORT
}

export interface IngredientRowsSummary {
  evaluated: boolean;
  totalVisible: number;
  valid: number;
  errors: number;
  blankQuantityNormalizedCount: number;
  invalidUnitCount: number;
  blankIngredientCodeCount: number;
  blankRecipeCodeCount: number;
  nonNumericQuantityCount: number;
  orphanCount: number;
  rows: IngredientRowCheck[];
}

export interface ProcedureRowCheck {
  rowNumber: number;
  recipeCode: string;
  stepNumber: string;
  instruction: string;
  status: Extract<ValidationStatus, 'VALID' | 'ERROR'>;
  issues: string[];
  issueSummary: string;
  isOrphan: boolean;
}

export interface ProcedureRowsSummary {
  evaluated: boolean;
  totalVisible: number;
  valid: number;
  errors: number;
  blankRecipeCodeCount: number;
  orphanCount: number;
  rows: ProcedureRowCheck[];
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
  ingredientRows: IngredientRowsSummary;
  procedureRows: ProcedureRowsSummary;
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
      warnings: 0,
      duplicateCodeCount: 0,
      blankCodeCount: 0,
      blankNameCount: 0,
      noIngredientsCount: 0,
      noProceduresCount: 0,
      rows: [],
    },
    ingredientRows: {
      evaluated: false,
      totalVisible: 0,
      valid: 0,
      errors: 0,
      blankQuantityNormalizedCount: 0,
      invalidUnitCount: 0,
      blankIngredientCodeCount: 0,
      blankRecipeCodeCount: 0,
      nonNumericQuantityCount: 0,
      orphanCount: 0,
      rows: [],
    },
    procedureRows: {
      evaluated: false,
      totalVisible: 0,
      valid: 0,
      errors: 0,
      blankRecipeCodeCount: 0,
      orphanCount: 0,
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
        values: units.map((u) => u.trim().toLowerCase()),
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
          ingredientCount: 0,
          procedureCount: 0,
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
        warnings: 0,
        duplicateCodeCount,
        blankCodeCount,
        blankNameCount,
        noIngredientsCount: 0,
        noProceduresCount: 0,
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

  // Phase 1C: Row validation for RECIPE_INGREDIENTS_IMPORT.
  const ingReal = sheetByLower.get(norm('RECIPE_INGREDIENTS_IMPORT'));
  const ingCol = result.columnChecks.find((c) => c.sheet === 'RECIPE_INGREDIENTS_IMPORT');
  if (ingReal && ingCol && ingCol.status === 'VALID') {
    try {
      const ws = wb.Sheets[ingReal];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: '',
        blankrows: false,
      });
      const sample = rawRows[0] ?? {};
      const keyMap = new Map<string, string>();
      for (const k of Object.keys(sample)) keyMap.set(norm(k), k);
      if (keyMap.size === 0) {
        for (const r of rawRows) for (const k of Object.keys(r)) keyMap.set(norm(k), k);
      }
      const a = COLUMN_ALIASES.RECIPE_INGREDIENTS_IMPORT;
      const codeKey = a.recipe_code.map((al) => keyMap.get(al)).find(Boolean) as string | undefined;
      const ingKey = a.ingredient_code.map((al) => keyMap.get(al)).find(Boolean) as string | undefined;
      const qtyKey = a.quantity.map((al) => keyMap.get(al)).find(Boolean) as string | undefined;
      const unitKey = a.unit.map((al) => keyMap.get(al)).find(Boolean) as string | undefined;

      const approvedSet = new Set(result.approvedUnits.values ?? []);
      const checkUnits = approvedSet.size > 0;

      const rows: IngredientRowCheck[] = [];
      let blankQtyNorm = 0;
      let invalidUnit = 0;
      let blankIngCode = 0;
      let blankRecipeCode = 0;
      let nonNumericQty = 0;

      rawRows.forEach((row, idx) => {
        const recipeCode = codeKey ? String(row[codeKey] ?? '').trim() : '';
        const ingredientCode = ingKey ? String(row[ingKey] ?? '').trim() : '';
        const qtyRaw = qtyKey ? String(row[qtyKey] ?? '').trim() : '';
        const unitRaw = unitKey ? String(row[unitKey] ?? '').trim() : '';

        const anyMeaningful = Object.values(row).some(
          (v) => String(v ?? '').trim() !== '',
        );
        if (!recipeCode && !ingredientCode && !qtyRaw && !unitRaw && !anyMeaningful) return;

        const rowNumber = idx + 2;
        const issues: string[] = [];

        if (!recipeCode) { issues.push('Missing recipe_code'); blankRecipeCode += 1; }
        if (!ingredientCode) { issues.push('Missing ingredient_code'); blankIngCode += 1; }

        // Quantity normalization
        let quantity: number | string = 0;
        let quantityNormalized = false;
        if (qtyRaw === '') {
          quantity = 0;
          quantityNormalized = true;
          blankQtyNorm += 1;
        } else {
          const num = Number(qtyRaw.replace(/,/g, '.'));
          if (Number.isFinite(num)) {
            quantity = num;
          } else {
            quantity = qtyRaw;
            issues.push('Non-numeric quantity');
            nonNumericQty += 1;
          }
        }

        // Unit check against approved units
        if (!unitRaw) {
          issues.push('Missing unit');
          invalidUnit += 1;
        } else if (checkUnits && !approvedSet.has(unitRaw.toLowerCase())) {
          issues.push(`Unit "${unitRaw}" not in APPROVED_UNITS`);
          invalidUnit += 1;
        }

        rows.push({
          rowNumber,
          recipeCode,
          ingredientCode,
          quantity,
          unit: unitRaw,
          status: issues.length ? 'ERROR' : 'VALID',
          issues,
          issueSummary: issues.join('; '),
          quantityNormalized,
          isOrphan: false,
        });
      });

      const validCount = rows.filter((r) => r.status === 'VALID').length;
      const errorCount = rows.length - validCount;

      result.ingredientRows = {
        evaluated: true,
        totalVisible: rows.length,
        valid: validCount,
        errors: errorCount,
        blankQuantityNormalizedCount: blankQtyNorm,
        invalidUnitCount: invalidUnit,
        blankIngredientCodeCount: blankIngCode,
        blankRecipeCodeCount: blankRecipeCode,
        nonNumericQuantityCount: nonNumericQty,
        orphanCount: 0,
        rows,
      };

      if (errorCount > 0) {
        errors.push(`RECIPE_INGREDIENTS_IMPORT has ${errorCount} row(s) with issues.`);
      }
    } catch {
      errors.push('RECIPE_INGREDIENTS_IMPORT rows could not be read.');
    }
  }

  // Phase 1D: Cross-check master ↔ ingredient sheets via recipe_code.
  if (result.masterRows.evaluated && result.ingredientRows.evaluated) {
    const masterCodes = new Map<string, number>(); // lowercased -> master row index
    result.masterRows.rows.forEach((m, i) => {
      if (m.recipeCode) masterCodes.set(m.recipeCode.trim().toLowerCase(), i);
    });

    // Mark orphan ingredient rows
    let orphanCount = 0;
    for (const ing of result.ingredientRows.rows) {
      if (!ing.recipeCode) continue; // existing blank-code error already applied
      const key = ing.recipeCode.trim().toLowerCase();
      const masterIdx = masterCodes.get(key);
      if (masterIdx === undefined) {
        ing.isOrphan = true;
        ing.issues.push('recipe_code not found in RECIPES_MASTER_IMPORT');
        ing.issueSummary = ing.issues.join('; ');
        if (ing.status !== 'ERROR') ing.status = 'ERROR';
        orphanCount += 1;
      } else {
        result.masterRows.rows[masterIdx].ingredientCount += 1;
      }
    }

    // Recompute ingredient summary error count after orphan marking
    const ingValid = result.ingredientRows.rows.filter((r) => r.status === 'VALID').length;
    result.ingredientRows.valid = ingValid;
    result.ingredientRows.errors = result.ingredientRows.rows.length - ingValid;
    result.ingredientRows.orphanCount = orphanCount;

    // Master rows with zero ingredients → WARNING (do not override existing ERROR)
    let noIngredientsCount = 0;
    let warningCount = 0;
    for (const m of result.masterRows.rows) {
      if (m.ingredientCount === 0 && m.recipeCode) {
        noIngredientsCount += 1;
        if (m.status !== 'ERROR') {
          m.issues.push('No ingredient rows found');
          m.issueSummary = m.issues.join('; ');
          m.status = 'WARNING';
          warningCount += 1;
        }
      }
    }
    result.masterRows.noIngredientsCount = noIngredientsCount;
    result.masterRows.warnings = warningCount;
    // Recompute master valid count (errors unchanged; warnings reduce valid)
    result.masterRows.valid = result.masterRows.rows.filter((r) => r.status === 'VALID').length;

    if (orphanCount > 0) {
      errors.push(`RECIPE_INGREDIENTS_IMPORT has ${orphanCount} orphan row(s) (unknown recipe_code).`);
    }
    if (warningCount > 0) {
      warnings.push(`${warningCount} master recipe(s) have no ingredient rows.`);
    }
  }

  // Phase 1E: Procedure rows + cross-check master ↔ procedure via recipe_code.
  const procReal = sheetByLower.get(norm('RECIPE_PROCEDURE_IMPORT'));
  const procCol = result.columnChecks.find((c) => c.sheet === 'RECIPE_PROCEDURE_IMPORT');
  if (procReal && procCol && procCol.status === 'VALID') {
    try {
      const ws = wb.Sheets[procReal];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: '',
        blankrows: false,
      });
      const sample = rawRows[0] ?? {};
      const keyMap = new Map<string, string>();
      for (const k of Object.keys(sample)) keyMap.set(norm(k), k);
      if (keyMap.size === 0) {
        for (const r of rawRows) for (const k of Object.keys(r)) keyMap.set(norm(k), k);
      }
      const a = COLUMN_ALIASES.RECIPE_PROCEDURE_IMPORT;
      const codeKey = a.recipe_code.map((al) => keyMap.get(al)).find(Boolean) as string | undefined;
      const stepKey = a.step_number.map((al) => keyMap.get(al)).find(Boolean) as string | undefined;
      const instrKey = a.instruction.map((al) => keyMap.get(al)).find(Boolean) as string | undefined;

      const rows: ProcedureRowCheck[] = [];
      let blankRecipeCode = 0;

      rawRows.forEach((row, idx) => {
        const recipeCode = codeKey ? String(row[codeKey] ?? '').trim() : '';
        const stepNumber = stepKey ? String(row[stepKey] ?? '').trim() : '';
        const instruction = instrKey ? String(row[instrKey] ?? '').trim() : '';

        const anyMeaningful = Object.values(row).some(
          (v) => String(v ?? '').trim() !== '',
        );
        if (!recipeCode && !stepNumber && !instruction && !anyMeaningful) return;

        const issues: string[] = [];
        if (!recipeCode) { issues.push('Missing recipe_code'); blankRecipeCode += 1; }

        rows.push({
          rowNumber: idx + 2,
          recipeCode,
          stepNumber,
          instruction,
          status: issues.length ? 'ERROR' : 'VALID',
          issues,
          issueSummary: issues.join('; '),
          isOrphan: false,
        });
      });

      result.procedureRows = {
        evaluated: true,
        totalVisible: rows.length,
        valid: rows.filter((r) => r.status === 'VALID').length,
        errors: rows.filter((r) => r.status === 'ERROR').length,
        blankRecipeCodeCount: blankRecipeCode,
        orphanCount: 0,
        rows,
      };
    } catch {
      errors.push('RECIPE_PROCEDURE_IMPORT rows could not be read.');
    }
  }

  // Phase 1E cross-check: master ↔ procedure rows
  if (result.masterRows.evaluated && result.procedureRows.evaluated) {
    const masterCodes = new Map<string, number>();
    result.masterRows.rows.forEach((m, i) => {
      if (m.recipeCode) masterCodes.set(m.recipeCode.trim().toLowerCase(), i);
    });

    let orphanCount = 0;
    for (const proc of result.procedureRows.rows) {
      if (!proc.recipeCode) continue;
      const key = proc.recipeCode.trim().toLowerCase();
      const masterIdx = masterCodes.get(key);
      if (masterIdx === undefined) {
        proc.isOrphan = true;
        proc.issues.push('recipe_code not found in RECIPES_MASTER_IMPORT');
        proc.issueSummary = proc.issues.join('; ');
        if (proc.status !== 'ERROR') proc.status = 'ERROR';
        orphanCount += 1;
      } else {
        result.masterRows.rows[masterIdx].procedureCount += 1;
      }
    }

    const procValid = result.procedureRows.rows.filter((r) => r.status === 'VALID').length;
    result.procedureRows.valid = procValid;
    result.procedureRows.errors = result.procedureRows.rows.length - procValid;
    result.procedureRows.orphanCount = orphanCount;

    // Master rows with zero procedures → WARNING (do not override existing ERROR)
    let noProceduresCount = 0;
    let addedWarnings = 0;
    for (const m of result.masterRows.rows) {
      if (m.procedureCount === 0 && m.recipeCode) {
        noProceduresCount += 1;
        if (m.status !== 'ERROR') {
          m.issues.push('No procedure rows found');
          m.issueSummary = m.issues.join('; ');
          if (m.status !== 'WARNING') {
            m.status = 'WARNING';
            addedWarnings += 1;
          }
        }
      }
    }
    result.masterRows.noProceduresCount = noProceduresCount;
    result.masterRows.warnings += addedWarnings;
    result.masterRows.valid = result.masterRows.rows.filter((r) => r.status === 'VALID').length;

    if (orphanCount > 0) {
      errors.push(`RECIPE_PROCEDURE_IMPORT has ${orphanCount} orphan row(s) (unknown recipe_code).`);
    }
    if (noProceduresCount > 0) {
      warnings.push(`${noProceduresCount} master recipe(s) have no procedure rows.`);
    }
  }

  result.workbookValid = errors.length === 0;
  return result;
}