import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { useAuth } from '@/hooks/useAuth';
import { useBranchesAll } from '@/hooks/useMaintenance';
import {
  useUpsertInventoryRequest, useIngredientPicker,
  type InventoryRequestWithItems, type Department, type InventoryRequestStatus,
} from '@/hooks/useInventoryRequests';
import { toast } from 'sonner';

const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];

interface ItemRow {
  id?: string;
  ingredient_id?: string | null;
  item_code: string;
  item_name: string;
  unit: string;
  actual_stock: string;
  requested_qty: string;
  note: string;
}

function emptyRow(): ItemRow {
  return { item_code: '', item_name: '', unit: '', actual_stock: '', requested_qty: '', note: '' };
}

export default function InventoryRequestForm({
  open, onOpenChange, initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: InventoryRequestWithItems | null;
}) {
  const { profile, user } = useAuth();
  const { data: branches = [] } = useBranchesAll();
  const { data: ingredients = [] } = useIngredientPicker();
  const upsert = useUpsertInventoryRequest();

  const [requestDate, setRequestDate] = useState(() =>
    initial?.request_date ?? new Date().toISOString().slice(0, 10),
  );
  const [branchId, setBranchId] = useState<string>(
    initial?.branch_id ?? profile?.branch_id ?? '',
  );
  const [department, setDepartment] = useState<Department | ''>(
    (initial?.department as Department) ?? (profile?.department as Department) ?? '',
  );
  const [staffName, setStaffName] = useState(initial?.staff_name ?? profile?.full_name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [rows, setRows] = useState<ItemRow[]>(() =>
    initial?.items?.length
      ? initial.items.map(it => ({
          id: it.id,
          ingredient_id: it.ingredient_id,
          item_code: it.item_code ?? '',
          item_name: it.item_name ?? '',
          unit: it.unit ?? '',
          actual_stock: it.actual_stock?.toString() ?? '',
          requested_qty: it.requested_qty?.toString() ?? '',
          note: it.note ?? '',
        }))
      : [emptyRow()],
  );

  // Reset on open of new
  useEffect(() => {
    if (open && !initial) {
      setRequestDate(new Date().toISOString().slice(0, 10));
      setBranchId(profile?.branch_id ?? '');
      setDepartment((profile?.department as Department) ?? '');
      setStaffName(profile?.full_name ?? '');
      setNotes('');
      setRows([emptyRow()]);
    }
  }, [open]); // eslint-disable-line

  const ingredientOptions = useMemo(
    () => ingredients.map(ing => ({
      id: ing.id,
      label: `${ing.code ? ing.code + ' — ' : ''}${ing.name_en}`,
      sublabel: ing.unit_label || undefined,
    })),
    [ingredients],
  );

  const updateRow = (idx: number, patch: Partial<ItemRow>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const pickIngredient = (idx: number, ingredientId: string) => {
    const ing = ingredients.find(i => i.id === ingredientId);
    if (!ing) {
      updateRow(idx, { ingredient_id: null });
      return;
    }
    updateRow(idx, {
      ingredient_id: ing.id,
      item_code: ing.code ?? '',
      item_name: ing.name_en,
      unit: ing.unit_label ?? '',
    });
  };

  const submit = async (status: InventoryRequestStatus) => {
    if (!branchId) return toast.error('Please select a branch');
    if (!department) return toast.error('Please select a department');
    const validRows = rows.filter(r => r.item_name.trim());
    if (!validRows.length) return toast.error('Add at least one item');

    try {
      await upsert.mutateAsync({
        id: initial?.id,
        request_date: requestDate,
        branch_id: branchId,
        department: department as Department,
        status,
        staff_user_id: user?.id ?? null,
        staff_name: staffName.trim() || null,
        notes: notes.trim() || null,
        items: validRows.map((r, i) => ({
          id: r.id,
          ingredient_id: r.ingredient_id ?? null,
          item_code: r.item_code.trim() || null,
          item_name: r.item_name.trim(),
          unit: r.unit.trim() || null,
          actual_stock: r.actual_stock ? Number(r.actual_stock) : null,
          requested_qty: r.requested_qty ? Number(r.requested_qty) : null,
          note: r.note.trim() || null,
          sort_order: i,
        })),
      });
      toast.success(status === 'Submitted' ? 'Request submitted for owner review' : 'Saved as draft');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? 'Edit Stock Update / Purchase Request' : 'New Stock Update / Purchase Request'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} />
          </div>
          <div>
            <Label>Branch *</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department *</Label>
            <Select value={department} onValueChange={v => setDepartment(v as Department)}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Staff name</Label>
            <Input value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Auto-filled from your profile" />
          </div>
          <div className="sm:col-span-3">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Items</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setRows(r => [...r, emptyRow()])}>
              <Plus className="h-4 w-4 mr-1" /> Add item
            </Button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={idx} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                  {rows.length > 1 && (
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setRows(r => r.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Pick from ingredient list (optional)</Label>
                  <div className="flex gap-2">
                    <SearchableCombobox
                      value={row.ingredient_id ?? ''}
                      onChange={(v) => pickIngredient(idx, v)}
                      options={ingredientOptions}
                      placeholder="Search ingredient by code or name"
                      searchPlaceholder="Type to search…"
                      emptyText="No ingredient found"
                      allowNone
                      noneLabel="— manual entry —"
                    />
                    {row.ingredient_id && (
                      <Button type="button" variant="ghost" size="icon"
                        onClick={() => updateRow(idx, { ingredient_id: null })}
                        title="Clear ingredient link">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <div className="col-span-1 sm:col-span-2">
                    <Label className="text-xs">Item code</Label>
                    <Input value={row.item_code} onChange={e => updateRow(idx, { item_code: e.target.value })} />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label className="text-xs">Item name *</Label>
                    <Input value={row.item_name} onChange={e => updateRow(idx, { item_name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Unit</Label>
                    <Input value={row.unit} onChange={e => updateRow(idx, { unit: e.target.value })} placeholder="kg, pcs…" />
                  </div>
                  <div>
                    <Label className="text-xs">Actual stock</Label>
                    <Input type="number" inputMode="decimal" value={row.actual_stock}
                      onChange={e => updateRow(idx, { actual_stock: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Requested qty</Label>
                    <Input type="number" inputMode="decimal" value={row.requested_qty}
                      onChange={e => updateRow(idx, { requested_qty: e.target.value })} />
                  </div>
                  <div className="col-span-1 sm:col-span-5">
                    <Label className="text-xs">Note</Label>
                    <Input value={row.note} onChange={e => updateRow(idx, { note: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" disabled={upsert.isPending} onClick={() => submit('Draft')}>
            Save draft
          </Button>
          <Button disabled={upsert.isPending} onClick={() => submit('Submitted')}>
            Submit for owner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}