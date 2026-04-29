/**
 * Ingredient Import / Export logic.
 *
 * Rules (per spec):
 *  - Matching is case-insensitive + trimmed, exact label only (no fuzzy).
 *  - Validate against ACTIVE option list values only for new selections.
 *  - Required fields: ID (code), Name, Type, Category, Unit, Active.
 *  - Existing ID -> UPDATE; new ID -> CREATE; never silently overwrite.
 *  - Export uses human-readable labels only (no internal codes/uuids).
 */

import * as XLSX from 'xlsx';
import Papa from 'papaparse';

import type {
  Ingredient,
  IngredientTypeRow,
  IngredientCategoryRow,
  RecipeUnit,
  Storehouse,
  CurrencyCode,
} from '@/hooks/useIngredients';
import { CURRENCIES, mapNameToLegacyEnum } from '@/hooks/useIngredients';

// ---------- Column headers (single source of truth for import & export) ----------

export const COLUMNS = {
  id: 'ID',
  name: 'Name',
  type: 'Ingredient Type',
  category: 'Ingredient Category',
  unit: 'Purchase Unit',
  storehouse: 'Storehouse',
  note: 'Note',
  active: 'Active',
  price: 'Purchase Cost',
  currency: 'Currency',
  conversionEnabled: 'Conversion Enabled',
  conversionQty: 'Purchase Unit Contains',
  conversionUnit: 'Usage Unit',
} as const;

/**
 * Header aliases — accepted alternate column headers from older exports
 * or hand-edited files. All values normalized to lower-case for matching.
 * The first item is the canonical header (must match COLUMNS).
 */
const HEADER_ALIASES: Record<keyof typeof COLUMNS, string[]> = {
  id: ['id', 'code', 'ingredient id', 'ingredient code', 'sku'],
  name: ['name', 'ingredient name', 'name (en)', 'name_en'],
  type: ['ingredient type', 'type', 'ingredient_type', 'item type'],
  category: ['ingredient category', 'category', 'ingredient_category'],
  unit: ['purchase unit', 'unit', 'base unit', 'uom'],
  storehouse: ['storehouse', 'store house', 'storage', 'warehouse'],
  note: ['note', 'notes', 'remark', 'remarks'],
  active: ['active', 'is active', 'enabled', 'status'],
  price: ['purchase cost', 'price', 'unit price', 'cost'],
  currency: ['currency', 'ccy'],
  conversionEnabled: ['conversion enabled', 'conversion_enabled', 'conv enabled'],
  conversionQty: ['purchase unit contains', 'conversion qty', 'conversion_qty', 'conversion quantity', 'conv qty'],
  conversionUnit: ['usage unit', 'conversion unit', 'conversion_unit', 'conv unit'],
};

export const EXPORT_HEADER_ORDER = [
  COLUMNS.id,
  COLUMNS.name,
  COLUMNS.type,
  COLUMNS.category,
  COLUMNS.unit,
  COLUMNS.storehouse,
  COLUMNS.note,
  COLUMNS.active,
  COLUMNS.price,
  COLUMNS.currency,
  COLUMNS.conversionEnabled,
  COLUMNS.conversionQty,
  COLUMNS.conversionUnit,
] as const;

// ---------- Types ----------

export type RowSeverity = 'valid' | 'warning' | 'invalid';
/**
 * - 'create'  → ID not found in DB → will INSERT a new ingredient (label: NEW)
 * - 'update'  → ID matches an existing ingredient → will REPLACE all import-supported
 *              fields on that record (UUID preserved). Label: REPLACE.
 * - 'skip'    → row failed validation; will not be imported. Label: INVALID.
 */
export type RowAction = 'create' | 'update' | 'skip';

export const ACTION_LABEL: Record<RowAction, string> = {
  create: 'NEW',
  update: 'REPLACE',
  skip: 'INVALID',
};

export interface ImportRow {
  rowNumber: number; // 1-based, including header? -> we treat as data-row index starting at 2
  raw: Record<string, string>;
  errors: string[];   // makes row INVALID
  warnings: string[]; // row still importable
  severity: RowSeverity;
  action: RowAction;  // create | update | skip (skip when invalid)
  parsed?: ParsedIngredientPayload;
  existingId?: string; // db uuid when matched by code
}

export interface ParsedIngredientPayload {
  code: string;
  name_en: string;
  name_vi: string | null;
  is_active: boolean;
  ingredient_type_id: string;
  ingredient_type: 'batch_recipe' | 'bottled_drink' | 'ingredient' | 'other';
  ingredient_category_id: string;
  base_unit_id: string;
  storehouse_id: string | null;
  notes: string | null;
  price: number | null;
  currency: CurrencyCode;
  conversion_enabled: boolean;
  conversion_qty: number | null;
  conversion_unit_id: string | null;
}

export interface MasterLists {
  ingredients: Ingredient[];
  types: IngredientTypeRow[];
  categories: IngredientCategoryRow[];
  units: RecipeUnit[];
  storehouses: Storehouse[];
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

// ---------- Helpers ----------

const norm = (v: unknown) => String(v ?? '').trim();
const normKey = (v: unknown) => norm(v).toLowerCase();

/** Aggressive label normalizer for unit/type matching: lowercase, trim,
 * collapse internal whitespace, and remove spaces around '/'. */
const normLabel = (v: unknown) => {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ');
};

/** Build canonical-header lookup from any aliased header. */
function buildHeaderAliasMap(): Map<string, keyof typeof COLUMNS> {
  const m = new Map<string, keyof typeof COLUMNS>();
  for (const key of Object.keys(COLUMNS) as Array<keyof typeof COLUMNS>) {
    // Canonical header itself
    m.set(COLUMNS[key].toLowerCase(), key);
    for (const alias of HEADER_ALIASES[key]) {
      m.set(alias.toLowerCase(), key);
    }
  }
  return m;
}
const HEADER_ALIAS_MAP = buildHeaderAliasMap();

/** Build a case-insensitive lookup of ACTIVE options keyed by normalized labels.
 * Each item can be indexed under multiple keys (e.g. name_en and name_vi). */
function buildActiveLookup<T extends { is_active: boolean }>(
  items: T[],
  getLabels: (item: T) => Array<string | null | undefined>,
) {
  const m = new Map<string, T>();
  for (const it of items) {
    if (!it.is_active) continue;
    for (const raw of getLabels(it)) {
      const key = normLabel(raw);
      if (key && !m.has(key)) m.set(key, it);
    }
  }
  return m;
}

/** Comma-list of available active labels for error messages. */
function listLabels<T>(items: T[], getLabel: (item: T) => string, limit = 10): string {
  const labels = items.map(getLabel).filter(Boolean);
  if (labels.length <= limit) return labels.join(', ');
  return labels.slice(0, limit).join(', ') + `, … (${labels.length - limit} more)`;
}

const TRUE_SET = new Set(['yes', 'y', 'true', '1', 'active', 'enabled']);
const FALSE_SET = new Set(['no', 'n', 'false', '0', 'inactive', 'disabled', 'archived']);

// ---------- Export ----------

export interface ExportOptions {
  scope: 'all' | 'active' | 'filtered';
  filteredIds?: Set<string>;
  exportedBy?: string;
  fileName?: string;
}

export function buildExportRows(
  ingredients: Ingredient[],
  master: Omit<MasterLists, 'ingredients'>,
  opts: ExportOptions,
): Record<string, string | number | null>[] {
  const typeById = new Map(master.types.map((t) => [t.id, t]));
  const catById = new Map(master.categories.map((c) => [c.id, c]));
  const unitById = new Map(master.units.map((u) => [u.id, u]));
  const shById = new Map(master.storehouses.map((s) => [s.id, s]));

  let rows = ingredients;
  if (opts.scope === 'active') rows = rows.filter((i) => i.is_active);
  if (opts.scope === 'filtered' && opts.filteredIds) {
    rows = rows.filter((i) => opts.filteredIds!.has(i.id));
  }

  return rows.map((i) => ({
    [COLUMNS.id]: i.code ?? '',
    [COLUMNS.name]: i.name_en ?? '',
    
    [COLUMNS.type]: i.ingredient_type_id
      ? typeById.get(i.ingredient_type_id)?.name_en ?? ''
      : '',
    [COLUMNS.category]: i.ingredient_category_id ? catById.get(i.ingredient_category_id)?.name_en ?? '' : '',
    [COLUMNS.unit]: i.base_unit_id ? unitById.get(i.base_unit_id)?.name_en ?? '' : '',
    [COLUMNS.storehouse]: i.storehouse_id ? shById.get(i.storehouse_id)?.name ?? '' : '',
    [COLUMNS.note]: i.notes ?? '',
    [COLUMNS.active]: i.is_active ? 'Yes' : 'No',
    [COLUMNS.price]: i.price != null ? Number(i.price) : '',
    [COLUMNS.currency]: i.currency ?? '',
    [COLUMNS.conversionEnabled]: (i as any).conversion_enabled ? 'Yes' : 'No',
    [COLUMNS.conversionQty]: (i as any).conversion_qty != null ? Number((i as any).conversion_qty) : '',
    [COLUMNS.conversionUnit]: (i as any).conversion_unit_id
      ? unitById.get((i as any).conversion_unit_id)?.name_en ?? ''
      : '',
  }));
}

export function downloadXlsx(
  rows: Record<string, unknown>[],
  master: Omit<MasterLists, 'ingredients'>,
  opts: ExportOptions,
) {
  const wb = XLSX.utils.book_new();

  // Main sheet
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...EXPORT_HEADER_ORDER] });
  // Reasonable column widths
  ws['!cols'] = EXPORT_HEADER_ORDER.map((h) => ({
    wch: Math.max(h.length + 2, 14),
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Ingredients');

  // Metadata sheet
  const meta = [
    ['Exported At', new Date().toISOString()],
    ['Exported By', opts.exportedBy ?? ''],
    ['Scope', opts.scope],
    ['Row Count', String(rows.length)],
  ];
  const wsMeta = XLSX.utils.aoa_to_sheet(meta);
  wsMeta['!cols'] = [{ wch: 16 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata');

  // Allowed values sheet (helps users editing offline)
  const allowed: (string | number)[][] = [['Field', 'Allowed Value']];
  for (const t of master.types.filter((x) => x.is_active)) allowed.push(['Type', t.name_en]);
  for (const c of master.categories.filter((x) => x.is_active))
    allowed.push(['Ingredient Category', c.name_en]);
  for (const u of master.units.filter((x) => x.is_active)) allowed.push(['Unit', u.name_en]);
  for (const s of master.storehouses.filter((x) => x.is_active))
    allowed.push(['Storehouse', s.name]);
  for (const cur of CURRENCIES) allowed.push(['Currency', cur]);
  allowed.push(['Active', 'Yes']);
  allowed.push(['Active', 'No']);
  const wsAllowed = XLSX.utils.aoa_to_sheet(allowed);
  wsAllowed['!cols'] = [{ wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsAllowed, 'Allowed Values');

  XLSX.writeFile(wb, opts.fileName ?? `ingredients-${opts.scope}-${ymd()}.xlsx`);
}

function ymd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// ---------- Import: parse ----------

export async function readFileAsRows(file: File): Promise<Record<string, string>[]> {
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  if (isCsv) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => norm(h),
    });
    return (parsed.data ?? []).map((r) => normalizeRowKeys(r));
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === 'ingredients') ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  });
  return json.map((r) => normalizeRowKeys(r));
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const trimmed = norm(k);
    out[trimmed] = norm(v);
    // If this header matches a known alias, also expose the value under the canonical header
    const canonicalKey = HEADER_ALIAS_MAP.get(trimmed.toLowerCase());
    if (canonicalKey) {
      const canonicalHeader = COLUMNS[canonicalKey];
      if (!(canonicalHeader in out) || !out[canonicalHeader]) {
        out[canonicalHeader] = norm(v);
      }
    }
  }
  return out;
}

// ---------- Import: validate ----------

export function validateRows(
  fileRows: Record<string, string>[],
  master: MasterLists,
): ImportRow[] {
  // Index master records under multiple labels for case/whitespace/locale-tolerant matches.
  // For units, also index combined "EN/VI" form (e.g. "Liter/Lít") so exported headers
  // that interpolate both names still match the active record.
  const typeLk = buildActiveLookup(master.types, (t) => [
    t.name_en,
    t.name_vi,
    `${t.name_en}/${t.name_vi ?? ''}`,
  ]);
  const catLk = buildActiveLookup(master.categories, (c) => [
    c.name_en,
    c.name_vi,
    `${c.name_en}/${c.name_vi ?? ''}`,
  ]);
  // Units: build an ACTIVE-first lookup, then fold in INACTIVE units as
  // fallback aliases so exports that still reference an archived unit label
  // (e.g. "Liter/Lít") remain importable. Fake/unknown values still fail.
  const activeUnits = master.units.filter((u) => u.is_active);
  const inactiveUnits = master.units.filter((u) => !u.is_active);
  const unitLabels = (u: RecipeUnit) => [
    u.name_en,
    u.name_vi,
    `${u.name_en}/${u.name_vi ?? ''}`,
    u.code,
  ];
  const unitLk = new Map<string, RecipeUnit>();
  // First pass: active units (take precedence on key collisions).
  for (const u of activeUnits) {
    for (const raw of unitLabels(u)) {
      const key = normLabel(raw);
      if (key && !unitLk.has(key)) unitLk.set(key, u);
    }
  }
  // Second pass: inactive units — only fill keys that active didn't claim,
  // and resolve to an equivalent ACTIVE unit by name_en when possible so the
  // imported ingredient ends up pointing at an active base_unit_id.
  const activeByName = new Map<string, RecipeUnit>();
  for (const u of activeUnits) {
    const k = normLabel(u.name_en);
    if (k && !activeByName.has(k)) activeByName.set(k, u);
    const kv = normLabel(u.name_vi);
    if (kv && !activeByName.has(kv)) activeByName.set(kv, u);
  }
  for (const u of inactiveUnits) {
    const resolved =
      activeByName.get(normLabel(u.name_en)) ??
      activeByName.get(normLabel(u.name_vi)) ??
      u; // falls back to the inactive record itself
    for (const raw of unitLabels(u)) {
      const key = normLabel(raw);
      if (key && !unitLk.has(key)) unitLk.set(key, resolved);
    }
  }
  const shLk = buildActiveLookup(master.storehouses, (s) => [s.name]);
  const currencyLk = new Map<string, CurrencyCode>(
    CURRENCIES.map((c) => [c.toLowerCase(), c]),
  );
  const codeToIngredient = new Map<string, Ingredient>();
  for (const ing of master.ingredients) {
    const c = ing.code?.trim().toLowerCase();
    if (c) codeToIngredient.set(c, ing);
  }

  const seenCodes = new Map<string, number>(); // code(lower) -> first row number

  return fileRows.map((raw, idx): ImportRow => {
    const rowNumber = idx + 2; // +1 header, +1 1-based
    const errors: string[] = [];
    const warnings: string[] = [];

    const idVal = raw[COLUMNS.id] ?? '';
    const nameVal = raw[COLUMNS.name] ?? '';
    
    const typeVal = raw[COLUMNS.type] ?? '';
    const catVal = raw[COLUMNS.category] ?? '';
    const unitVal = raw[COLUMNS.unit] ?? '';
    const shVal = raw[COLUMNS.storehouse] ?? '';
    const noteVal = raw[COLUMNS.note] ?? '';
    const activeVal = raw[COLUMNS.active] ?? '';
    const priceVal = raw[COLUMNS.price] ?? '';
    const currencyVal = raw[COLUMNS.currency] ?? '';
    const convEnabledVal = raw[COLUMNS.conversionEnabled] ?? '';
    const convQtyVal = raw[COLUMNS.conversionQty] ?? '';
    const convUnitVal = raw[COLUMNS.conversionUnit] ?? '';

    // Required: ID
    const code = norm(idVal);
    if (!code) errors.push(`'${COLUMNS.id}' is required.`);

    // Duplicate ID inside the file
    if (code) {
      const lc = code.toLowerCase();
      if (seenCodes.has(lc)) {
        errors.push(
          `Duplicate '${COLUMNS.id}' '${code}' also appears on row ${seenCodes.get(lc)}.`,
        );
      } else {
        seenCodes.set(lc, rowNumber);
      }
    }

    // Required: Name
    const name_en = norm(nameVal);
    if (!name_en) errors.push(`'${COLUMNS.name}' is required.`);

    // Required: Type
    const typeMatch = typeLk.get(normLabel(typeVal));
    if (!norm(typeVal)) {
      errors.push(`'${COLUMNS.type}' is required.`);
    } else if (!typeMatch) {
      errors.push(
        `'${COLUMNS.type}' '${typeVal}' is invalid. Expected one of: ${listLabels(
          master.types.filter((x) => x.is_active),
          (t) => t.name_en,
        )}.`,
      );
    }

    // Required: Category
    const catMatch = catLk.get(normLabel(catVal));
    if (!norm(catVal)) {
      errors.push(`'${COLUMNS.category}' is required.`);
    } else if (!catMatch) {
      errors.push(
        `'${COLUMNS.category}' '${catVal}' is invalid. Expected one of: ${listLabels(
          master.categories.filter((x) => x.is_active),
          (c) => c.name_en,
        )}.`,
      );
    }

    // Required: Unit
    const unitMatch = unitLk.get(normLabel(unitVal));
    if (!norm(unitVal)) {
      errors.push(`'${COLUMNS.unit}' is required.`);
    } else if (!unitMatch) {
      errors.push(
        `'${COLUMNS.unit}' '${unitVal}' is invalid. Expected one of: ${listLabels(
          master.units.filter((x) => x.is_active),
          (u) => u.name_en,
        )}.`,
      );
    }

    // Required: Active
    let is_active = true;
    const activeKey = normKey(activeVal);
    if (!activeKey) {
      errors.push(`'${COLUMNS.active}' is required (Yes or No).`);
    } else if (TRUE_SET.has(activeKey)) {
      is_active = true;
    } else if (FALSE_SET.has(activeKey)) {
      is_active = false;
    } else {
      errors.push(`'${COLUMNS.active}' '${activeVal}' is invalid. Expected: Yes or No.`);
    }

    // Optional: Storehouse
    let storehouse_id: string | null = null;
    if (norm(shVal)) {
      const m = shLk.get(normLabel(shVal));
      if (!m) {
        errors.push(
          `'${COLUMNS.storehouse}' '${shVal}' is invalid. Expected one of: ${listLabels(
            master.storehouses.filter((x) => x.is_active),
            (s) => s.name,
          )}.`,
        );
      } else {
        storehouse_id = m.id;
      }
    }

    // Optional: Price (numeric)
    let price: number | null = null;
    if (norm(priceVal)) {
      const cleaned = norm(priceVal).replace(/,/g, '');
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`'${COLUMNS.price}' '${priceVal}' is not a valid non-negative number.`);
      } else {
        price = n;
      }
    }

    // Optional: Currency
    let currency: CurrencyCode = 'VND';
    if (norm(currencyVal)) {
      const m = currencyLk.get(normKey(currencyVal));
      if (!m) {
        errors.push(
          `'${COLUMNS.currency}' '${currencyVal}' is invalid. Expected one of: ${CURRENCIES.join(
            ', ',
          )}.`,
        );
      } else {
        currency = m;
      }
    } else if (price != null) {
      warnings.push(`'${COLUMNS.currency}' is empty — defaulting to VND.`);
    }

    // Optional: Conversion fields (never block import).
    let conversion_enabled = false;
    const convEnabledKey = normKey(convEnabledVal);
    if (convEnabledKey) {
      if (TRUE_SET.has(convEnabledKey)) conversion_enabled = true;
      else if (FALSE_SET.has(convEnabledKey)) conversion_enabled = false;
      else warnings.push(`'${COLUMNS.conversionEnabled}' '${convEnabledVal}' not recognized — treated as No.`);
    }
    let conversion_qty: number | null = null;
    if (norm(convQtyVal)) {
      const cleanedQ = norm(convQtyVal).replace(/,/g, '');
      const qn = Number(cleanedQ);
      if (!Number.isFinite(qn) || qn <= 0) {
        warnings.push(`'${COLUMNS.conversionQty}' '${convQtyVal}' is not a valid positive number — ignored.`);
      } else {
        conversion_qty = qn;
      }
    }
    let conversion_unit_id: string | null = null;
    if (norm(convUnitVal)) {
      const m = unitLk.get(normLabel(convUnitVal));
      if (!m) {
        warnings.push(`'${COLUMNS.conversionUnit}' '${convUnitVal}' is invalid — ignored.`);
      } else {
        conversion_unit_id = m.id;
      }
    }
    if (conversion_enabled && (conversion_qty == null || !conversion_unit_id)) {
      warnings.push(`Conversion is incomplete. Recipe cost may need manual adjustment.`);
    }

    // Existing record by code
    const existing = code ? codeToIngredient.get(code.toLowerCase()) : undefined;

    const severity: RowSeverity =
      errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid';
    const action: RowAction =
      severity === 'invalid' ? 'skip' : existing ? 'update' : 'create';

    let parsed: ParsedIngredientPayload | undefined;
    if (severity !== 'invalid' && typeMatch && catMatch && unitMatch) {
      parsed = {
        code,
        name_en,
        name_vi: null,
        is_active,
        ingredient_type_id: typeMatch.id,
        ingredient_type: mapNameToLegacyEnum(typeMatch.name_en),
        ingredient_category_id: catMatch.id,
        base_unit_id: unitMatch.id,
        storehouse_id,
        notes: norm(noteVal) || null,
        price,
        currency,
        conversion_enabled,
        conversion_qty,
        conversion_unit_id,
      };
    }

    return {
      rowNumber,
      raw,
      errors,
      warnings,
      severity,
      action,
      parsed,
      existingId: existing?.id,
    };
  });
}
