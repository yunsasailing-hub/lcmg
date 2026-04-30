import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Save, Pencil, Trash2, AlertTriangle, Plus } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useChecklists';
import { useRecipeUnits } from '@/hooks/useIngredients';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type Department = 'management' | 'kitchen' | 'pizza' | 'service' | 'bar' | 'office' | 'bakery';
const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bakery', 'bar', 'service', 'office', 'management'];

interface ProductionItem {
  id: string;
  code: string;
  name_en: string;
  yield_unit_id: string | null;
  department: Department | null;
}

interface LogRow {
  id: string;
  production_date: string;
  branch_id: string | null;
  department: Department | null;
  item_code: string;
  item_name: string;
  item_type: 'MENU_ITEM' | 'BATCH_RECIPE';
  quantity_produced: number;
  unit: string | null;
  staff_name: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const LS_BRANCH = 'kitchenProduction:lastBranch';

export default function KitchenProduction() {
  const { t } = useTranslation();
  const { user, profile, hasAnyRole } = useAuth();
  const qc = useQueryClient();

  const isOwner = hasAnyRole(['owner']);
  const isManager = hasAnyRole(['manager']);
  const isOwnerOrManager = isOwner || isManager;

  const { data: branches = [] } = useBranches();
  const { data: units = [] } = useRecipeUnits();
  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['kitchen-production-items'],
    queryFn: async (): Promise<ProductionItem[]> => {
      const { data, error } = await (supabase
        .from('recipes') as any)
        .select('id, code, name_en, yield_unit_id, department, is_active, show_in_kitchen_production')
        .eq('is_active', true)
        .eq('show_in_kitchen_production', true)
        .or('code.ilike.1012%,code.ilike.1013%')
        .order('code', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        code: r.code ?? '',
        name_en: r.name_en ?? '',
        yield_unit_id: r.yield_unit_id ?? null,
        department: (r.department ?? null) as Department | null,
      }));
    },
  });

  const [filterDate, setFilterDate] = useState<string>('');
  const [filterBranch, setFilterBranch] = useState<string>('__all__');
  const [filterDept, setFilterDept] = useState<string>('__all__');
  const [filterType, setFilterType] = useState<string>('__all__');
  const [filterText, setFilterText] = useState<string>('');

  const { data: logs = [] } = useQuery({
    queryKey: ['kitchen-production-logs'],
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from('kitchen_production_logs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (filterDate && l.production_date !== filterDate) return false;
      if (filterBranch !== '__all__' && l.branch_id !== filterBranch) return false;
      if (filterDept !== '__all__' && l.department !== filterDept) return false;
      if (filterType !== '__all__' && l.item_type !== filterType) return false;
      if (filterText.trim()) {
        const q = filterText.trim().toLowerCase();
        if (!l.item_code.toLowerCase().includes(q) && !l.item_name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [logs, filterDate, filterBranch, filterDept, filterType, filterText]);

  // Form state with persisted defaults
  const [productionDate, setProductionDate] = useState<string>(todayISO());
  const [branchId, setBranchId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const qtyInputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);

  // Hydrate defaults from localStorage / profile once branches load
  useEffect(() => {
    if (hydratedRef.current) return;
    if (branches.length === 0) return;
    const lsBranch = typeof window !== 'undefined' ? localStorage.getItem(LS_BRANCH) : null;
    const branchExists = (id: string | null) => !!id && branches.some(b => b.id === id);
    const initBranch = branchExists(lsBranch) ? lsBranch! : (branchExists(profile?.branch_id ?? null) ? profile!.branch_id! : (branches[0]?.id ?? ''));
    setBranchId(initBranch);
    hydratedRef.current = true;
  }, [branches, profile]);

  // Persist branch/department selection per user
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (branchId) localStorage.setItem(LS_BRANCH, branchId);
  }, [branchId]);

  const selectedItem = items.find(i => i.id === itemId);
  const selectedItemUnit = selectedItem?.yield_unit_id ? unitMap[selectedItem.yield_unit_id] : null;
  const recipeDepartment: Department | null = selectedItem?.department ?? null;

  const itemOptions = useMemo(
    () => items.map(i => ({
      id: i.id,
      label: `${i.code} — ${i.name_en} — ${i.yield_unit_id && unitMap[i.yield_unit_id] ? unitMap[i.yield_unit_id].name_en : t('kitchenProduction.fields.unitMissing')}`,
    })),
    [items, unitMap, t],
  );

  const addQty = (n: number) => {
    const cur = Number(quantity);
    const base = Number.isFinite(cur) && cur > 0 ? cur : 0;
    setQuantity(String(base + n));
    qtyInputRef.current?.focus();
  };

  const save = useMutation({
    mutationFn: async () => {
      const newErrors: Record<string, string> = {};
      if (!productionDate) newErrors.date = t('kitchenProduction.errors.dateRequired');
      if (!branchId) newErrors.branch = t('kitchenProduction.errors.branchRequired');
      if (!itemId || !selectedItem) newErrors.item = t('kitchenProduction.errors.itemRequired');
      if (selectedItem && !recipeDepartment) newErrors.dept = t('kitchenProduction.errors.deptMissingRecipe');
      const qtyN = Number(quantity);
      if (!quantity.trim() || !Number.isFinite(qtyN) || qtyN <= 0) {
        newErrors.qty = t('kitchenProduction.errors.qtyPositive');
      }
      if (selectedItem) {
        const c = selectedItem.code;
        if (!(c.startsWith('1012') || c.startsWith('1013'))) {
          newErrors.item = t('kitchenProduction.errors.invalidCode');
        }
      }
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) throw new Error('validation');
      if (!user) throw new Error('Not authenticated');

      const unitLabel = selectedItem?.yield_unit_id && unitMap[selectedItem.yield_unit_id]
        ? unitMap[selectedItem.yield_unit_id].name_en
        : null;

      const payload = {
        production_date: productionDate,
        branch_id: branchId || null,
        department: recipeDepartment,
        item_code: selectedItem!.code,
        item_name: selectedItem!.name_en,
        item_type: selectedItem!.code.startsWith('1013') ? 'MENU_ITEM' : 'BATCH_RECIPE',
        linked_recipe_id: selectedItem!.id,
        linked_recipe_code: selectedItem!.code,
        quantity_produced: qtyN,
        unit: unitLabel,
        staff_user_id: user.id,
        staff_name: profile?.full_name ?? profile?.email ?? user.email ?? null,
        notes: notes.trim() || null,
        created_by: user.id,
      };

      const { error } = await supabase.from('kitchen_production_logs' as any).insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t('kitchenProduction.saved') });
      // PART 3: keep item, branch, department, date — clear only qty + notes, focus qty
      setQuantity('');
      setNotes('');
      setErrors({});
      qc.invalidateQueries({ queryKey: ['kitchen-production-logs'] });
      setTimeout(() => qtyInputRef.current?.focus(), 0);
    },
    onError: (e: any) => {
      if (e?.message === 'validation') return;
      toast({ title: t('kitchenProduction.saveFailed'), description: e?.message, variant: 'destructive' });
    },
  });

  function fmtQty(v: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(v);
  }

  const branchMap = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  // Edit / delete state
  const [editRow, setEditRow] = useState<LogRow | null>(null);
  const [editQty, setEditQty] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [deleteRow, setDeleteRow] = useState<LogRow | null>(null);

  const canEdit = (row: LogRow) => {
    if (isOwnerOrManager) return true;
    if (!user) return false;
    if (row.created_by !== user.id) return false;
    return row.production_date === todayISO();
  };
  const canDelete = (row: LogRow) => {
    if (isOwnerOrManager) return true;
    if (!user) return false;
    if (row.created_by !== user.id) return false;
    return row.production_date === todayISO();
  };

  const updateRow = useMutation({
    mutationFn: async (row: LogRow) => {
      const qn = Number(editQty);
      if (!Number.isFinite(qn) || qn <= 0) throw new Error(t('kitchenProduction.errors.qtyPositive'));
      const { error, count } = await supabase
        .from('kitchen_production_logs' as any)
        .update({ quantity_produced: qn, notes: editNotes.trim() || null } as any, { count: 'exact' })
        .eq('id', row.id)
        .select('id');
      if (error) throw error;
      if (count === 0) throw new Error('not_permitted');
    },
    onSuccess: () => {
      toast({ title: t('kitchenProduction.updateSaved') });
      setEditRow(null);
      qc.invalidateQueries({ queryKey: ['kitchen-production-logs'] });
    },
    onError: (e: any) => {
      console.error('[KitchenProduction] update failed', e);
      toast({ title: t('kitchenProduction.saveFailed'), description: e?.message, variant: 'destructive' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (row: LogRow) => {
      const { data, error } = await supabase
        .from('kitchen_production_logs' as any)
        .delete()
        .eq('id', row.id)
        .select('id');
      if (error) throw error;
      if (!data || (data as any[]).length === 0) {
        throw new Error('not_permitted');
      }
    },
    onSuccess: () => {
      toast({ title: t('kitchenProduction.deleted') });
      setDeleteRow(null);
      qc.invalidateQueries({ queryKey: ['kitchen-production-logs'] });
    },
    onError: (e: any) => {
      console.error('[KitchenProduction] delete failed', e);
      toast({
        title: t('kitchenProduction.deleteFailed'),
        description: e?.message === 'not_permitted'
          ? t('kitchenProduction.deleteNotPermitted')
          : e?.message,
        variant: 'destructive',
      });
      setDeleteRow(null);
    },
  });

  const unitMissing = !!selectedItem && !selectedItemUnit;

  return (
    <AppShell>
      <PageHeader title={t('kitchenProduction.title')} description={t('kitchenProduction.subtitle')} />

      <Card className="mb-6">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-heading font-semibold uppercase tracking-wide text-muted-foreground">
            <ChefHat className="h-4 w-4" /> {t('kitchenProduction.addNew')}
          </div>

          {items.length === 0 && !itemsLoading && (
            <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <div>{t('kitchenProduction.errors.noItems')}</div>
              {isOwner && (
                <div className="mt-1 text-xs opacity-80">
                  {t('kitchenProduction.debug.enabledCount', { count: items.length })}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="prod-date">{t('kitchenProduction.fields.productionDate')} *</Label>
              <Input
                id="prod-date"
                type="date"
                className="h-12"
                value={productionDate}
                onChange={e => setProductionDate(e.target.value)}
              />
              {errors.date && <p className="mt-1 text-xs text-destructive">{errors.date}</p>}
            </div>

            <div>
              <Label>{t('kitchenProduction.fields.branch')} *</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-12"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branch && <p className="mt-1 text-xs text-destructive">{errors.branch}</p>}
            </div>

            <div>
              <Label>{t('kitchenProduction.fields.department')} *</Label>
              <Select value={department} onValueChange={v => setDepartment(v as Department)}>
                <SelectTrigger className="h-12"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.dept && <p className="mt-1 text-xs text-destructive">{errors.dept}</p>}
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <Label>{t('kitchenProduction.fields.item')} *</Label>
              <SearchableCombobox
                value={itemId}
                onChange={setItemId}
                options={itemOptions}
                placeholder={t('kitchenProduction.fields.itemPlaceholder')}
                searchPlaceholder={t('kitchenProduction.fields.itemPlaceholder')}
                emptyText={t('kitchenProduction.errors.noItems')}
              />
              {errors.item && <p className="mt-1 text-xs text-destructive">{errors.item}</p>}
            </div>

            {/* Auto-filled, read-only fields */}
            {selectedItem && (
              <div className="sm:col-span-2 lg:col-span-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border bg-muted/40 p-3">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('kitchenProduction.fields.itemCode')}</Label>
                  <Input readOnly value={selectedItem.code} className="h-10 font-mono bg-background/60" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('kitchenProduction.fields.itemName')}</Label>
                  <Input readOnly value={selectedItem.name_en} className="h-10 bg-background/60" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('kitchenProduction.fields.unit')}</Label>
                  <Input readOnly value={selectedItemUnit?.name_en ?? t('kitchenProduction.fields.unitMissing')} className="h-10 bg-background/60" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('kitchenProduction.fields.type')}</Label>
                  <Input readOnly value={selectedItem.code.startsWith('1013') ? t('kitchenProduction.types.MENU_ITEM') : t('kitchenProduction.types.BATCH_RECIPE')} className="h-10 bg-background/60" />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('kitchenProduction.fields.linkedRecipeCode')}</Label>
                  <Input readOnly value={selectedItem.code} className="h-10 font-mono bg-background/60" />
                </div>

                {unitMissing && (
                  <div className="sm:col-span-2 lg:col-span-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{t('kitchenProduction.warnings.unitMissing')}</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="qty">{t('kitchenProduction.fields.quantity')} *</Label>
              <Input
                id="qty"
                ref={qtyInputRef}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                className="h-12 text-lg"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 5, 10].map(n => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => addQty(n)}
                  >
                    <Plus className="h-3 w-3" /> {n}
                  </Button>
                ))}
              </div>
              {errors.qty && <p className="mt-1 text-xs text-destructive">{errors.qty}</p>}
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <Label htmlFor="notes">{t('kitchenProduction.fields.notes')}</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              size="lg"
              onClick={() => save.mutate()}
              disabled={save.isPending || items.length === 0}
            >
              <Save className="h-4 w-4" />
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-heading font-semibold uppercase tracking-wide text-muted-foreground">
              {t('kitchenProduction.list.title')}
            </h2>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('kitchenProduction.list.anyBranch')}</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('kitchenProduction.list.anyDept')}</SelectItem>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('kitchenProduction.list.anyType')}</SelectItem>
                <SelectItem value="MENU_ITEM">{t('kitchenProduction.types.MENU_ITEM')}</SelectItem>
                <SelectItem value="BATCH_RECIPE">{t('kitchenProduction.types.BATCH_RECIPE')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder={t('kitchenProduction.list.searchItem')}
            />
          </div>

          {filteredLogs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('kitchenProduction.list.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t('kitchenProduction.fields.productionDate')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.item')}</TableHead>
                    <TableHead className="text-right whitespace-nowrap">{t('kitchenProduction.fields.quantity')}</TableHead>
                    <TableHead>{t('kitchenProduction.list.context')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.notes')}</TableHead>
                    <TableHead className="w-24 text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap align-top text-sm">{l.production_date}</TableCell>
                      <TableCell className="align-top">
                        <div className="font-medium">{l.item_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{l.item_code}</div>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {t(`kitchenProduction.types.${l.item_type}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <div className="text-base font-semibold">{fmtQty(Number(l.quantity_produced))}</div>
                        <div className="text-xs text-muted-foreground">{l.unit ?? '—'}</div>
                      </TableCell>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        <div>{l.branch_id ? (branchMap[l.branch_id]?.name ?? '—') : '—'}</div>
                        <div>{l.department ?? '—'}</div>
                        <div className="mt-1 opacity-80">{l.staff_name ?? '—'}</div>
                      </TableCell>
                      <TableCell className="align-top max-w-[16rem] text-xs text-muted-foreground truncate" title={l.notes ?? ''}>
                        {l.notes ?? '—'}
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit(l) ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditRow(l);
                                setEditQty(String(l.quantity_produced));
                                setEditNotes(l.notes ?? '');
                              }}
                              title={t('common.edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span tabIndex={0}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-40" disabled>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t('kitchenProduction.editNotPermitted')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {canDelete(l) ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteRow(l)}
                              title={t('common.delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span tabIndex={0}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-40" disabled>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t('kitchenProduction.deleteNotPermitted')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('kitchenProduction.editTitle')}</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="font-medium">{editRow.item_name}</div>
                <div className="font-mono text-xs text-muted-foreground">{editRow.item_code}</div>
              </div>
              <div>
                <Label htmlFor="edit-qty">{t('kitchenProduction.fields.quantity')}</Label>
                <Input
                  id="edit-qty"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  className="h-11"
                  value={editQty}
                  onChange={e => setEditQty(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-notes">{t('kitchenProduction.fields.notes')}</Label>
                <Textarea id="edit-notes" rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => editRow && updateRow.mutate(editRow)}
              disabled={updateRow.isPending || !editRow}
            >
              {updateRow.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('kitchenProduction.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('kitchenProduction.deleteConfirm', {
                name: deleteRow?.item_name ?? '',
                qty: deleteRow ? fmtQty(Number(deleteRow.quantity_produced)) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteRow) deleteMut.mutate(deleteRow);
              }}
              disabled={deleteMut.isPending}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
