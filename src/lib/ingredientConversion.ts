/**
 * Ingredient unit conversion helpers.
 *
 * Adds an OPTIONAL conversion layer on top of the existing purchase price/unit
 * pair. Existing logic (price = price per purchase unit) is unchanged.
 *
 * - "Container" purchase units (Bottle/Chai, Jar/Lọ, Box/Hộp, Can/Lon,
 *   Pack/Gói, Package/Bao, Package/Bịch) can opt into a conversion such as
 *   "1 Package/Bao = 25 Kg", giving recipes a per-Kg/per-Gram cost.
 * - Recipe lines also get same-family fallback conversion (Kg↔Gram, Liter/Lít↔ml).
 */

export type WeightUnitKey = 'kg' | 'gram' | 'g';
export type VolumeUnitKey = 'liter' | 'lit' | 'ml';

const norm = (v: string | null | undefined) =>
  String(v ?? '').trim().toLowerCase().replace(/\s*\/\s*/g, '/');

/** Hardcoded list of container/package unit names (matched by name_en or "EN/VI"). */
const CONTAINER_NAME_TOKENS = [
  'bottle', 'bottle/chai', 'chai',
  'jar', 'jar/lọ', 'lọ', 'lo',
  'box', 'box/hộp', 'hộp', 'hop',
  'can', 'can/lon', 'lon',
  'pack', 'pack/gói', 'gói', 'goi',
  'package', 'package/bao', 'bao',
  'package/bịch', 'bịch', 'bich',
];

/** Returns true if the given unit name (e.g. "Package/Bao", "Bao") is a container. */
export function isContainerUnitName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = norm(name);
  if (CONTAINER_NAME_TOKENS.some((t) => n === t)) return true;
  // Tolerate "Package/Bao" forms
  return CONTAINER_NAME_TOKENS.some((t) => n.includes(t));
}

/** Calculated cost per 1 converted unit (e.g. 500,000 / 25 = 20,000 / Kg). */
export function calculateUnitCost(
  purchasePrice: number | null | undefined,
  conversionQty: number | null | undefined,
): number | null {
  const p = Number(purchasePrice);
  const q = Number(conversionQty);
  if (!Number.isFinite(p) || !Number.isFinite(q) || q <= 0) return null;
  return p / q;
}

/** Same-family conversion factor from `fromName` to `toName`. Returns null if incompatible. */
export function sameFamilyFactor(
  fromName: string | null | undefined,
  toName: string | null | undefined,
): number | null {
  const f = norm(fromName);
  const t = norm(toName);
  if (!f || !t) return null;

  // Accept "Liter/Lít" combined headers too
  const has = (s: string, ...keys: string[]) => keys.some((k) => s === k || s.includes(k));

  // Weight: kg <-> gram
  const isKg = (s: string) => has(s, 'kg', 'kilogram');
  const isGram = (s: string) => has(s, 'gram', 'g') && !has(s, 'kg');
  // Volume: liter / lít <-> ml
  const isLiter = (s: string) => has(s, 'liter', 'lit', 'lít', 'l') && !has(s, 'ml');
  const isMl = (s: string) => has(s, 'ml', 'milliliter');

  if (isKg(f) && isGram(t)) return 1000;
  if (isGram(f) && isKg(t)) return 1 / 1000;
  if (isLiter(f) && isMl(t)) return 1000;
  if (isMl(f) && isLiter(t)) return 1 / 1000;
  if (f === t) return 1;
  return null;
}

export interface ConversionLineCostInput {
  /** Recipe line quantity (in the recipe line's chosen unit). */
  recipeQty: number;
  /** Name of the recipe line unit (e.g. "Gram"). */
  lineUnitName: string | null | undefined;
  /** Ingredient purchase price. */
  purchasePrice: number | null | undefined;
  /** Name of ingredient purchase unit (e.g. "Package/Bao"). */
  purchaseUnitName: string | null | undefined;
  /** Conversion settings on ingredient. */
  conversionEnabled: boolean | null | undefined;
  conversionQty: number | null | undefined;
  /** Name of the conversion target unit (e.g. "Kg"). */
  conversionUnitName: string | null | undefined;
}

export interface ConversionLineCostResult {
  /** Cost in same currency. 0 if conversion not possible. */
  lineCost: number;
  /** Display: unit cost actually used (e.g. 20,000 / Kg). */
  unitCostUsed: number | null;
  /** Display label for the unit cost (e.g. "Kg"). */
  unitCostLabel: string | null;
  /** True when no compatible conversion path exists. */
  warning: boolean;
}

/**
 * Compute a recipe-line cost USING the optional conversion layer.
 * Returns null if no conversion path applies (caller falls back to legacy logic).
 */
export function computeConvertedLineCost(
  i: ConversionLineCostInput,
): ConversionLineCostResult | null {
  if (!i.conversionEnabled) return null;
  const unitCost = calculateUnitCost(i.purchasePrice, i.conversionQty);
  if (unitCost == null) return null;
  const qty = Number(i.recipeQty) || 0;

  // Case A: line unit equals purchase unit → use existing logic (no conversion needed).
  if (norm(i.lineUnitName) === norm(i.purchaseUnitName) && i.purchaseUnitName) {
    return null;
  }

  // Case B: line unit equals conversion unit
  if (norm(i.lineUnitName) === norm(i.conversionUnitName) && i.conversionUnitName) {
    return {
      lineCost: qty * unitCost,
      unitCostUsed: unitCost,
      unitCostLabel: i.conversionUnitName ?? null,
      warning: false,
    };
  }

  // Case C: same-family conversion (e.g. Gram ↔ Kg, ml ↔ Liter)
  const factor = sameFamilyFactor(i.lineUnitName, i.conversionUnitName);
  if (factor != null) {
    const qtyInConvUnit = qty * (1 / factor); // factor is FROM line TO conv
    // Wait: sameFamilyFactor returns multiplier to go FROM "fromName" TO "toName".
    // If fromName=Gram, toName=Kg → factor = 1/1000. qty(g) * factor = qty(kg). ✓
    return {
      lineCost: qty * factor * unitCost,
      unitCostUsed: unitCost,
      unitCostLabel: i.conversionUnitName ?? null,
      warning: false,
    };
  }

  // Incompatible — caller may show warning.
  return {
    lineCost: 0,
    unitCostUsed: unitCost,
    unitCostLabel: i.conversionUnitName ?? null,
    warning: true,
  };
}
