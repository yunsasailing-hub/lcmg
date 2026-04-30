// Manual items are temporary.
// Future versions will restrict all items to coded ingredients only.
import { useMemo, useState } from 'react';
import { Plus, Trash2, Power, PowerOff, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  type EnrichedControlItem,
} from '@/hooks/useInventoryControlItems';
import { toast } from 'sonner';

const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];

export default function InventoryControlList() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const { data: branches = [] } = useBranchesAll();
  const { data: items = [], isLoading } = useInventoryControlItems();
  const toggle = useToggleInventoryControlItem();
  const del = useDeleteInventoryControlItem();

  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedControlItem | null>(null);

  const filtered = useMemo(() => {
    return items.filter(it => {
      if (branchFilter !== 'all') {
        if (branchFilter === 'global' ? it.branch_id : it.branch_id !== branchFilter) return false;
      }
      if (deptFilter !== 'all') {
        if (deptFilter === 'global' ? it.department : it.department !== deptFilter) return false;
      }
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!it.item_name.toLowerCase().includes(s)
          && !(it.item_code ?? '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [items, branchFilter, deptFilter, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search code or name…" value={search}
          onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="max-w-[180px]"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            <SelectItem value="global">Global (no branch)</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="max-w-[180px]"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            <SelectItem value="global">Global (no dept)</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add item
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No items in the control list yet.
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr className="text-left">
                <th className="py-2 px-3">Code</th>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Unit</th>
                <th className="py-2 px-3">Source</th>
                <th className="py-2 px-3">Branch</th>
                <th className="py-2 px-3">Department</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => (
                <tr key={it.id} className="border-t">
                  <td className="py-2 px-3 font-mono text-xs">{it.item_code ?? '—'}</td>
                  <td className="py-2 px-3">{it.item_name}</td>
                  <td className="py-2 px-3">{it.unit ?? '—'}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className={
                      it.source_type === 'manual'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    }>{it.source_type}</Badge>
                  </td>
                  <td className="py-2 px-3 text-xs">{it.branch_name ?? <span className="text-muted-foreground">global</span>}</td>
                  <td className="py-2 px-3 capitalize text-xs">{it.department ?? <span className="text-muted-foreground">global</span>}</td>
                  <td className="py-2 px-3">
                    {it.is_active
                      ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">Active</Badge>
                      : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <Button size="sm" variant="ghost"
                      onClick={() => { setEditing(it); setFormOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => toggle.mutate({ id: it.id, is_active: !it.is_active })}>
                      {it.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
                    {isOwner && (
                      <Button size="sm" variant="ghost"
                        onClick={async () => {
                          if (!confirm('Delete this item from the control list?')) return;
                          try { await del.mutateAsync(it.id); toast.success('Deleted'); }
                          catch (e: any) { toast.error(e?.message ?? 'Delete failed'); }
                        }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ControlItemFormDialog
        key={editing?.id ?? 'new'}
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
      />
    </div>
  );
}

function ControlItemFormDialog({
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
  const [remarks, setRemarks] = useState((initial as any)?.remarks ?? '');
  const [minStock, setMinStock] = useState<string>(
    (initial as any)?.min_stock != null ? String((initial as any).min_stock) : '',
  );
  const [recommendedOrder, setRecommendedOrder] = useState<string>(
    (initial as any)?.recommended_order != null ? String((initial as any).recommended_order) : '',
  );

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
        remarks: remarks.trim() || null,
        min_stock: minStock ? Number(minStock) : null,
        recommended_order: recommendedOrder ? Number(recommendedOrder) : null,
      });
      toast.success(initial ? 'Item updated' : 'Item added to control list');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit control item' : 'Add control item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Source</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ingredient">From Ingredients</SelectItem>
                <SelectItem value="manual">Manual entry</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sourceType === 'ingredient' && (
            <div>
              <Label>Pick ingredient *</Label>
              <SearchableCombobox
                value={ingredientId}
                onChange={onPickIngredient}
                options={ingredientOptions}
                placeholder="Search ingredient by code or name"
                searchPlaceholder="Type to search…"
                emptyText="No ingredient found"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Code, name, and unit auto-fill from the ingredient.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Label className="text-xs">Code</Label>
              <Input value={itemCode} onChange={e => setItemCode(e.target.value)}
                disabled={sourceType === 'ingredient' && !!ingredientId} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Name *</Label>
              <Input value={itemName} onChange={e => setItemName(e.target.value)}
                disabled={sourceType === 'ingredient' && !!ingredientId} />
            </div>
            <div className="col-span-3">
              <Label className="text-xs">Unit</Label>
              <Input value={unit} onChange={e => setUnit(e.target.value)}
                placeholder="kg, pcs…"
                disabled={sourceType === 'ingredient' && !!ingredientId} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Branch (optional)</Label>
              <Select value={branchId || 'global'} onValueChange={(v) => setBranchId(v === 'global' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (all branches)</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Department (optional)</Label>
              <Select value={department || 'global'} onValueChange={(v) => setDepartment(v === 'global' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (all departments)</SelectItem>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div>
              <Label className="text-xs">Remarks (optional)</Label>
              <Input value={remarks} onChange={e => setRemarks(e.target.value)}
                placeholder="Brand, packaging, etc." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Min stock</Label>
              <Input type="number" inputMode="decimal" value={minStock}
                onChange={e => setMinStock(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Recommended order</Label>
              <Input type="number" inputMode="decimal" value={recommendedOrder}
                onChange={e => setRecommendedOrder(e.target.value)} />
            </div>
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