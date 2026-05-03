// Multi-Control-List editor. Each Control List groups items for one Branch + Department.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Trash2, Power, PowerOff, Save, Upload, Download, FileDown,
  Sparkles, Copy as CopyIcon, FilePlus2, Pencil,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useBranchesAll } from '@/hooks/useMaintenance';
import { useIngredientPicker, type Department } from '@/hooks/useInventoryRequests';
import {
  useInventoryControlItems, useUpsertInventoryControlItem,
  useToggleInventoryControlItem, useDeleteInventoryControlItem,
  type EnrichedControlItem, type InventoryControlSource,
} from '@/hooks/useInventoryControlItems';
import {
  useInventoryControlLists, useUpsertInventoryControlList, useDeleteInventoryControlList,
  type EnrichedControlList,
} from '@/hooks/useInventoryControlLists';
import { toast } from 'sonner';

const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];

type RowDraft = {
  key: string;
  id?: string;
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
    key: it.id, id: it.id,
    item_code: it.item_code ?? '',
    item_name: it.item_name,
    unit: it.unit ?? '',
    remarks: (it as any).remarks ?? '',
    min_stock: (it as any).min_stock != null ? String((it as any).min_stock) : '',
    recommended_order: (it as any).recommended_order != null ? String((it as any).recommended_order) : '',
    is_active: it.is_active,
    source_type: it.source_type,
    ingredient_id: it.ingredient_id ?? null,
    dirty: false, isNew: false,
  };
}

function parseActive(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return ['true', 'yes', 'active', '1', 'y'].includes(String(v ?? '').trim().toLowerCase());
}

export default function InventoryControlList() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const { data: branches = [] } = useBranchesAll();
  const { data: allLists = [] } = useInventoryControlLists();
  const upsertList = useUpsertInventoryControlList();
  const deleteList = useDeleteInventoryControlList();
  const upsert = useUpsertInventoryControlItem();
  const toggle = useToggleInventoryControlItem();
  const del = useDeleteInventoryControlItem();

  const [branchId, setBranchId] = useState<string>('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [controlListId, setControlListId] = useState<string>('');

  const filteredLists = useMemo(() => allLists.filter(l =>
    (!branchId || l.branch_id === branchId) &&
    (!department || l.department === department)
  ), [allLists, branchId, department]);

  // When context changes, auto-select if only one list is available; else clear
  useEffect(() => {
    if (controlListId && !filteredLists.find(l => l.id === controlListId)) setControlListId('');
    if (!controlListId && filteredLists.length === 1) setControlListId(filteredLists[0].id);
  }, [filteredLists, controlListId]);

  const { data: items = [], isLoading } = useInventoryControlItems({ controlListId: controlListId || null });
  const { data: allItems = [] } = useInventoryControlItems(); // for duplicate checks across branch

  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [newRows, setNewRows] = useState<RowDraft[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [editListOpen, setEditListOpen] = useState(false);

  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name ?? '';
  const currentList = useMemo(() => allLists.find(l => l.id === controlListId) ?? null, [allLists, controlListId]);

  useEffect(() => { setNewRows([]); setDrafts({}); }, [controlListId]);

  const displayRows: RowDraft[] = useMemo(() => {
    if (!controlListId) return [];
    const existing = items.map(it => drafts[it.id] ?? rowFromItem(it));
    const filtered = existing.filter(r => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return r.item_name.toLowerCase().includes(s) || r.item_code.toLowerCase().includes(s);
    });
    return [...newRows, ...filtered];
  }, [items, drafts, newRows, controlListId, search]);

  const setField = (row: RowDraft, patch: Partial<RowDraft>) => {
    if (row.isNew) setNewRows(prev => prev.map(r => r.key === row.key ? { ...r, ...patch, dirty: true } : r));
    else setDrafts(prev => ({ ...prev, [row.key]: { ...row, ...patch, dirty: true } }));
  };

  const addEmptyRow = () => {
    if (!controlListId) return;
    const key = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNewRows(prev => [{
      key, isNew: true, dirty: true,
      item_code: '', item_name: '', unit: '', remarks: '',
      min_stock: '', recommended_order: '',
      is_active: true, source_type: 'manual', ingredient_id: null,
    }, ...prev]);
  };

  const saveRow = async (row: RowDraft) => {
    if (!row.item_name.trim()) { toast.error('Item name is required'); return; }
    if (!currentList) return;
    try {
      await upsert.mutateAsync({
        id: row.id,
        ingredient_id: row.ingredient_id,
        item_code: row.item_code.trim() || null,
        item_name: row.item_name.trim(),
        unit: row.unit.trim() || null,
        source_type: row.source_type,
        is_active: row.is_active,
        branch_id: currentList.branch_id,
        department: currentList.department,
        control_list_id: currentList.id,
        remarks: row.remarks.trim() || null,
        min_stock: row.min_stock ? Number(row.min_stock) : null,
        recommended_order: row.recommended_order ? Number(row.recommended_order) : null,
      });
      if (row.isNew) setNewRows(prev => prev.filter(r => r.key !== row.key));
      else setDrafts(prev => { const n = { ...prev }; delete n[row.key]; return n; });
      toast.success('Saved');
    } catch (e: any) { toast.error(e?.message ?? 'Save failed'); }
  };

  const removeNewRow = (row: RowDraft) => setNewRows(prev => prev.filter(r => r.key !== row.key));

  // Export
  const exportRows = () => {
    if (!currentList) { toast.error('Select a Control List first'); return; }
    const rows = displayRows.filter(r => !r.isNew).map(r => ({
      'Control List Code': currentList.control_list_code,
      'Control List Name': currentList.control_list_name,
      Branch: branchName(currentList.branch_id),
      Department: currentList.department,
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
    XLSX.writeFile(wb, `${currentList.control_list_code}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportAll = () => {
    const listById = new Map(allLists.map(l => [l.id, l]));
    const rows = allItems.map(it => {
      const l = it.control_list_id ? listById.get(it.control_list_id) : null;
      return {
        'Control List Code': l?.control_list_code ?? '',
        'Control List Name': l?.control_list_name ?? '',
        Branch: branchName(l?.branch_id ?? it.branch_id ?? null),
        Department: l?.department ?? it.department ?? '',
        'Item Code': it.item_code ?? '',
        'Item Name': it.item_name,
        Unit: it.unit ?? '',
        Remarks: (it as any).remarks ?? '',
        'Min Stock': (it as any).min_stock ?? '',
        'Recommended Order': (it as any).recommended_order ?? '',
        Active: it.is_active ? 'Active' : 'Inactive',
        'Source Type': it.source_type,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'All control lists');
    XLSX.writeFile(wb, `control_lists_all_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportTemplate = () => {
    const rows = [{
      'Control List Code': currentList?.control_list_code ?? 'LCL-KIT-FRESH',
      'Control List Name': currentList?.control_list_name ?? 'Kitchen Fresh Products',
      Branch: branchName(currentList?.branch_id ?? branchId) || 'La Cala',
      Department: currentList?.department ?? department ?? 'kitchen',
      'Item Code': '1010-FLOUR', 'Item Name': 'Flour', Unit: 'kg',
      Remarks: 'Pizza flour', 'Min Stock': 50, 'Recommended Order': 100,
      Active: 'Active',
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'inventory_control_list_template.xlsx');
  };

  // Import
  const fileRef = useRef<HTMLInputElement>(null);
  const onPickFile = () => fileRef.current?.click();
  const onFile = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const preview = buildImportPreview(data, allItems, allLists, branches, {
        branchId: branchId || null,
        department: (department as Department) || null,
        controlList: currentList,
      });
      setImportPreview(preview);
      setImportOpen(true);
    } catch (e: any) { toast.error(e?.message ?? 'Failed to read file'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    let createdLists = 0, ok = 0, fail = 0;
    // Create missing control lists first
    const listIdMap = new Map<string, string>(); // key=code|branch -> id
    for (const l of importPreview.newLists) {
      try {
        const id = await upsertList.mutateAsync(l.payload);
        listIdMap.set(`${l.payload.control_list_code}|${l.payload.branch_id}`, id);
        createdLists++;
      } catch { fail++; }
    }
    // Items
    const allRows = [...importPreview.toCreate, ...importPreview.toUpdate];
    for (const r of allRows) {
      try {
        const cid = r.payload.control_list_id ??
          listIdMap.get(`${r.controlListCode}|${r.branchId}`) ??
          allLists.find(l => l.branch_id === r.branchId && l.control_list_code === r.controlListCode)?.id;
        if (!cid) { fail++; continue; }
        await upsert.mutateAsync({ ...r.payload, control_list_id: cid });
        ok++;
      } catch { fail++; }
    }
    setImportOpen(false); setImportPreview(null);
    toast.success(`Imported: ${createdLists} list(s), ${ok} items${fail ? `, ${fail} failed` : ''}`);
  };

  return (
    <div className="space-y-3">
      {/* Top context selectors */}
      <Card>
        <CardContent className="py-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onValueChange={(v) => { setBranchId(v); setControlListId(''); }}>
              <SelectTrigger className="h-9 min-w-[180px]"><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Department</Label>
            <Select value={department} onValueChange={(v) => { setDepartment(v as Department); setControlListId(''); }}>
              <SelectTrigger className="h-9 min-w-[160px] capitalize"><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[260px]">
            <Label className="text-xs">Control List</Label>
            <Select value={controlListId} onValueChange={setControlListId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select control list" /></SelectTrigger>
              <SelectContent>
                {filteredLists.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No control lists for this filter.</div>
                )}
                {filteredLists.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="font-mono">{l.control_list_code}</span> — {l.control_list_name}
                    {!l.is_active && ' (inactive)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="default" onClick={() => setNewListOpen(true)}>
            <FilePlus2 className="h-4 w-4 mr-1" /> New Control List
          </Button>
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => setCopyOpen(true)}>
              <CopyIcon className="h-4 w-4 mr-1" /> Copy Control List
            </Button>
          )}
        </CardContent>
      </Card>

      {!controlListId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a Control List above, or click <span className="font-medium text-foreground">New Control List</span> to create one.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Header for current list */}
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Badge variant="outline" className="font-mono">{currentList?.control_list_code}</Badge>
            <span className="text-sm font-semibold">{currentList?.control_list_name}</span>
            <span className="text-xs text-muted-foreground">
              {branchName(currentList?.branch_id ?? null)} · <span className="capitalize">{currentList?.department}</span>
            </span>
            {!currentList?.is_active && (
              <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditListOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {isOwner && (
              <Button size="sm" variant="ghost" onClick={async () => {
                if (!currentList) return;
                if (!confirm(`Delete control list "${currentList.control_list_name}" and all its items?`)) return;
                try { await deleteList.mutateAsync(currentList.id); setControlListId(''); toast.success('Deleted'); }
                catch (e: any) { toast.error(e?.message ?? 'Delete failed'); }
              }}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Search code or name…" value={search}
              onChange={e => setSearch(e.target.value)} className="max-w-xs h-9" />
            <div className="flex-1" />
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
            <Button size="sm" variant="outline" onClick={onPickFile}>
              <Upload className="h-4 w-4 mr-1" /> Import XLS
            </Button>
            <Button size="sm" variant="outline" onClick={exportRows}>
              <Download className="h-4 w-4 mr-1" /> Export XLS
            </Button>
            {isOwner && (
              <Button size="sm" variant="ghost" onClick={exportAll} title="Export all control lists">
                <Download className="h-4 w-4 mr-1" /> All
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={exportTemplate}>
              <FileDown className="h-4 w-4 mr-1" /> Empty Template
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1" /> Bulk Add from Ingredients
            </Button>
            <Button size="sm" onClick={addEmptyRow}>
              <Plus className="h-4 w-4 mr-1" /> Add Empty Row
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : displayRows.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              No items in this Control List yet.
            </CardContent></Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur text-muted-foreground uppercase">
                  <tr className="text-left">
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
                              if (!confirm('Delete this item?')) return;
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
        </>
      )}

      <ControlListFormDialog
        open={newListOpen} onOpenChange={setNewListOpen}
        defaultBranchId={branchId} defaultDepartment={department || null}
        existingLists={allLists}
        onSaved={({ id, branch_id, department: dep }) => {
          setBranchId(branch_id);
          setDepartment(dep);
          setControlListId(id);
          toast.success('Control List created. Add items now.');
        }}
      />
      <ControlListFormDialog
        key={currentList?.id ?? 'edit'}
        open={editListOpen} onOpenChange={setEditListOpen}
        editing={currentList}
        existingLists={allLists}
      />

      <BulkAddFromIngredientsDialog
        open={bulkOpen} onOpenChange={setBulkOpen}
        controlList={currentList}
        allItems={allItems}
      />

      <ImportPreviewDialog
        open={importOpen} onOpenChange={setImportOpen}
        preview={importPreview} onConfirm={confirmImport}
      />

      <CopyControlListDialog
        open={copyOpen} onOpenChange={setCopyOpen}
        lists={allLists} allItems={allItems}
        defaultFromListId={controlListId || null}
        onCreated={(id) => setControlListId(id)}
      />
    </div>
  );
}

// ===================== Control List form (new/edit) =====================
function ControlListFormDialog({
  open, onOpenChange, editing, defaultBranchId, defaultDepartment, existingLists, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: EnrichedControlList | null;
  defaultBranchId?: string;
  defaultDepartment?: Department | null;
  existingLists?: EnrichedControlList[];
  onSaved?: (list: { id: string; branch_id: string; department: Department }) => void;
}) {
  const { data: branches = [] } = useBranchesAll();
  const upsert = useUpsertInventoryControlList();
  const [branchId, setBranchId] = useState(editing?.branch_id ?? defaultBranchId ?? '');
  const [department, setDepartment] = useState<Department | ''>(editing?.department ?? defaultDepartment ?? '');
  const [code, setCode] = useState(editing?.control_list_code ?? '');
  const [name, setName] = useState(editing?.control_list_name ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  useEffect(() => {
    if (open) {
      setBranchId(editing?.branch_id ?? defaultBranchId ?? '');
      setDepartment(editing?.department ?? defaultDepartment ?? '');
      setCode(editing?.control_list_code ?? '');
      setName(editing?.control_list_name ?? '');
      setNotes(editing?.notes ?? '');
      setIsActive(editing?.is_active ?? true);
    }
  }, [open, editing, defaultBranchId, defaultDepartment]);

  const save = async () => {
    if (!branchId) return toast.error('Branch is required');
    if (!department) return toast.error('Department is required');
    if (!code.trim()) return toast.error('Control List Code is required');
    if (!name.trim()) return toast.error('Control List Name is required');
    const codeTrim = code.trim();
    const dup = (existingLists ?? []).some(l =>
      l.id !== editing?.id &&
      l.branch_id === branchId &&
      l.control_list_code.trim().toLowerCase() === codeTrim.toLowerCase()
    );
    if (dup) return toast.error('This Control List Code already exists for this branch.');
    try {
      const id = await upsert.mutateAsync({
        id: editing?.id, branch_id: branchId, department: department as Department,
        control_list_code: codeTrim, control_list_name: name,
        notes: notes.trim() || null, is_active: isActive,
      });
      if (editing) toast.success('Updated');
      onSaved?.({ id, branch_id: branchId, department: department as Department });
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? 'Save failed'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Control List' : 'New Control List'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Branch *</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Department *</Label>
              <Select value={department} onValueChange={v => setDepartment(v as Department)}>
                <SelectTrigger className="h-9 capitalize"><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Control List Code *</Label>
            <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="LCL-KIT-FRESH" className="font-mono" />
          </div>
          <div>
            <Label className="text-xs">Control List Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Kitchen Fresh Products" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={v => setIsActive(!!v)} /> Active
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

// ===================== Bulk add from ingredients =====================
function BulkAddFromIngredientsDialog({
  open, onOpenChange, controlList, allItems,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  controlList: EnrichedControlList | null;
  allItems: EnrichedControlItem[];
}) {
  const { data: ingredients = [] } = useIngredientPicker();
  const upsert = useUpsertInventoryControlItem();

  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const arr = [...ingredients];
    arr.sort((a, b) => {
      const ac = (a.code ?? ''), bc = (b.code ?? '');
      if (!ac && !bc) return a.name_en.localeCompare(b.name_en);
      if (!ac) return 1; if (!bc) return -1;
      return ac.localeCompare(bc, undefined, { numeric: true, sensitivity: 'base' });
    });
    return arr;
  }, [ingredients]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return sorted;
    return sorted.filter(i =>
      i.name_en.toLowerCase().includes(s) || (i.code ?? '').toLowerCase().includes(s));
  }, [sorted, search]);

  const togglePick = (id: string) =>
    setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    if (!controlList) { toast.error('Select a Control List first'); return; }
    if (picked.size === 0) { toast.error('Pick at least one ingredient'); return; }
    let added = 0, blocked = 0, failed = 0;
    for (const id of picked) {
      const ing = ingredients.find(i => i.id === id);
      if (!ing) continue;
      const code = (ing.code ?? '').trim();
      // duplicate rule: same item_code active in another list of same branch
      if (code) {
        const conflict = allItems.find(it =>
          it.is_active && it.source_type === 'ingredient' &&
          (it.item_code ?? '').toLowerCase() === code.toLowerCase() &&
          it.control_list_id !== controlList.id &&
          it.branch_id === controlList.branch_id);
        if (conflict) { blocked++; continue; }
      }
      try {
        await upsert.mutateAsync({
          ingredient_id: ing.id,
          item_code: code || null,
          item_name: ing.name_en,
          unit: ing.unit_label || null,
          source_type: 'ingredient',
          is_active: true,
          branch_id: controlList.branch_id,
          department: controlList.department,
          control_list_id: controlList.id,
        });
        added++;
      } catch { failed++; }
    }
    toast.success(`Added ${added}${blocked ? `, blocked ${blocked} (already in another list)` : ''}${failed ? `, ${failed} failed` : ''}`);
    setPicked(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk add from Ingredients</DialogTitle>
          <DialogDescription>
            Adding to <span className="font-mono font-medium text-foreground">{controlList?.control_list_code}</span> — {controlList?.control_list_name}
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Search ingredients by code or name…"
          value={search} onChange={e => setSearch(e.target.value)} className="h-9" />
        <div className="max-h-[380px] overflow-y-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left">
                <th className="py-1.5 px-2 w-8"></th>
                <th className="py-1.5 px-2 w-[120px]">Item Code</th>
                <th className="py-1.5 px-2">Item Name</th>
                <th className="py-1.5 px-2 w-[80px]">Unit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 800).map(i => (
                <tr key={i.id} className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => togglePick(i.id)}>
                  <td className="px-2"><Checkbox checked={picked.has(i.id)} onCheckedChange={() => togglePick(i.id)} /></td>
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
          <Button onClick={submit} disabled={upsert.isPending || !controlList}>Add selected</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Copy Control List =====================
function CopyControlListDialog({
  open, onOpenChange, lists, allItems, defaultFromListId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lists: EnrichedControlList[];
  allItems: EnrichedControlItem[];
  defaultFromListId: string | null;
  onCreated?: (id: string) => void;
}) {
  const { data: branches = [] } = useBranchesAll();
  const upsertList = useUpsertInventoryControlList();
  const upsert = useUpsertInventoryControlItem();

  const [fromListId, setFromListId] = useState(defaultFromListId ?? '');
  const [toBranch, setToBranch] = useState('');
  const [toDept, setToDept] = useState<Department | ''>('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [skipDup, setSkipDup] = useState(true);

  useEffect(() => {
    if (open) {
      setFromListId(defaultFromListId ?? '');
      const src = lists.find(l => l.id === defaultFromListId);
      setNewCode(src ? `${src.control_list_code}-COPY` : '');
      setNewName(src ? `${src.control_list_name} (Copy)` : '');
      setToBranch(''); setToDept(''); setActiveOnly(true); setSkipDup(true);
    }
  }, [open, defaultFromListId, lists]);

  const sourceList = lists.find(l => l.id === fromListId);
  const sourceItems = useMemo(() => allItems.filter(it =>
    it.control_list_id === fromListId && (!activeOnly || it.is_active)
  ), [allItems, fromListId, activeOnly]);

  const run = async () => {
    if (!sourceList) { toast.error('Select source Control List'); return; }
    if (!toBranch || !toDept) { toast.error('Select target Branch and Department'); return; }
    if (!newCode.trim() || !newName.trim()) { toast.error('New Code and Name required'); return; }
    let newListId: string;
    try {
      newListId = await upsertList.mutateAsync({
        branch_id: toBranch, department: toDept as Department,
        control_list_code: newCode, control_list_name: newName,
      });
    } catch (e: any) { toast.error(e?.message ?? 'Failed to create list'); return; }

    let copied = 0, skipped = 0, failed = 0;
    for (const it of sourceItems) {
      const code = (it.item_code ?? '').trim();
      if (code && it.source_type === 'ingredient') {
        const conflict = allItems.find(o =>
          o.is_active && o.source_type === 'ingredient' &&
          (o.item_code ?? '').toLowerCase() === code.toLowerCase() &&
          o.branch_id === toBranch && o.control_list_id !== newListId);
        if (conflict) {
          if (skipDup) { skipped++; continue; }
          else { failed++; continue; }
        }
      }
      try {
        await upsert.mutateAsync({
          ingredient_id: it.ingredient_id ?? null,
          item_code: it.item_code,
          item_name: it.item_name,
          unit: it.unit,
          source_type: it.source_type,
          is_active: it.is_active,
          branch_id: toBranch,
          department: toDept as Department,
          control_list_id: newListId,
          remarks: (it as any).remarks ?? null,
          min_stock: (it as any).min_stock ?? null,
          recommended_order: (it as any).recommended_order ?? null,
        });
        copied++;
      } catch { failed++; }
    }
    toast.success(`Created control list with ${copied} items. Skipped ${skipped} duplicates.${failed ? ` (${failed} failed)` : ''}`);
    onCreated?.(newListId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy Control List</DialogTitle>
          <DialogDescription>Duplicate a list to another Branch / Department.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase text-muted-foreground">From</Label>
            <Select value={fromListId} onValueChange={setFromListId}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Source control list" /></SelectTrigger>
              <SelectContent>
                {lists.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="font-mono">{l.control_list_code}</span> — {l.control_list_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase text-muted-foreground">To</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Select value={toBranch} onValueChange={setToBranch}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Target branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={toDept} onValueChange={v => setToDept(v as Department)}>
                <SelectTrigger className="h-9 capitalize"><SelectValue placeholder="Target department" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="New code" className="font-mono" />
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New name" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={activeOnly} onCheckedChange={v => setActiveOnly(!!v)} />
            Copy active items only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={skipDup} onCheckedChange={v => setSkipDup(!!v)} />
            Skip items already active in target branch
          </label>
          <p className="text-xs text-muted-foreground">
            Source contains <span className="font-medium text-foreground">{sourceItems.length}</span> item(s).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={upsert.isPending || upsertList.isPending}>Copy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Import preview =====================
type ImportItemRow = {
  payload: any;
  controlListCode: string;
  branchId: string;
  display: { list: string; branch: string; dept: string; code: string; name: string; unit: string };
  reason?: string;
};
type NewListRow = {
  payload: { branch_id: string; department: Department; control_list_code: string; control_list_name: string };
  display: { code: string; name: string; branch: string; dept: string };
};
type ImportPreview = {
  newLists: NewListRow[];
  toCreate: ImportItemRow[];
  toUpdate: ImportItemRow[];
  invalid: ImportItemRow[];
  duplicates: ImportItemRow[];
};

function buildImportPreview(
  data: any[],
  existingItems: EnrichedControlItem[],
  existingLists: EnrichedControlList[],
  branches: { id: string; name: string }[],
  fallback: { branchId: string | null; department: Department | null; controlList: EnrichedControlList | null },
): ImportPreview {
  const out: ImportPreview = { newLists: [], toCreate: [], toUpdate: [], invalid: [], duplicates: [] };
  const branchByName = new Map(branches.map(b => [b.name.toLowerCase().trim(), b.id]));
  const seen = new Set<string>();
  const newListByKey = new Map<string, NewListRow>(); // `${branch}|${code}`

  for (const raw of data) {
    const listCode = String(raw['Control List Code'] ?? raw.control_list_code ?? '').trim();
    const listName = String(raw['Control List Name'] ?? raw.control_list_name ?? '').trim();
    const branchRaw = String(raw.Branch ?? raw.branch ?? '').trim();
    const deptRaw = String(raw.Department ?? raw.department ?? '').trim().toLowerCase();
    const item_code = String(raw['Item Code'] ?? raw.item_code ?? '').trim();
    const item_name = String(raw['Item Name'] ?? raw.item_name ?? '').trim();
    const unit = String(raw.Unit ?? raw.unit ?? '').trim();
    const remarks = String(raw.Remarks ?? raw.remarks ?? '').trim();
    const min_stock = raw['Min Stock'] ?? raw.min_stock ?? '';
    const recommended_order = raw['Recommended Order'] ?? raw.recommended_order ?? '';
    const is_active = parseActive(raw.Active ?? raw.active ?? 'Active');

    const branch_id = branchRaw ? (branchByName.get(branchRaw.toLowerCase()) ?? null) : fallback.branchId;
    const department = (deptRaw || (fallback.department ?? '')) as string;
    const effectiveCode = listCode || fallback.controlList?.control_list_code || '';
    const effectiveName = listName || fallback.controlList?.control_list_name || effectiveCode;
    const branchDisplay = branchRaw || (branch_id ? (branches.find(b => b.id === branch_id)?.name ?? '') : '');
    const display = { list: effectiveCode, branch: branchDisplay, dept: department, code: item_code, name: item_name, unit };

    const missing: string[] = [];
    if (!branch_id) missing.push('Branch');
    if (!department) missing.push('Department');
    if (!effectiveCode) missing.push('Control List Code');
    if (!item_name) missing.push('Item Name');
    if (department && !DEPARTMENTS.includes(department as Department)) missing.push('Department invalid');
    if (missing.length) { out.invalid.push({ payload: null, controlListCode: effectiveCode, branchId: branch_id ?? '', display, reason: missing.join(', ') }); continue; }

    // Find or queue creation of control list
    const existingList = existingLists.find(l => l.branch_id === branch_id && l.control_list_code === effectiveCode);
    let control_list_id: string | null = existingList?.id ?? null;
    const newKey = `${branch_id}|${effectiveCode}`;
    if (!existingList && !newListByKey.has(newKey)) {
      const nl: NewListRow = {
        payload: { branch_id: branch_id!, department: department as Department, control_list_code: effectiveCode, control_list_name: effectiveName },
        display: { code: effectiveCode, name: effectiveName, branch: branchDisplay, dept: department },
      };
      newListByKey.set(newKey, nl);
      out.newLists.push(nl);
    }

    // duplicate (same item code already in different active list of branch)
    if (item_code) {
      const conflict = existingItems.find(it =>
        it.is_active && it.source_type === 'ingredient' &&
        (it.item_code ?? '').toLowerCase() === item_code.toLowerCase() &&
        it.branch_id === branch_id &&
        (control_list_id ? it.control_list_id !== control_list_id : true));
      if (conflict) {
        out.duplicates.push({ payload: null, controlListCode: effectiveCode, branchId: branch_id!, display, reason: 'Item active in another list of this branch' });
        continue;
      }
    }

    const dedupeKey = `${branch_id}|${effectiveCode}|${item_code}`;
    if (seen.has(dedupeKey) && item_code) {
      out.duplicates.push({ payload: null, controlListCode: effectiveCode, branchId: branch_id!, display, reason: 'Duplicate row in file' });
      continue;
    }
    seen.add(dedupeKey);

    const match = existingItems.find(e =>
      e.control_list_id === control_list_id &&
      ((e.item_code ?? '') === item_code) && item_code !== '');

    const payload = {
      id: match?.id,
      ingredient_id: match?.ingredient_id ?? null,
      item_code: item_code || null,
      item_name,
      unit: unit || null,
      source_type: (match?.source_type ?? (item_code ? 'ingredient' : 'manual')) as InventoryControlSource,
      is_active,
      branch_id,
      department,
      control_list_id,
      remarks: remarks || null,
      min_stock: min_stock !== '' ? Number(min_stock) : null,
      recommended_order: recommended_order !== '' ? Number(recommended_order) : null,
    };

    const row: ImportItemRow = { payload, controlListCode: effectiveCode, branchId: branch_id!, display };
    if (match) out.toUpdate.push(row);
    else out.toCreate.push(row);
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
  const sec = (title: string, rows: ImportItemRow[], color: string) => (
    <div>
      <div className={`text-xs font-medium mb-1 ${color}`}>{title} ({rows.length})</div>
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : (
        <div className="max-h-[120px] overflow-y-auto rounded border text-xs">
          <table className="w-full">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-2 py-1">List</th><th className="px-2 py-1">Branch</th>
                <th className="px-2 py-1">Code</th><th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-0.5 font-mono">{r.display.list}</td>
                  <td className="px-2 py-0.5">{r.display.branch}</td>
                  <td className="px-2 py-0.5 font-mono">{r.display.code}</td>
                  <td className="px-2 py-0.5">{r.display.name}</td>
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
          <div>
            <div className="text-xs font-medium mb-1 text-violet-600">New Control Lists ({preview.newLists.length})</div>
            {preview.newLists.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : (
              <div className="max-h-[100px] overflow-y-auto rounded border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/40"><tr className="text-left"><th className="px-2 py-1">Code</th><th className="px-2 py-1">Name</th><th className="px-2 py-1">Branch</th><th className="px-2 py-1">Dept</th></tr></thead>
                  <tbody>
                    {preview.newLists.map((l, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-0.5 font-mono">{l.display.code}</td>
                        <td className="px-2 py-0.5">{l.display.name}</td>
                        <td className="px-2 py-0.5">{l.display.branch}</td>
                        <td className="px-2 py-0.5 capitalize">{l.display.dept}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {sec('New items', preview.toCreate, 'text-emerald-600')}
          {sec('Updated items', preview.toUpdate, 'text-blue-600')}
          {sec('Skipped duplicates', preview.duplicates, 'text-rose-600')}
          {sec('Invalid', preview.invalid, 'text-amber-600')}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm}
            disabled={preview.toCreate.length === 0 && preview.toUpdate.length === 0 && preview.newLists.length === 0}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
