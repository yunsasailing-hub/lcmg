// Weekly inventory sheet — slim, Excel-like input.
// Manual items live only in the Owner Control List, not in this staff form.
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useBranchesAll } from '@/hooks/useMaintenance';
import {
  useUpsertInventoryRequest,
  type InventoryRequestStatus, type InventoryRequestWithItems, type Department,
} from '@/hooks/useInventoryRequests';
import { useInventoryControlItems } from '@/hooks/useInventoryControlItems';
import { useInventoryControlLists } from '@/hooks/useInventoryControlLists';
import { toast } from 'sonner';
import { Plus, Trash2, ListChecks } from 'lucide-react';

interface RowState {
  id?: string;
  control_item_id: string;
  control_list_id: string | null;
  ingredient_id: string | null;
  item_code: string;
  item_name: string;
  unit: string;
  remarks: string;
  min_stock: number | null;
  recommended_order: number | null;
  stock: string;        // editable
  order_request: string; // editable
  note: string;          // editable
}

interface ExtraRow {
  key: string;
  item_name: string;
  unit: string;
  qty: string;
  note: string;
}

export default function InventoryWeeklySheet({
  initial, onDone, onRequestCreateControlList,
}: {
  initial?: InventoryRequestWithItems | null;
  onDone?: () => void;
  onRequestCreateControlList?: (branchId: string) => void;
}) {
  const { profile, user } = useAuth();
  const { data: branches = [] } = useBranchesAll();
  const upsert = useUpsertInventoryRequest();

  // Weekly Sheet must target a real branch — exclude the synthetic "ALL BRANCHES" entry.
  const ALL_BRANCHES_ID = '00000000-0000-0000-0000-000000000001';
  const selectableBranches = useMemo(
    () => branches.filter(b => b.id !== ALL_BRANCHES_ID && b.name?.toUpperCase() !== 'ALL BRANCHES'),
    [branches],
  );

  const [requestDate, setRequestDate] = useState(
    initial?.request_date ?? new Date().toISOString().slice(0, 10),
  );
  const [branchId, setBranchId] = useState<string>(
    (initial?.branch_id && initial.branch_id !== ALL_BRANCHES_ID ? initial.branch_id : '')
      || (profile?.branch_id && profile.branch_id !== ALL_BRANCHES_ID ? profile.branch_id : ''),
  );
  const [controlListId, setControlListId] = useState<string>(
    (initial?.items?.find((it: any) => it.control_list_id)?.control_list_id as string) ?? '',
  );

  const { data: lists = [] } = useInventoryControlLists({ activeOnly: true, branchId: branchId || null });
  const currentList = useMemo(() => lists.find(l => l.id === controlListId) ?? null, [lists, controlListId]);
  const department: Department | '' = (currentList?.department ?? (initial?.department as Department) ?? '') as any;

  // Reset control list when branch changes if it no longer matches
  useEffect(() => {
    if (controlListId && !lists.find(l => l.id === controlListId)) setControlListId('');
  }, [lists, controlListId]);

  const { data: controlItems = [], isLoading: loadingItems } = useInventoryControlItems({
    activeOnly: true,
    controlListId: controlListId || null,
  });

  // Build editable rows: one per active control item, merged with any existing values from `initial`.
  const rows = useMemo<RowState[]>(() => {
    const byControlId = new Map<string, any>();
    (initial?.items ?? []).forEach((it: any) => {
      if (it.inventory_control_item_id) byControlId.set(it.inventory_control_item_id, it);
    });
    return controlItems.map(ci => {
      const existing = byControlId.get(ci.id);
      return {
        id: existing?.id,
        control_item_id: ci.id,
        control_list_id: ci.control_list_id ?? null,
        ingredient_id: ci.ingredient_id ?? null,
        item_code: ci.item_code ?? '',
        item_name: ci.item_name,
        unit: ci.unit ?? '',
        remarks: (ci as any).remarks ?? '',
        min_stock: (ci as any).min_stock ?? null,
        recommended_order: (ci as any).recommended_order ?? null,
        stock: existing?.actual_stock?.toString() ?? '',
        order_request: existing?.requested_qty?.toString() ?? '',
        note: existing?.note ?? '',
      };
    });
  }, [controlItems, initial]);

  // Local edits keyed by control_item_id
  type Edit = { stock: string; order_request: string; note: string };
  const [edits, setEdits] = useState<Record<string, Edit>>({});

  // Extra (non-control-list) items typed manually by staff.
  const [extras, setExtras] = useState<ExtraRow[]>(() =>
    (initial?.items ?? [])
      .filter((it: any) => it.source_type === 'extra')
      .map((it: any, i: number) => ({
        key: it.id ?? `existing-${i}`,
        item_name: it.item_name ?? '',
        unit: it.unit ?? '',
        qty: it.requested_qty?.toString() ?? '',
        note: it.note ?? '',
      })),
  );

  const addExtra = () =>
    setExtras(prev => [
      ...prev,
      { key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, item_name: '', unit: '', qty: '', note: '' },
    ]);
  const updateExtra = (key: string, patch: Partial<ExtraRow>) =>
    setExtras(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const removeExtra = (key: string) =>
    setExtras(prev => prev.filter(r => r.key !== key));

  // Initialise edits when rows change
  useEffect(() => {
    const next: Record<string, Edit> = {};
    rows.forEach(r => {
      next[r.control_item_id] = edits[r.control_item_id] ?? {
        stock: r.stock, order_request: r.order_request, note: r.note,
      };
    });
    setEdits(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, branchId, controlListId]);

  const setEdit = (cid: string, patch: Partial<Edit>) => {
    setEdits(prev => ({ ...prev, [cid]: { ...prev[cid], ...patch } }));
  };

  const submit = async (status: InventoryRequestStatus) => {
    if (!branchId) return toast.error('Please select a branch');
    if (!controlListId || !currentList) return toast.error('Please select a Control List');
    const cleanedExtras = extras
      .map(x => ({ ...x, item_name: x.item_name.trim() }))
      .filter(x => x.item_name.length > 0);
    if (!rows.length && !cleanedExtras.length) {
      return toast.error('No items to submit');
    }

    const items = rows
      .map((r, i) => {
        const e = edits[r.control_item_id] ?? { stock: '', order_request: '', note: '' };
        return {
          id: r.id,
          ingredient_id: r.ingredient_id,
          inventory_control_item_id: r.control_item_id,
          control_list_id: r.control_list_id,
          source_type: 'ingredient' as 'ingredient' | 'extra',
          item_code: r.item_code || null,
          item_name: r.item_name,
          unit: r.unit || null,
          actual_stock: e.stock ? Number(e.stock) : null,
          requested_qty: e.order_request ? Number(e.order_request) : null,
          note: e.note?.trim() || null,
          sort_order: i,
        };
      });

    cleanedExtras.forEach((x, i) => {
      items.push({
        id: undefined,
        ingredient_id: null,
        inventory_control_item_id: null,
        control_list_id: controlListId,
        source_type: 'extra' as 'ingredient' | 'extra',
        item_code: null,
        item_name: x.item_name,
        unit: x.unit.trim() || null,
        actual_stock: null,
        requested_qty: x.qty ? Number(x.qty) : null,
        note: x.note?.trim() || null,
        sort_order: rows.length + i,
      });
    });

    try {
      await upsert.mutateAsync({
        id: initial?.id,
        request_date: requestDate,
        branch_id: branchId,
        department: currentList.department,
        status,
        staff_user_id: user?.id ?? null,
        staff_name: profile?.full_name ?? null,
        notes: null,
        items,
      });
      toast.success(status === 'Submitted' ? 'Submitted to Owner' : 'Draft saved');
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed');
    }
  };

  const ready = !!branchId && !!controlListId;
  const showEmpty = ready && !loadingItems && rows.length === 0;

  return (
    <div className="space-y-3">
      {/* Header selectors */}
      <Card>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Branch *</Label>
            <Select value={branchId} onValueChange={(v) => { setBranchId(v); setControlListId(''); }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {selectableBranches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Control List *</Label>
            <Select value={controlListId} onValueChange={setControlListId} disabled={!branchId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={branchId ? 'Select control list' : 'Pick branch first'} /></SelectTrigger>
              <SelectContent>
                {lists.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No active control lists for this branch.</div>
                )}
                {lists.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="font-mono">{l.control_list_code}</span> — {l.control_list_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date *</Label>
            <Input type="date" className="h-9"
              value={requestDate} onChange={e => setRequestDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Sheet */}
      {!branchId ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Select a branch to load its Control Lists.
        </CardContent></Card>
      ) : lists.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm space-y-3">
            <p className="text-muted-foreground">
              No Control List found for this branch. Please create one.
            </p>
            {onRequestCreateControlList && (
              <Button size="sm" onClick={() => onRequestCreateControlList(branchId)}>
                <ListChecks className="h-4 w-4 mr-1" /> Create Control List
              </Button>
            )}
          </CardContent>
        </Card>
      ) : !controlListId ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Select a Control List to load the weekly inventory sheet.
        </CardContent></Card>
      ) : loadingItems ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : showEmpty ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No inventory items selected for this branch / department.
          Owner must add items in <span className="font-medium text-foreground">Inventory Control List</span>.
        </CardContent></Card>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-[11px] uppercase">
              <tr className="text-left">
                <th className="py-2 px-2 w-[110px]">Code</th>
                <th className="py-2 px-2 min-w-[180px]">Item name</th>
                <th className="py-2 px-2 hidden md:table-cell">Remarks</th>
                <th className="py-2 px-2 w-[110px]">Stock</th>
                <th className="py-2 px-2 w-[80px] text-right hidden sm:table-cell">Min</th>
                <th className="py-2 px-2 w-[110px] text-right hidden sm:table-cell">Recom.</th>
                <th className="py-2 px-2 w-[120px]">Order req.</th>
                <th className="py-2 px-2 min-w-[140px]">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const e = edits[r.control_item_id] ?? { stock: '', order_request: '', note: '' };
                return (
                  <tr key={r.control_item_id} className="border-t align-middle">
                    <td className="py-1.5 px-2 font-mono text-[11px]">{r.item_code || '—'}</td>
                    <td className="py-1.5 px-2">
                      <div className="font-medium">{r.item_name}</div>
                      {r.unit && <div className="text-[11px] text-muted-foreground">{r.unit}</div>}
                    </td>
                    <td className="py-1.5 px-2 text-muted-foreground hidden md:table-cell">{r.remarks || '—'}</td>
                    <td className="py-1.5 px-2">
                      <Input type="number" inputMode="decimal"
                        className="h-8 text-right"
                        value={e.stock}
                        onChange={ev => setEdit(r.control_item_id, { stock: ev.target.value })} />
                    </td>
                    <td className="py-1.5 px-2 text-right hidden sm:table-cell">
                      {r.min_stock ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right hidden sm:table-cell">
                      {r.recommended_order ?? '—'}
                    </td>
                    <td className="py-1.5 px-2">
                      <Input type="number" inputMode="decimal"
                        className="h-8 text-right"
                        value={e.order_request}
                        onChange={ev => setEdit(r.control_item_id, { order_request: ev.target.value })} />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input className="h-8"
                        value={e.note}
                        onChange={ev => setEdit(r.control_item_id, { note: ev.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Additional item request */}
      {ready && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Additional item request</div>
                <div className="text-[11px] text-muted-foreground">
                  Items not on the Control List. Owner will review separately.
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addExtra}>
                <Plus className="h-4 w-4 mr-1" /> Add extra item
              </Button>
            </div>

            {extras.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No extra items.</p>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-muted/40 text-muted-foreground text-[11px] uppercase">
                    <tr className="text-left">
                      <th className="py-2 px-2 min-w-[180px]">Item name *</th>
                      <th className="py-2 px-2 w-[100px]">Unit</th>
                      <th className="py-2 px-2 w-[110px]">Qty req.</th>
                      <th className="py-2 px-2 min-w-[160px]">Note / reason</th>
                      <th className="py-2 px-2 w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {extras.map(x => (
                      <tr key={x.key} className="border-t align-middle">
                        <td className="py-1.5 px-2">
                          <Input className="h-8" value={x.item_name}
                            onChange={e => updateExtra(x.key, { item_name: e.target.value })} />
                        </td>
                        <td className="py-1.5 px-2">
                          <Input className="h-8" value={x.unit}
                            onChange={e => updateExtra(x.key, { unit: e.target.value })} />
                        </td>
                        <td className="py-1.5 px-2">
                          <Input type="number" inputMode="decimal" className="h-8 text-right"
                            value={x.qty}
                            onChange={e => updateExtra(x.key, { qty: e.target.value })} />
                        </td>
                        <td className="py-1.5 px-2">
                          <Input className="h-8" value={x.note}
                            onChange={e => updateExtra(x.key, { note: e.target.value })} />
                        </td>
                        <td className="py-1.5 px-1 text-right">
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8"
                            onClick={() => removeExtra(x.key)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onDone && (
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        )}
        <Button variant="secondary" disabled={upsert.isPending || (!rows.length && !extras.length)}
          onClick={() => submit('Draft')}>
          Save Draft
        </Button>
        <Button disabled={upsert.isPending || (!rows.length && !extras.length)}
          onClick={() => submit('Submitted')}>
          Submit to Owner
        </Button>
      </div>
    </div>
  );
}