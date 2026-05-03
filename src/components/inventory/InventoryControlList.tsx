// Excel-style editable Inventory Control List with import/export + bulk add.
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Trash2, Power, PowerOff, Save, Upload, Download, FileDown,
  Sparkles, Settings2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { useAuth } from '@/hooks/useAuth';
import { useBranchesAll } from '@/hooks/useMaintenance';
import { useIngredientPicker, type Department } from '@/hooks/useInventoryRequests';
import {
  useInventoryControlItems, useUpsertInventoryControlItem,
  useToggleInventoryControlItem, useDeleteInventoryControlItem,
  type EnrichedControlItem, type InventoryControlSource,
} from '@/hooks/useInventoryControlItems';
import { toast } from 'sonner';

const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];

// ---------- Editable row state ----------
type RowDraft = {
  key: string;            // local key (id or temp-N)
  id?: string;            // db id (existing row)
  branch_id: string | null;
  department: Department | null;
  item_code: string;
  item_name: string;
  unit: string;
  remarks: string;
  min_stock: string;
  recommended_order: string;
  is_active: boolean;
  source_type: InventoryControlSource;
  ingredient_id: string | null;
  dirty: boolean;
  isNew: boolean;
};

function rowFromItem(it: EnrichedControlItem): RowDraft {
  return {
    key: it.id,
    id: it.id,
    branch_id: it.branch_id ?? null,
    department: (it.department as Department | null) ?? null,
    item_code: it.item_code ?? '',
    item_name: it.item_name,
    unit: it.unit ?? '',
    remarks: (it as any).remarks ?? '',
    min_stock: (it as any).min_stock != null ? String((it as any).min_stock) : '',
    recommended_order: (it as any).recommended_order != null ? String((it as any).recommended_order) : '',
    is_active: it.is_active,
    source_type: it.source_type,
    ingredient_id: it.ingredient_id ?? null,
    dirty: false,
    isNew: false,
  };
}

function parseActive(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  return ['true', 'yes', 'active', '1', 'y'].includes(s);
}

export default function InventoryControlList() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const { data: branches = [] } = useBranchesAll();
  const { data: items = [], isLoading } = useInventoryControlItems();
  const upsert = useUpsertInventoryControlItem();
  const toggle = useToggleInventoryControlItem();
  const del = useDeleteInventoryControlItem();

  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({}); // overrides per key
  const [newRows, setNewRows] = useState<RowDraft[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedEditing, setAdvancedEditing] = useState<EnrichedControlItem | null>(null);

  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name ?? '';

  // Build display rows: new rows first, then existing items (with drafts applied), filtered.
  const displayRows: RowDraft[] = useMemo(() => {
    const existing = items.map(it => drafts[it.id] ?? rowFromItem(it));
    const filtered = existing.filter(r => {
      if (branchFilter !== 'all') {
        if (branchFilter === 'global' ? r.branch_id : r.branch_id !== branchFilter) return false;
      }
      if (deptFilter !== 'all') {
        if (deptFilter === 'global' ? r.department : r.department !== deptFilter) return false;
      }
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!r.item_name.toLowerCase().includes(s)
          && !r.item_code.toLowerCase().includes(s)) return false;
      }
      return true;
    });
    return [...newRows, ...filtered];
  }, [items, drafts, newRows, branchFilter, deptFilter, search]);

  // -------- Edit handlers --------
  const setField = (row: RowDraft, patch: Partial<RowDraft>) => {
    if (row.isNew) {
      setNewRows(prev => prev.map(r => r.key === row.key ? { ...r, ...patch, dirty: true } : r));
    } else {
      setDrafts(prev => ({
        ...prev,
        [row.key]: { ...row, ...patch, dirty: true },
      }));
    }
  };

  const addEmptyRow = () => {
    const key = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNewRows(prev => [{
      key, isNew: true, dirty: true,
      branch_id: branchFilter !== 'all' && branchFilter !== 'global' ? branchFilter : null,
      department: deptFilter !== 'all' && deptFilter !== 'global' ? (deptFilter as Department) : null,
      item_code: '', item_name: '', unit: '', remarks: '',
      min_stock: '', recommended_order: '',
      is_active: true, source_type: 'manual', ingredient_id: null,
    }, ...prev]);
  };

  const saveRow = async (row: RowDraft) => {
    if (!row.item_name.trim()) { toast.error('Item name is required'); return; }
    try {
      await upsert.mutateAsync({
        id: row.id,
        ingredient_id: row.ingredient_id,
        item_code: row.item_code.trim() || null,
        item_name: row.item_name.trim(),
        unit: row.unit.trim() || null,
        source_type: row.source_type,
        is_active: row.is_active,
        branch_id: row.branch_id,
        department: row.department,
        remarks: row.remarks.trim() || null,
        min_stock: row.min_stock ? Number(row.min_stock) : null,
        recommended_order: row.recommended_order ? Number(row.recommended_order) : null,
      });
      if (row.isNew) setNewRows(prev => prev.filter(r => r.key !== row.key));
      else setDrafts(prev => { const n = { ...prev }; delete n[row.key]; return n; });
      toast.success('Saved');
    } catch (e: any) { toast.error(e?.message ?? 'Save failed'); }
  };

  const removeNewRow = (row: RowDraft) =>
    setNewRows(prev => prev.filter(r => r.key !== row.key));

  // -------- Export --------
  const exportRows = () => {
    const rows = displayRows.filter(r => !r.isNew).map(r => ({
      Branch: branchName(r.branch_id) || '',
      Department: r.department ?? '',
      'Item Code': r.item_code,
      'Item Name': r.item_name,
      Unit: r.unit,
      Remarks: r.remarks,
      'Min Stock': r.min_stock,
      'Recommended Order': r.recommended_order,
      Active: r.is_active ? 'Active' : 'Inactive',
      'Source Type': r.source_type,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Control list');
    XLSX.writeFile(wb, `inventory_control_list_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportTemplate = () => {
    const rows = [{
      Branch: 'LCL', Department: 'kitchen',
      'Item Code': '1010-FLOUR', 'Item Name': 'Flour', Unit: 'kg',
      Remarks: 'Pizza flour', 'Min Stock': 50, 'Recommended Order': 100,
      Active: 'Active',
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'inventory_control_list_template.xlsx');
  };

  // -------- Import --------
  const fileRef = useRef<HTMLInputElement>(null);
  const onPickFile = () => fileRef.current?.click();
  const onFile = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const preview = buildImportPreview(data, items, branches);
      setImportPreview(preview);
      setImportOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to read file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    let ok = 0, fail = 0;
    for (const r of [...importPreview.toCreate, ...importPreview.toUpdate]) {
      try {
        await upsert.mutateAsync(r.payload);
        ok++;
      } catch { fail++; }
    }
    setImportOpen(false);
    setImportPreview(null);
    toast.success(`Imported: ${ok} ok${fail ? `, ${fail} failed` : ''}`);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search code or name…" value={search}
          onChange={e => setSearch(e.target.value)} className="max-w-xs h-9" />
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="max-w-[180px] h-9"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            <SelectItem value="global">Global (no branch)</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="max-w-[180px] h-9"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            <SelectItem value="global">Global (no dept)</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Button size="sm" variant="outline" onClick={onPickFile}>
          <Upload className="h-4 w-4 mr-1" /> Import XLS
        </Button>
        <Button size="sm" variant="outline" onClick={exportRows}>
          <Download className="h-4 w-4 mr-1" /> Export XLS
        </Button>
        <Button size="sm" variant="outline" onClick={exportTemplate}>
          <FileDown className="h-4 w-4 mr-1" /> Empty Template
        </Button>
        <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
          <Sparkles className="h-4 w-4 mr-1" /> Bulk Add from Ingredients
        </Button>
        <Button size="sm" onClick={addEmptyRow}>
          <Plus className="h-4 w-4 mr-1" /> Add Empty Row
        </Button>
        <Button size="sm" variant="ghost" title="Advanced add (modal)"
          onClick={() => { setAdvancedEditing(null); setAdvancedOpen(true); }}>
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : displayRows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No items in the control list yet. Click <span className="font-medium text-foreground">+ Add Empty Row</span> or
          <span className="font-medium text-foreground"> Bulk Add from Ingredients</span>.
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 backdrop-blur text-muted-foreground uppercase">
              <tr className="text-left">
                <th className="py-1.5 px-2 w-[140px]">Branch</th>
                <th className="py-1.5 px-2 w-[120px]">Department</th>
                <th className="py-1.5 px-2 w-[120px]">Code</th>
                <th className="py-1.5 px-2 min-w-[180px]">Name *</th>
                <th className="py-1.5 px-2 w-[80px]">Unit</th>
                <th className="py-1.5 px-2 min-w-[160px]">Remarks</th>
                <th className="py-1.5 px-2 w-[90px] text-right">Min</th>
                <th className="py-1.5 px-2 w-[110px] text-right">Recom.</th>
                <th className="py-1.5 px-2 w-[70px] text-center">Active</th>
                <th className="py-1.5 px-2 w-[90px]">Source</th>
                <th className="py-1.5 px-2 w-[110px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(r => (
                <tr key={r.key} className={`border-t ${r.dirty ? 'bg-amber-500/5' : ''} ${!r.is_active ? 'opacity-70' : ''}`}>
                  <td className="px-1 py-1">
                    <Select value={r.branch_id ?? '__g'}
                      onValueChange={v => setField(r, { branch_id: v === '__g' ? null : v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__g">Global</SelectItem>
                        {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1 py-1">
                    <Select value={r.department ?? '__g'}
                      onValueChange={v => setField(r, { department: v === '__g' ? null : v as Department })}>
                      <SelectTrigger className="h-7 text-xs capitalize"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__g">Global</SelectItem>
                        {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-7 text-xs font-mono" value={r.item_code}
                      onChange={e => setField(r, { item_code: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-7 text-xs" value={r.item_name}
                      onChange={e => setField(r, { item_name: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-7 text-xs" value={r.unit}
                      onChange={e => setField(r, { unit: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-7 text-xs" value={r.remarks}
                      onChange={e => setField(r, { remarks: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <Input type="number" inputMode="decimal" className="h-7 text-xs text-right"
                      value={r.min_stock} onChange={e => setField(r, { min_stock: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <Input type="number" inputMode="decimal" className="h-7 text-xs text-right"
                      value={r.recommended_order}
                      onChange={e => setField(r, { recommended_order: e.target.value })} />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <Checkbox checked={r.is_active}
                      onCheckedChange={v => setField(r, { is_active: !!v })} />
                  </td>
                  <td className="px-2 py-1">
                    <Badge variant="outline" className={
                      r.source_type === 'manual'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    }>{r.source_type}</Badge>
                  </td>
                  <td className="px-1 py-1 text-right whitespace-nowrap">
                    {r.dirty && (
                      <Button size="sm" variant="ghost" onClick={() => saveRow(r)} title="Save">
                        <Save className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                    )}
                    {!r.isNew && r.id && (
                      <Button size="sm" variant="ghost" title={r.is_active ? 'Deactivate' : 'Activate'}
                        onClick={() => toggle.mutate({ id: r.id!, is_active: !r.is_active })}>
                        {r.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {r.isNew ? (
                      <Button size="sm" variant="ghost" onClick={() => removeNewRow(r)} title="Discard">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    ) : isOwner && r.id ? (
                      <Button size="sm" variant="ghost" title="Delete"
                        onClick={async () => {
                          if (!confirm('Delete this item from the control list?')) return;
                          try { await del.mutateAsync(r.id!); toast.success('Deleted'); }
                          catch (e: any) { toast.error(e?.message ?? 'Delete failed'); }
                        }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkAddFromIngredientsDialog
        open={bulkOpen} onOpenChange={setBulkOpen}
        existingItems={items}
        defaultBranchId={branchFilter !== 'all' && branchFilter !== 'global' ? branchFilter : null}
        defaultDepartment={deptFilter !== 'all' && deptFilter !== 'global' ? (deptFilter as Department) : null}
      />

      <ImportPreviewDialog
        open={importOpen} onOpenChange={setImportOpen}
        preview={importPreview} onConfirm={confirmImport}
      />

      {/* Fallback advanced modal */}
      <AdvancedItemFormDialog
        key={advancedEditing?.id ?? 'new-adv'}
        open={advancedOpen} onOpenChange={setAdvancedOpen}
        initial={advancedEditing}
      />
    </div>
  );
}

// ===================== Bulk add from ingredients =====================
function BulkAddFromIngredientsDialog({
  open, onOpenChange, existingItems, defaultBranchId, defaultDepartment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingItems: EnrichedControlItem[];
  defaultBranchId: string | null;
  defaultDepartment: Department | null;
}) {
  const { data: branches = [] } = useBranchesAll();
  const { data: ingredients = [] } = useIngredientPicker();
  const upsert = useUpsertInventoryControlItem();

  const [branchId, setBranchId] = useState<string | null>(defaultBranchId);
  const [department, setDepartment] = useState<Department | null>(defaultDepartment);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return ingredients;
    return ingredients.filter(i =>
      i.name_en.toLowerCase().includes(s) || (i.code ?? '').toLowerCase().includes(s));
  }, [ingredients, search]);

  const toggle = (id: string) => {
    setPicked(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const submit = async () => {
    if (picked.size === 0) { toast.error('Pick at least one ingredient'); return; }
    let added = 0, skipped = 0, failed = 0;
    for (const id of picked) {
      const ing = ingredients.find(i => i.id === id);
      if (!ing) continue;
      const code = ing.code ?? '';
      const dup = existingItems.some(it =>
        (it.branch_id ?? null) === (branchId ?? null) &&
        (it.department ?? null) === (department ?? null) &&
        ((it.item_code ?? '') === code) && code !== '');
      if (dup) { skipped++; continue; }
      try {
        await upsert.mutateAsync({
          ingredient_id: ing.id,
          item_code: code || null,
          item_name: ing.name_en,
          unit: ing.unit_label || null,
          source_type: 'ingredient',
          is_active: true,
          branch_id: branchId,
          department,
        });
        added++;
      } catch { failed++; }
    }
    toast.success(`Added ${added}${skipped ? `, skipped ${skipped} duplicate(s)` : ''}${failed ? `, ${failed} failed` : ''}`);
    setPicked(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bulk add from Ingredients</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Target branch</Label>
            <Select value={branchId ?? '__g'} onValueChange={v => setBranchId(v === '__g' ? null : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__g">Global (all branches)</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Target department</Label>
            <Select value={department ?? '__g'} onValueChange={v => setDepartment(v === '__g' ? null : v as Department)}>
              <SelectTrigger className="h-9 capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__g">Global (all departments)</SelectItem>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Input placeholder="Search ingredients by code or name…"
          value={search} onChange={e => setSearch(e.target.value)} className="h-9" />
        <div className="max-h-[340px] overflow-y-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left">
                <th className="py-1.5 px-2 w-8"></th>
                <th className="py-1.5 px-2 w-[110px]">Code</th>
                <th className="py-1.5 px-2">Name</th>
                <th className="py-1.5 px-2 w-[80px]">Unit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(i => (
                <tr key={i.id} className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => toggle(i.id)}>
                  <td className="px-2"><Checkbox checked={picked.has(i.id)} onCheckedChange={() => toggle(i.id)} /></td>
                  <td className="px-2 font-mono">{i.code ?? '—'}</td>
                  <td className="px-2">{i.name_en}</td>
                  <td className="px-2">{i.unit_label ?? '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No ingredients found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <span className="text-xs text-muted-foreground mr-auto">{picked.size} selected</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={upsert.isPending}>Add selected</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Import preview =====================
type ImportRow = {
  payload: any;
  display: { branch: string; department: string; code: string; name: string; unit: string };
  reason?: string;
};
type ImportPreview = {
  toCreate: ImportRow[];
  toUpdate: ImportRow[];
  invalid: ImportRow[];
  duplicates: ImportRow[];
};

function buildImportPreview(
  data: any[],
  existing: EnrichedControlItem[],
  branches: { id: string; name: string }[],
): ImportPreview {
  const out: ImportPreview = { toCreate: [], toUpdate: [], invalid: [], duplicates: [] };
  const branchByName = new Map(branches.map(b => [b.name.toLowerCase().trim(), b.id]));
  const seen = new Set<string>();

  for (const raw of data) {
    const branchRaw = String(raw.Branch ?? raw.branch ?? '').trim();
    const department = String(raw.Department ?? raw.department ?? '').trim().toLowerCase();
    const item_code = String(raw['Item Code'] ?? raw.item_code ?? raw.Code ?? '').trim();
    const item_name = String(raw['Item Name'] ?? raw.item_name ?? raw.Name ?? '').trim();
    const unit = String(raw.Unit ?? raw.unit ?? '').trim();
    const remarks = String(raw.Remarks ?? raw.remarks ?? '').trim();
    const min_stock = raw['Min Stock'] ?? raw.min_stock ?? '';
    const recommended_order = raw['Recommended Order'] ?? raw.recommended_order ?? '';
    const activeRaw = raw.Active ?? raw.active ?? 'Active';
    const is_active = parseActive(activeRaw);

    const branch_id = branchRaw ? (branchByName.get(branchRaw.toLowerCase()) ?? null) : null;
    const display = { branch: branchRaw, department, code: item_code, name: item_name, unit };

    const missing: string[] = [];
    if (!branchRaw) missing.push('Branch');
    if (!department) missing.push('Department');
    if (!item_name) missing.push('Item Name');
    if (!unit) missing.push('Unit');
    if (branchRaw && !branch_id) missing.push('Branch not found');
    if (department && !DEPARTMENTS.includes(department as Department)) missing.push('Department invalid');

    if (missing.length) {
      out.invalid.push({ payload: null, display, reason: missing.join(', ') });
      continue;
    }

    const dedupeKey = `${branch_id}|${department}|${item_code}`;
    if (seen.has(dedupeKey) && item_code) {
      out.duplicates.push({ payload: null, display, reason: 'Duplicate row in file' });
      continue;
    }
    seen.add(dedupeKey);

    const match = existing.find(e =>
      (e.branch_id ?? null) === branch_id &&
      (e.department ?? null) === department &&
      ((e.item_code ?? '') === item_code) && item_code !== '');

    const payload = {
      id: match?.id,
      ingredient_id: match?.ingredient_id ?? null,
      item_code: item_code || null,
      item_name,
      unit: unit || null,
      source_type: (match?.source_type ?? (item_code ? 'manual' : 'manual')) as InventoryControlSource,
      is_active,
      branch_id,
      department,
      remarks: remarks || null,
      min_stock: min_stock !== '' ? Number(min_stock) : null,
      recommended_order: recommended_order !== '' ? Number(recommended_order) : null,
    };

    if (match) out.toUpdate.push({ payload, display });
    else out.toCreate.push({ payload, display });
  }
  return out;
}

function ImportPreviewDialog({
  open, onOpenChange, preview, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preview: ImportPreview | null;
  onConfirm: () => void;
}) {
  if (!preview) return null;
  const sec = (title: string, rows: ImportRow[], color: string) => (
    <div>
      <div className={`text-xs font-medium mb-1 ${color}`}>{title} ({rows.length})</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <div className="max-h-[120px] overflow-y-auto rounded border text-xs">
          <table className="w-full">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-2 py-1">Branch</th><th className="px-2 py-1">Dept</th>
                <th className="px-2 py-1">Code</th><th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Unit</th><th className="px-2 py-1">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-0.5">{r.display.branch}</td>
                  <td className="px-2 py-0.5">{r.display.department}</td>
                  <td className="px-2 py-0.5 font-mono">{r.display.code}</td>
                  <td className="px-2 py-0.5">{r.display.name}</td>
                  <td className="px-2 py-0.5">{r.display.unit}</td>
                  <td className="px-2 py-0.5 text-muted-foreground">{r.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Import preview</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {sec('New rows', preview.toCreate, 'text-emerald-600')}
          {sec('Updated rows', preview.toUpdate, 'text-blue-600')}
          {sec('Invalid / missing fields', preview.invalid, 'text-amber-600')}
          {sec('Duplicates in file', preview.duplicates, 'text-rose-600')}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm}
            disabled={preview.toCreate.length === 0 && preview.toUpdate.length === 0}>
            Import {preview.toCreate.length + preview.toUpdate.length} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Advanced (fallback) modal =====================
function AdvancedItemFormDialog({
  open, onOpenChange, initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: EnrichedControlItem | null;
}) {
  const { data: branches = [] } = useBranchesAll();
  const { data: ingredients = [] } = useIngredientPicker();
  const upsert = useUpsertInventoryControlItem();

  const [sourceType, setSourceType] = useState<'ingredient' | 'manual'>(
    (initial?.source_type as any) ?? 'ingredient',
  );
  const [ingredientId, setIngredientId] = useState<string>(initial?.ingredient_id ?? '');
  const [itemCode, setItemCode] = useState(initial?.item_code ?? '');
  const [itemName, setItemName] = useState(initial?.item_name ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [branchId, setBranchId] = useState(initial?.branch_id ?? '');
  const [department, setDepartment] = useState<string>(initial?.department ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const ingredientOptions = useMemo(
    () => ingredients.map(ing => ({
      id: ing.id,
      label: `${ing.code ? ing.code + ' — ' : ''}${ing.name_en}`,
      sublabel: ing.unit_label || undefined,
    })),
    [ingredients],
  );

  const onPickIngredient = (id: string) => {
    setIngredientId(id);
    const ing = ingredients.find(i => i.id === id);
    if (ing) {
      setItemCode(ing.code ?? '');
      setItemName(ing.name_en);
      setUnit(ing.unit_label ?? '');
    }
  };

  const save = async () => {
    if (!itemName.trim()) return toast.error('Item name is required');
    try {
      await upsert.mutateAsync({
        id: initial?.id,
        ingredient_id: sourceType === 'ingredient' ? (ingredientId || null) : null,
        item_code: itemCode.trim() || null,
        item_name: itemName.trim(),
        unit: unit.trim() || null,
        source_type: sourceType,
        is_active: isActive,
        branch_id: branchId || null,
        department: department || null,
      });
      toast.success(initial ? 'Item updated' : 'Item added');
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? 'Save failed'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? 'Edit control item' : 'Advanced add'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={sourceType} onValueChange={v => setSourceType(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ingredient">From Ingredients</SelectItem>
              <SelectItem value="manual">Manual entry</SelectItem>
            </SelectContent>
          </Select>
          {sourceType === 'ingredient' && (
            <SearchableCombobox
              value={ingredientId}
              onChange={onPickIngredient}
              options={ingredientOptions}
              placeholder="Search ingredient by code or name"
              searchPlaceholder="Type to search…"
              emptyText="No ingredient found"
            />
          )}
          <div className="grid grid-cols-3 gap-2">
            <Input value={itemCode} placeholder="Code" onChange={e => setItemCode(e.target.value)} />
            <Input className="col-span-2" value={itemName} placeholder="Name *" onChange={e => setItemName(e.target.value)} />
            <Input className="col-span-3" value={unit} placeholder="Unit (kg, pcs…)" onChange={e => setUnit(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={branchId || 'global'} onValueChange={v => setBranchId(v === 'global' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (all branches)</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={department || 'global'} onValueChange={v => setDepartment(v === 'global' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (all departments)</SelectItem>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={upsert.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
