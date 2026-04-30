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
import { toast } from 'sonner';

const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];

interface RowState {
  id?: string;
  control_item_id: string;
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

export default function InventoryWeeklySheet({
  initial, onDone,
}: {
  initial?: InventoryRequestWithItems | null;
  onDone?: () => void;
}) {
  const { profile, user } = useAuth();
  const { data: branches = [] } = useBranchesAll();
  const upsert = useUpsertInventoryRequest();

  const [requestDate, setRequestDate] = useState(
    initial?.request_date ?? new Date().toISOString().slice(0, 10),
  );
  const [branchId, setBranchId] = useState<string>(
    initial?.branch_id ?? profile?.branch_id ?? '',
  );
  const [department, setDepartment] = useState<Department | ''>(
    (initial?.department as Department) ?? (profile?.department as Department) ?? '',
  );

  const { data: controlItems = [], isLoading: loadingItems } = useInventoryControlItems({
    activeOnly: true,
    branchId: branchId || null,
    department: department || null,
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
  }, [rows.length, branchId, department]);

  const setEdit = (cid: string, patch: Partial<Edit>) => {
    setEdits(prev => ({ ...prev, [cid]: { ...prev[cid], ...patch } }));
  };

  const submit = async (status: InventoryRequestStatus) => {
    if (!branchId) return toast.error('Please select a branch');
    if (!department) return toast.error('Please select a department');
    if (!rows.length) return toast.error('No active items for this branch / department');

    const items = rows
      .map((r, i) => {
        const e = edits[r.control_item_id] ?? { stock: '', order_request: '', note: '' };
        return {
          id: r.id,
          ingredient_id: r.ingredient_id,
          inventory_control_item_id: r.control_item_id,
          source_type: 'ingredient' as const,
          item_code: r.item_code || null,
          item_name: r.item_name,
          unit: r.unit || null,
          actual_stock: e.stock ? Number(e.stock) : null,
          requested_qty: e.order_request ? Number(e.order_request) : null,
          note: e.note?.trim() || null,
          sort_order: i,
        };
      });

    try {
      await upsert.mutateAsync({
        id: initial?.id,
        request_date: requestDate,
        branch_id: branchId,
        department: department as Department,
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

  const showEmpty = branchId && department && !loadingItems && rows.length === 0;

  return (
    <div className="space-y-3">
      {/* Header selectors */}
      <Card>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Branch *</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Department *</Label>
            <Select value={department} onValueChange={v => setDepartment(v as Department)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
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
      {!branchId || !department ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Select branch and department to load the weekly inventory sheet.
        </CardContent></Card>
      ) : loadingItems ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : showEmpty ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No inventory items selected for this branch / department.
          Owner must add items in <span className="font-medium text-foreground">Inventory Control List</span>.
        </CardContent></Card>
      ) : (
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
      )}

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onDone && (
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        )}
        <Button variant="secondary" disabled={upsert.isPending || !rows.length}
          onClick={() => submit('Draft')}>
          Save Draft
        </Button>
        <Button disabled={upsert.isPending || !rows.length}
          onClick={() => submit('Submitted')}>
          Submit to Owner
        </Button>
      </div>
    </div>
  );
}