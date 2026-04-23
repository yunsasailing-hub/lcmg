import * as XLSX from 'xlsx';
import { COLUMN_ALIASES, type ValidationResult } from '@/lib/recipeImportValidation';

// Supabase client type kept loose to avoid coupling; we use the exported `supabase` instance.
type SB = any;

export type ImportActionExec = 'NEW' | 'UPDATE';
export type ImportRowResult = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface ImportRecipeReport {
  recipeCode: string;
  recipeName: string;
  importAction: ImportActionExec;
  result: ImportRowResult;
  issueSummary: string;
  ingredientsInserted: number;
  proceduresInserted: number;
  hadNoIngredients: boolean;
  hadNoProcedures: boolean;
}

export interface ImportRunResult {
  totalRecipesProcessed: number;
  recipesCreated: number;
  recipesUpdated: number;
  recipesFailed: number;
  ingredientRowsInserted: number;
  procedureRowsInserted: number;
  recipesWithWarnings: number;
  recipesWithBlankIngredients: number;
  recipesWithBlankProcedures: number;
  rows: ImportRecipeReport[];
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

function buildKeyMap(rows: Record<string, unknown>[]): Map<string, string> {
  const keyMap = new Map<string, string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!keyMap.has(norm(k))) keyMap.set(norm(k), k);
  return keyMap;
}

function pick(row: Record<string, unknown>, keyMap: Map<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const k = keyMap.get(norm(a));
    if (k !== undefined) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
}

function pickNumber(row: Record<string, unknown>, keyMap: Map<string, string>, ...aliases: string[]): number | null {
  const raw = pick(row, keyMap, ...aliases);
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
}

function pickBoolean(row: Record<string, unknown>, keyMap: Map<string, string>, ...aliases: string[]): boolean | null {
  const raw = pick(row, keyMap, ...aliases).toLowerCase();
  if (!raw) return null;
  if (['1', 'true', 'yes', 'y', 'x'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n'].includes(raw)) return false;
  return null;
}

const VALID_DEPTS = ['management', 'kitchen', 'pizza', 'service', 'bar', 'office', 'bakery'];
const VALID_CURRENCIES = ['VND', 'USD', 'EUR'];

interface MasterRaw {
  recipeCode: string;
  recipeName: string;
  data: Record<string, unknown>;
}

interface IngredientRaw {
  recipeCode: string;
  ingredientCode: string;
  quantity: number;
  unit: string;
  prepNote: string | null;
  costAdjustPct: number;
  rowNumber: number;
}

interface ProcedureRaw {
  recipeCode: string;
  stepNumber: number;
  instruction: string;
  warning: string | null;
  tool: string | null;
  duration: number | null;
  temperature: string | null;
  note: string | null;
  rowNumber: number;
}

export async function executeRecipeImport(
  file: File,
  validation: ValidationResult,
  supabase: SB,
): Promise<ImportRunResult> {
  if (validation.errors.length > 0) {
    throw new Error('Import blocked. Resolve all errors before importing.');
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetByLower = new Map(wb.SheetNames.map((n) => [n.toLowerCase(), n]));

  // ---- Read master rows ----
  const masterSheet = sheetByLower.get('recipes_master_import');
  const masterRaw: MasterRaw[] = [];
  if (masterSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[masterSheet], { defval: '', blankrows: false });
    const km = buildKeyMap(rows);
    const codeAliases = COLUMN_ALIASES.RECIPES_MASTER_IMPORT.recipe_code;
    const nameAliases = COLUMN_ALIASES.RECIPES_MASTER_IMPORT.recipe_name;
    for (const row of rows) {
      const code = pick(row, km, ...codeAliases);
      const name = pick(row, km, ...nameAliases);
      if (!code) continue;
      masterRaw.push({ recipeCode: code, recipeName: name, data: row });
    }
  }

  // Filter master against validation: keep only rows whose validator status is not ERROR
  const validatorByCode = new Map<string, (typeof validation.masterRows.rows)[number]>();
  for (const r of validation.masterRows.rows) {
    if (r.recipeCode) validatorByCode.set(r.recipeCode.trim().toLowerCase(), r);
  }

  // ---- Read ingredient rows grouped by recipe_code ----
  const ingredientsByCode = new Map<string, IngredientRaw[]>();
  const ingSheet = sheetByLower.get('recipe_ingredients_import');
  if (ingSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[ingSheet], { defval: '', blankrows: false });
    const km = buildKeyMap(rows);
    const a = COLUMN_ALIASES.RECIPE_INGREDIENTS_IMPORT;
    const validIngByRow = new Map<number, (typeof validation.ingredientRows.rows)[number]>();
    validation.ingredientRows.rows.forEach((r) => validIngByRow.set(r.rowNumber, r));
    rows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const v = validIngByRow.get(rowNumber);
      if (!v || v.status === 'ERROR') return; // skip invalid/orphan
      const code = pick(row, km, ...a.recipe_code);
      const ingCode = pick(row, km, ...a.ingredient_code);
      const qty = typeof v.quantity === 'number' ? v.quantity : Number(pick(row, km, ...a.quantity).replace(/,/g, '.')) || 0;
      const unit = pick(row, km, ...a.unit);
      const prepNote = pick(row, km, 'prep_note', 'note') || null;
      const adjPctRaw = pickNumber(row, km, 'cost_adjust_pct', 'adj_pct');
      const adjPct = adjPctRaw ?? 0;
      if (!code) return;
      const list = ingredientsByCode.get(code.toLowerCase()) ?? [];
      list.push({ recipeCode: code, ingredientCode: ingCode, quantity: qty, unit, prepNote, costAdjustPct: adjPct, rowNumber });
      ingredientsByCode.set(code.toLowerCase(), list);
    });
  }

  // ---- Read procedure rows grouped by recipe_code ----
  const proceduresByCode = new Map<string, ProcedureRaw[]>();
  const procSheet = sheetByLower.get('recipe_procedure_import');
  if (procSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[procSheet], { defval: '', blankrows: false });
    const km = buildKeyMap(rows);
    const a = COLUMN_ALIASES.RECIPE_PROCEDURE_IMPORT;
    const validProcByRow = new Map<number, (typeof validation.procedureRows.rows)[number]>();
    validation.procedureRows.rows.forEach((r) => validProcByRow.set(r.rowNumber, r));
    rows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const v = validProcByRow.get(rowNumber);
      if (!v || v.status === 'ERROR') return;
      const code = pick(row, km, ...a.recipe_code);
      const stepRaw = pick(row, km, ...a.step_number);
      const stepNumber = Number(stepRaw) || 0;
      const instruction = pick(row, km, ...a.instruction);
      if (!code || !instruction) return;
      const list = proceduresByCode.get(code.toLowerCase()) ?? [];
      list.push({
        recipeCode: code,
        stepNumber,
        instruction,
        warning: pick(row, km, 'warning') || null,
        tool: pick(row, km, 'tool') || null,
        duration: pickNumber(row, km, 'duration_minutes', 'duration', 'time'),
        temperature: pick(row, km, 'temperature') || null,
        note: pick(row, km, 'note') || null,
        rowNumber,
      });
      proceduresByCode.set(code.toLowerCase(), list);
    });
  }

  // ---- Resolve lookup tables (ingredient codes, units, categories, types) ----
  const allIngCodes = new Set<string>();
  for (const list of ingredientsByCode.values()) for (const i of list) if (i.ingredientCode) allIngCodes.add(i.ingredientCode);
  const allUnitCodes = new Set<string>();
  for (const list of ingredientsByCode.values()) for (const i of list) if (i.unit) allUnitCodes.add(i.unit);
  // Add yield_unit codes from master
  for (const m of masterRaw) {
    const km = buildKeyMap([m.data]);
    const yu = pick(m.data, km, 'yield_unit');
    if (yu) allUnitCodes.add(yu);
  }

  const ingMap = new Map<string, string>(); // lower(code) -> ingredient_id
  if (allIngCodes.size > 0) {
    const codes = Array.from(allIngCodes);
    const { data } = await supabase.from('ingredients').select('id, code').in('code', codes);
    for (const r of data ?? []) {
      if (r.code) ingMap.set(String(r.code).toLowerCase(), r.id);
    }
  }
  const unitMap = new Map<string, string>(); // lower(code) -> unit id
  if (allUnitCodes.size > 0) {
    const { data } = await supabase.from('recipe_units').select('id, code').in('code', Array.from(allUnitCodes));
    for (const r of data ?? []) {
      if (r.code) unitMap.set(String(r.code).toLowerCase(), r.id);
    }
  }
  // Category + recipe type lookups
  const { data: cats } = await supabase.from('recipe_categories').select('id, name_en, name_vi');
  const catMap = new Map<string, string>();
  for (const c of cats ?? []) {
    if (c.name_en) catMap.set(String(c.name_en).toLowerCase(), c.id);
    if (c.name_vi) catMap.set(String(c.name_vi).toLowerCase(), c.id);
  }
  const { data: types } = await supabase.from('recipe_types').select('id, name_en, name_vi');
  const typeMap = new Map<string, string>();
  for (const t of types ?? []) {
    if (t.name_en) typeMap.set(String(t.name_en).toLowerCase(), t.id);
    if (t.name_vi) typeMap.set(String(t.name_vi).toLowerCase(), t.id);
  }
  const { data: branches } = await supabase.from('branches').select('id, name');
  const branchMap = new Map<string, string>();
  for (const b of branches ?? []) {
    if (b.name) branchMap.set(String(b.name).toLowerCase(), b.id);
  }

  // ---- Process per-recipe ----
  const report: ImportRecipeReport[] = [];
  let created = 0, updated = 0, failed = 0, ingInserted = 0, procInserted = 0;
  let warnings = 0, blankIng = 0, blankProc = 0;

  for (const m of masterRaw) {
    const v = validatorByCode.get(m.recipeCode.toLowerCase());
    if (!v || v.status === 'ERROR' || v.importAction === 'ERROR' || v.importAction === 'PENDING') {
      // skip rows not eligible (orphan/blocked etc.)
      continue;
    }
    const action: ImportActionExec = v.importAction === 'UPDATE' ? 'UPDATE' : 'NEW';
    const km = buildKeyMap([m.data]);

    // Build master payload
    const description = pick(m.data, km, 'description') || null;
    const categoryName = pick(m.data, km, 'category');
    const typeName = pick(m.data, km, 'type', 'recipe_type');
    const branchName = pick(m.data, km, 'branch');
    const deptRaw = pick(m.data, km, 'department').toLowerCase();
    const yieldQty = pickNumber(m.data, km, 'yield_qty', 'yield_quantity');
    const yieldUnitRaw = pick(m.data, km, 'yield_unit');
    const portionQty = pickNumber(m.data, km, 'portion_qty', 'portion_quantity');
    const portionUnit = pick(m.data, km, 'portion_unit') || null;
    const shelfLifeQty = pick(m.data, km, 'shelf_life_qty', 'shelf_life');
    const shelfLifeUnit = pick(m.data, km, 'shelf_life_unit');
    const sellingPrice = pickNumber(m.data, km, 'selling_price', 'price');
    const currencyRaw = pick(m.data, km, 'currency').toUpperCase();
    const memo = pick(m.data, km, 'memo', 'internal_memo') || null;
    const useAsIngredient = pickBoolean(m.data, km, 'use_as_ingredient');
    const active = pickBoolean(m.data, km, 'active', 'is_active');

    const payload: Record<string, unknown> = {
      code: m.recipeCode,
      name_en: m.recipeName || m.recipeCode,
      description,
    };
    const nameVi = pick(m.data, km, 'name_vi', 'recipe_name_vi');
    if (nameVi) payload.name_vi = nameVi;
    if (categoryName) {
      const cid = catMap.get(categoryName.toLowerCase());
      if (cid) payload.category_id = cid;
    }
    if (typeName) {
      const tid = typeMap.get(typeName.toLowerCase());
      if (tid) payload.recipe_type_id = tid;
    }
    if (branchName) {
      const bid = branchMap.get(branchName.toLowerCase());
      if (bid) payload.branch_id = bid;
    }
    if (deptRaw && VALID_DEPTS.includes(deptRaw)) payload.department = deptRaw;
    if (yieldQty !== null) payload.yield_quantity = yieldQty;
    if (yieldUnitRaw) {
      const uid = unitMap.get(yieldUnitRaw.toLowerCase());
      if (uid) payload.yield_unit_id = uid;
    }
    if (portionQty !== null) payload.portion_quantity = portionQty;
    if (portionUnit) payload.portion_unit = portionUnit;
    const shelfLifeCombined = [shelfLifeQty, shelfLifeUnit].filter(Boolean).join(' ').trim();
    if (shelfLifeCombined) payload.shelf_life = shelfLifeCombined;
    if (sellingPrice !== null) payload.selling_price = sellingPrice;
    if (currencyRaw && VALID_CURRENCIES.includes(currencyRaw)) payload.currency = currencyRaw;
    if (memo) payload.internal_memo = memo;
    if (useAsIngredient !== null) payload.use_as_ingredient = useAsIngredient;
    if (active !== null) payload.is_active = active;

    const ingList = ingredientsByCode.get(m.recipeCode.toLowerCase()) ?? [];
    const procList = proceduresByCode.get(m.recipeCode.toLowerCase()) ?? [];

    let recipeId: string | null = null;
    let result: ImportRowResult = 'SUCCESS';
    const issues: string[] = [];

    try {
      if (action === 'NEW') {
        const { data, error } = await supabase.from('recipes').insert(payload).select('id').single();
        if (error) throw error;
        recipeId = data.id;
        created += 1;
      } else {
        const { data: existing, error: findErr } = await supabase
          .from('recipes').select('id').eq('code', m.recipeCode).maybeSingle();
        if (findErr) throw findErr;
        if (!existing) throw new Error('Recipe disappeared from DB');
        recipeId = existing.id;
        const { error } = await supabase.from('recipes').update(payload).eq('id', recipeId);
        if (error) throw error;
        // Full-replace strategy: clear existing children
        const [delIng, delProc] = await Promise.all([
          supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId),
          supabase.from('recipe_procedures').delete().eq('recipe_id', recipeId),
        ]);
        if (delIng.error) throw delIng.error;
        if (delProc.error) throw delProc.error;
        updated += 1;
      }

      // Insert ingredient lines
      let insertedIng = 0;
      if (recipeId && ingList.length > 0) {
        const ingPayload = ingList
          .map((i, idx) => {
            const ingredient_id = i.ingredientCode ? ingMap.get(i.ingredientCode.toLowerCase()) ?? null : null;
            const unit_id = i.unit ? unitMap.get(i.unit.toLowerCase()) ?? null : null;
            return {
              recipe_id: recipeId!,
              ingredient_id,
              unit_id,
              quantity: i.quantity,
              prep_note: i.prepNote,
              cost_adjust_pct: i.costAdjustPct,
              sort_order: idx,
            };
          })
          // Skip lines where ingredient_id couldn't be resolved (no FK match in DB)
          .filter((p) => p.ingredient_id !== null);
        if (ingPayload.length > 0) {
          const { error } = await supabase.from('recipe_ingredients').insert(ingPayload);
          if (error) throw error;
          insertedIng = ingPayload.length;
        }
        const skipped = ingList.length - insertedIng;
        if (skipped > 0) issues.push(`${skipped} ingredient line(s) skipped: ingredient_code not found in database`);
      }
      ingInserted += insertedIng;

      // Insert procedure rows
      let insertedProc = 0;
      if (recipeId && procList.length > 0) {
        const procPayload = procList.map((p, idx) => ({
          recipe_id: recipeId!,
          step_number: p.stepNumber || idx + 1,
          instruction_en: p.instruction,
          warning: p.warning,
          tool: p.tool,
          duration_minutes: p.duration,
          temperature: p.temperature,
          note: p.note,
        }));
        const { error } = await supabase.from('recipe_procedures').insert(procPayload);
        if (error) throw error;
        insertedProc = procPayload.length;
      }
      procInserted += insertedProc;

      const hadNoIng = ingList.length === 0;
      const hadNoProc = procList.length === 0;
      if (hadNoIng) { blankIng += 1; issues.push('No ingredient rows'); }
      if (hadNoProc) { blankProc += 1; issues.push('No procedure rows'); }
      if (v.status === 'WARNING') warnings += 1;

      report.push({
        recipeCode: m.recipeCode,
        recipeName: m.recipeName,
        importAction: action,
        result,
        issueSummary: issues.length ? `Imported successfully — ${issues.join('; ')}` : 'Imported successfully',
        ingredientsInserted: insertedIng,
        proceduresInserted: insertedProc,
        hadNoIngredients: hadNoIng,
        hadNoProcedures: hadNoProc,
      });
    } catch (e) {
      failed += 1;
      result = 'FAILED';
      report.push({
        recipeCode: m.recipeCode,
        recipeName: m.recipeName,
        importAction: action,
        result,
        issueSummary: e instanceof Error ? `Failed: ${e.message}` : 'Failed during import',
        ingredientsInserted: 0,
        proceduresInserted: 0,
        hadNoIngredients: ingList.length === 0,
        hadNoProcedures: procList.length === 0,
      });
    }
  }

  return {
    totalRecipesProcessed: report.length,
    recipesCreated: created,
    recipesUpdated: updated,
    recipesFailed: failed,
    ingredientRowsInserted: ingInserted,
    procedureRowsInserted: procInserted,
    recipesWithWarnings: warnings,
    recipesWithBlankIngredients: blankIng,
    recipesWithBlankProcedures: blankProc,
    rows: report,
  };
}
