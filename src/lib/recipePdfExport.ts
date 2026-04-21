/**
 * Recipe PDF Export
 * ----------------------------------------------------------------------------
 * Builds a clean A4 print sheet from already-loaded recipe data and triggers
 * the browser's native print dialog (user picks "Save as PDF").
 *
 * No new dependencies. Layout is designed for A4 portrait, multi-page safe,
 * and avoids cutting steps/table rows mid-block via CSS `break-inside: avoid`.
 *
 * IMPORTANT: This is a UI-only utility. It does NOT modify recipe data,
 * cost logic, or the database schema.
 */

import type { RecipeIngredientRow } from '@/hooks/useRecipes';
import type { RecipeProcedureRow } from '@/hooks/useRecipeProcedures';
import type { RecipeMediaRow } from '@/hooks/useRecipeMedia';
import type { RecipeServiceInfoRow } from '@/hooks/useRecipeServiceInfo';
import { computeLineCost, applyAdjustment } from '@/hooks/useRecipes';

// ---------- Minimal shapes we read from related lookups ----------
interface IngredientLite {
  id: string;
  name_en: string;
  code?: string | null;
  price?: number | null;
  purchase_to_base_factor?: number | null;
  base_unit_id?: string | null;
}
interface UnitLite {
  id: string;
  code: string;
  name_en: string;
  unit_type: string;
  factor_to_base?: number | null;
}
interface CategoryLite { id: string; name_en: string }
interface TypeLite { id: string; name_en: string }

export interface RecipePdfPayload {
  recipe: {
    id: string;
    code: string | null;
    name_en: string;
    description?: string | null;
    department?: string | null;
    category_id?: string | null;
    recipe_type_id?: string | null;
    selling_price?: number | null;
    currency?: string | null;
    yield_quantity?: number | null;
    yield_unit_id?: string | null;
    portion_quantity?: number | null;
    portion_unit?: string | null;
    shelf_life?: string | null;
  };
  ingredients: RecipeIngredientRow[];
  procedures: RecipeProcedureRow[];
  media: RecipeMediaRow[];
  serviceInfo: RecipeServiceInfoRow | null;

  // lookups
  ingredientMap: Record<string, IngredientLite>;
  unitMap: Record<string, UnitLite>;
  categoryMap: Record<string, CategoryLite>;
  typeMap: Record<string, TypeLite>;

  // i18n
  labels: PdfLabels;

  /** When false, skip the Media section entirely (smaller file, faster print). Default true. */
  includeImages?: boolean;
}

export interface PdfLabels {
  printedOn: string;
  ingredients: string;
  procedure: string;
  media: string;
  service: string;
  // table cols
  colIngredient: string;
  colQty: string;
  colUnit: string;
  colAdjPct: string;
  colCost: string;
  // footers
  totalCost: string;
  foodCostPct: string;
  // hero fields
  recipeId: string;
  category: string;
  type: string;
  department: string;
  yield: string;
  portion: string;
  sellingPrice: string;
  shelfLife: string;
  // procedure fields
  warning: string;
  tool: string;
  duration: string;
  temperature: string;
  note: string;
  minutes: string;
  // service
  shortDescription: string;
  keyIngredients: string;
  allergens: string;
  pairing: string;
  upselling: string;
  taste: string;
}

// ---------- Formatting helpers ----------
const escapeHtml = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const nl2br = (s: string) => escapeHtml(s).replace(/\n/g, '<br/>');

const fmtMoney = (n: number, currency?: string | null): string => {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  const formatted = rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
};

const safeFilename = (name: string, code: string | null): string => {
  const base = `${name}_${code ?? ''}`.trim().replace(/[^a-zA-Z0-9-_ ]+/g, '').replace(/\s+/g, '_');
  return (base || 'recipe') + '.pdf';
};

// ---------- Main entry ----------
export function exportRecipeToPdf(payload: RecipePdfPayload): void {
  const html = buildPrintHtml(payload);
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100');
  if (!w) {
    alert('Pop-up blocked. Please allow pop-ups for this site to export the recipe.');
    return;
  }
  // Suggested filename when user picks "Save as PDF"
  w.document.title = safeFilename(payload.recipe.name_en, payload.recipe.code).replace(/\.pdf$/, '');
  w.document.open();
  w.document.write(html);
  w.document.close();

  // Wait for images to settle, then trigger print
  const triggerPrint = () => {
    try { w.focus(); w.print(); } catch { /* noop */ }
  };
  if ((w.document as any).fonts?.ready) {
    (w.document as any).fonts.ready.then(() => setTimeout(triggerPrint, 250));
  } else {
    setTimeout(triggerPrint, 500);
  }
}

// ---------- HTML builder ----------
function buildPrintHtml(p: RecipePdfPayload): string {
  const { recipe, labels } = p;

  const category = recipe.category_id ? p.categoryMap[recipe.category_id]?.name_en ?? '' : '';
  const type = recipe.recipe_type_id ? p.typeMap[recipe.recipe_type_id]?.name_en ?? '' : '';
  const yieldUnit = recipe.yield_unit_id ? p.unitMap[recipe.yield_unit_id]?.code ?? '' : '';
  const yieldStr = recipe.yield_quantity != null ? `${recipe.yield_quantity} ${yieldUnit}`.trim() : '';
  const portionStr = recipe.portion_quantity != null
    ? `${recipe.portion_quantity} ${recipe.portion_unit ?? ''}`.trim() : '';
  const sellingStr = recipe.selling_price != null
    ? fmtMoney(Number(recipe.selling_price), recipe.currency) : '';
  const printedOn = new Date().toLocaleString();

  // ---- Ingredients table & totals (uses same cost formula as the app) ----
  const ingRows = [...p.ingredients]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(line => {
      const ing = line.ingredient_id ? p.ingredientMap[line.ingredient_id] : null;
      const lineUnit = line.unit_id ? p.unitMap[line.unit_id] : null;
      const baseUnit = ing?.base_unit_id ? p.unitMap[ing.base_unit_id] : null;
      const sameType = lineUnit && baseUnit && lineUnit.unit_type === baseUnit.unit_type;
      const unitFactor = sameType ? Number(lineUnit?.factor_to_base ?? 1) : 1;
      const lineCost = computeLineCost(
        Number(line.quantity) || 0,
        unitFactor,
        ing?.purchase_to_base_factor ?? 1,
        ing?.price ?? 0,
      );
      const adjusted = applyAdjustment(lineCost, Number((line as any).cost_adjust_pct) || 0);
      return { line, ing, lineUnit, adjusted };
    });

  const totalCost = ingRows.reduce((s, r) => s + r.adjusted, 0);
  const foodCostPct = recipe.selling_price && Number(recipe.selling_price) > 0
    ? (totalCost / Number(recipe.selling_price)) * 100 : null;

  const ingTable = ingRows.length ? `
    <table class="ing-table">
      <thead>
        <tr>
          <th class="left">${escapeHtml(labels.colIngredient)}</th>
          <th class="right">${escapeHtml(labels.colQty)}</th>
          <th class="left">${escapeHtml(labels.colUnit)}</th>
          <th class="right">${escapeHtml(labels.colAdjPct)}</th>
          <th class="right">${escapeHtml(labels.colCost)}</th>
        </tr>
      </thead>
      <tbody>
        ${ingRows.map(r => `
          <tr>
            <td>${escapeHtml(r.ing?.name_en ?? '—')}${r.line.prep_note
              ? `<div class="muted small">${escapeHtml(r.line.prep_note)}</div>` : ''}</td>
            <td class="right num">${escapeHtml(r.line.quantity ?? '')}</td>
            <td>${escapeHtml(r.lineUnit?.code ?? '')}</td>
            <td class="right num">${escapeHtml(((r.line as any).cost_adjust_pct ?? 0))}%</td>
            <td class="right num">${escapeHtml(fmtMoney(r.adjusted, recipe.currency))}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" class="right strong">${escapeHtml(labels.totalCost)}</td>
          <td class="right strong num">${escapeHtml(fmtMoney(totalCost, recipe.currency))}</td>
        </tr>
        ${foodCostPct != null ? `
        <tr>
          <td colspan="4" class="right">${escapeHtml(labels.foodCostPct)}</td>
          <td class="right num">${foodCostPct.toFixed(1)}%</td>
        </tr>` : ''}
      </tfoot>
    </table>
  ` : `<p class="muted">—</p>`;

  // ---- Procedure ----
  const procSteps = [...p.procedures].sort((a, b) => a.step_number - b.step_number);
  const procHtml = procSteps.length ? procSteps.map(s => {
    const meta: string[] = [];
    if (s.tool) meta.push(`<span><strong>${escapeHtml(labels.tool)}:</strong> ${escapeHtml(s.tool)}</span>`);
    if (s.duration_minutes != null) meta.push(`<span><strong>${escapeHtml(labels.duration)}:</strong> ${s.duration_minutes} ${escapeHtml(labels.minutes)}</span>`);
    if (s.temperature) meta.push(`<span><strong>${escapeHtml(labels.temperature)}:</strong> ${escapeHtml(s.temperature)}</span>`);
    return `
      <div class="step">
        <div class="step-head">
          <span class="step-num">${s.step_number}</span>
          <span class="step-type">${escapeHtml(s.procedure_type)}</span>
        </div>
        <div class="step-body">
          <p class="step-text">${nl2br(s.instruction_en)}</p>
          ${meta.length ? `<div class="step-meta">${meta.join(' · ')}</div>` : ''}
          ${s.warning ? `<div class="step-warn"><strong>${escapeHtml(labels.warning)}:</strong> ${escapeHtml(s.warning)}</div>` : ''}
          ${s.note ? `<div class="step-note"><strong>${escapeHtml(labels.note)}:</strong> ${escapeHtml(s.note)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('') : `<p class="muted">—</p>`;

  // ---- Media (max 2 images) — skip entirely when includeImages is false ----
  const includeImages = p.includeImages !== false;
  const images = includeImages ? p.media.filter(m => m.media_type === 'image') : [];
  images.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const heroImages = images.slice(0, 2);
  const mediaHtml = heroImages.length ? `
    <div class="media-grid">
      ${heroImages.map(m => `
        <figure>
          <img src="${escapeHtml(m.url)}" alt="${escapeHtml(m.title ?? '')}" crossorigin="anonymous"/>
          ${m.title ? `<figcaption>${escapeHtml(m.title)}</figcaption>` : ''}
        </figure>
      `).join('')}
    </div>
  ` : '';

  // ---- Service info ----
  const si = p.serviceInfo;
  const siHtml = si ? `
    ${si.short_description ? `<div class="si-row"><div class="si-label">${escapeHtml(labels.shortDescription)}</div><div>${nl2br(si.short_description)}</div></div>` : ''}
    ${si.key_ingredients ? `<div class="si-row"><div class="si-label">${escapeHtml(labels.keyIngredients)}</div><div>${nl2br(si.key_ingredients)}</div></div>` : ''}
    ${si.taste_profile ? `<div class="si-row"><div class="si-label">${escapeHtml(labels.taste)}</div><div>${nl2br(si.taste_profile)}</div></div>` : ''}
    ${si.allergens_to_mention ? `<div class="si-row"><div class="si-label">${escapeHtml(labels.allergens)}</div><div>${nl2br(si.allergens_to_mention)}</div></div>` : ''}
    ${si.pairing_suggestion ? `<div class="si-row"><div class="si-label">${escapeHtml(labels.pairing)}</div><div>${nl2br(si.pairing_suggestion)}</div></div>` : ''}
    ${si.upselling_notes ? `<div class="si-row"><div class="si-label">${escapeHtml(labels.upselling)}</div><div>${nl2br(si.upselling_notes)}</div></div>` : ''}
  ` : '';

  const showService = !!siHtml.trim();
  const showMedia = heroImages.length > 0;

  // ---- Compose document ----
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(recipe.name_en)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 14mm 14mm 14mm; }
  * { box-sizing: border-box; }
  html, body { padding: 0; margin: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #000;
    background: #fff;
    font-size: 11pt;
    line-height: 1.4;
  }
  h1, h2, h3, h4 { margin: 0; font-weight: 700; }
  .muted { color: #444; }
  .small { font-size: 9pt; }
  .num { font-variant-numeric: tabular-nums; }
  .right { text-align: right; }
  .left { text-align: left; }
  .strong { font-weight: 700; }

  /* Header */
  .hdr {
    border-bottom: 2px solid #000;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .hdr h1 {
    font-size: 22pt;
    line-height: 1.15;
  }
  .hdr .meta {
    margin-top: 2px;
    font-size: 9.5pt;
    color: #333;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin-top: 8px;
    font-size: 10pt;
  }
  .chips div span.k {
    color: #444;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: .03em;
    margin-right: 4px;
  }
  .chips div span.v { font-weight: 600; }

  /* Section heading */
  section { margin-top: 14px; }
  section > h2 {
    font-size: 12.5pt;
    text-transform: uppercase;
    letter-spacing: .04em;
    border-bottom: 1px solid #000;
    padding-bottom: 3px;
    margin-bottom: 8px;
  }

  /* Ingredients table — compact, low-ink, aligned numbers */
  .ing-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  .ing-table th {
    text-align: left;
    border-bottom: 1px solid #000;
    padding: 3px 6px;
    background: #fff;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: .03em;
  }
  .ing-table td {
    padding: 2px 6px;
    border-bottom: 1px solid #ddd;
    vertical-align: top;
    line-height: 1.25;
  }
  .ing-table td.num,
  .ing-table th.right {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ing-table tfoot td {
    border-top: 1px solid #000;
    border-bottom: none;
    padding-top: 5px;
  }
  .ing-table tr { page-break-inside: avoid; break-inside: avoid; }

  /* Procedure steps — clear separation, larger numbers */
  .step {
    display: flex;
    gap: 12px;
    margin: 10px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid #ccc;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .step:last-child { border-bottom: none; }
  .step-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 60px;
  }
  .step-num {
    background: #000;
    color: #fff;
    width: 32px; height: 32px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center; justify-content: center;
    font-weight: 700;
    font-size: 13pt;
  }
  .step-type {
    font-size: 8pt;
    text-transform: uppercase;
    color: #000;
    margin-top: 5px;
    font-weight: 600;
    letter-spacing: .04em;
  }
  .step-body { flex: 1; }
  .step-text { margin: 0 0 4px 0; font-size: 11pt; }
  .step-meta { font-size: 9.5pt; color: #222; }
  .step-warn {
    margin-top: 4px;
    border-left: 3px solid #000;
    padding-left: 8px;
    font-size: 10pt;
    color: #000;
    font-weight: 600;
  }
  .step-note {
    margin-top: 4px;
    font-size: 9.5pt;
    color: #333;
    font-style: italic;
  }

  /* Media */
  .media-grid {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .media-grid figure {
    margin: 0;
    width: calc(50% - 5px);
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .media-grid img {
    width: 100%;
    max-height: 70mm;
    object-fit: cover;
    border: 1px solid #000;
    border-radius: 4px;
  }
  .media-grid figcaption {
    font-size: 9pt;
    color: #333;
    margin-top: 3px;
    text-align: center;
  }

  /* Service info */
  .si-row {
    display: flex;
    gap: 10px;
    padding: 4px 0;
    border-bottom: 1px dashed #bbb;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .si-row:last-child { border-bottom: none; }
  .si-label {
    width: 38%;
    font-weight: 600;
    color: #000;
    font-size: 10pt;
  }

  footer.print-footer {
    margin-top: 14px;
    padding-top: 6px;
    border-top: 1px solid #000;
    font-size: 9pt;
    color: #333;
    display: flex;
    justify-content: space-between;
  }

  @media print {
    .no-print { display: none !important; }
    /* Pure black/white, low-ink: no backgrounds, no shadows */
    * { background: transparent !important; box-shadow: none !important; text-shadow: none !important; }
    body { color: #000 !important; }
    .step-num { background: #000 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <header class="hdr">
    <h1>${escapeHtml(recipe.name_en)}</h1>
    <div class="meta">
      ${recipe.code ? `${escapeHtml(labels.recipeId)}: <strong>${escapeHtml(recipe.code)}</strong>` : ''}
    </div>
    <div class="chips">
      ${category ? `<div><span class="k">${escapeHtml(labels.category)}</span><span class="v">${escapeHtml(category)}</span></div>` : ''}
      ${type ? `<div><span class="k">${escapeHtml(labels.type)}</span><span class="v">${escapeHtml(type)}</span></div>` : ''}
      ${recipe.department ? `<div><span class="k">${escapeHtml(labels.department)}</span><span class="v">${escapeHtml(recipe.department)}</span></div>` : ''}
      ${yieldStr ? `<div><span class="k">${escapeHtml(labels.yield)}</span><span class="v">${escapeHtml(yieldStr)}</span></div>` : ''}
      ${portionStr ? `<div><span class="k">${escapeHtml(labels.portion)}</span><span class="v">${escapeHtml(portionStr)}</span></div>` : ''}
      ${sellingStr ? `<div><span class="k">${escapeHtml(labels.sellingPrice)}</span><span class="v">${escapeHtml(sellingStr)}</span></div>` : ''}
      ${recipe.shelf_life ? `<div><span class="k">${escapeHtml(labels.shelfLife)}</span><span class="v">${escapeHtml(recipe.shelf_life)}</span></div>` : ''}
    </div>
    ${recipe.description ? `<p style="margin-top:8px;font-size:10.5pt;">${nl2br(recipe.description)}</p>` : ''}
  </header>

  <section>
    <h2>${escapeHtml(labels.ingredients)}</h2>
    ${ingTable}
  </section>

  <section>
    <h2>${escapeHtml(labels.procedure)}</h2>
    ${procHtml}
  </section>

  ${showMedia ? `<section><h2>${escapeHtml(labels.media)}</h2>${mediaHtml}</section>` : ''}

  ${showService ? `<section><h2>${escapeHtml(labels.service)}</h2>${siHtml}</section>` : ''}

  <footer class="print-footer">
    <span>${escapeHtml(recipe.name_en)}${recipe.code ? ` · ${escapeHtml(recipe.code)}` : ''}</span>
    <span>${escapeHtml(labels.printedOn)}: ${escapeHtml(printedOn)}</span>
  </footer>
</body>
</html>`;
}
