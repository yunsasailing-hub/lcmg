import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Save } from 'lucide-react';
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
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { Badge } from '@/components/ui/badge';
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

export default function KitchenProduction() {
  const { t } = useTranslation();
  const { user, profile, hasAnyRole } = useAuth();
  const qc = useQueryClient();

  const isManager = hasAnyRole(['owner', 'manager']);
  const isOwner = hasAnyRole(['owner']);

  const { data: branches = [] } = useBranches();
  const { data: units = [] } = useRecipeUnits();
  const unitMap = useMemo(() => Object.fromEntries(units.map(u => [u.id, u])), [units]);

  // Items available for production
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['kitchen-production-items'],
    queryFn: async (): Promise<ProductionItem[]> => {
      const { data, error } = await (supabase
        .from('recipes') as any)
        .select('id, code, name_en, yield_unit_id, is_active, show_in_kitchen_production')
        .eq('is_active', true)
        .eq('show_in_kitchen_production', true)
        .or('code.ilike.1012%,code.ilike.1013%')
        .order('code', { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => ({
          id: r.id,
          code: r.code ?? '',
          name_en: r.name_en ?? '',
          yield_unit_id: r.yield_unit_id ?? null,
        }));
    },
  });

  // Filters
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterBranch, setFilterBranch] = useState<string>('__all__');
  const [filterDept, setFilterDept] = useState<string>('__all__');
  const [filterType, setFilterType] = useState<string>('__all__');
  const [filterText, setFilterText] = useState<string>('');

  // Logs list
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

  // Form
  const defaultDept: Department = (profile?.department as Department) ?? 'kitchen';
  const defaultBranch = profile?.branch_id ?? (branches[0]?.id ?? '');

  const [productionDate, setProductionDate] = useState<string>(todayISO());
  const [branchId, setBranchId] = useState<string>('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [itemId, setItemId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Hydrate defaults once branches/profile arrive
  useMemo(() => {
    if (!branchId && defaultBranch) setBranchId(defaultBranch);
    if (!department && defaultDept) setDepartment(defaultDept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultBranch, defaultDept]);

  const selectedItem = items.find(i => i.id === itemId);
  const selectedItemUnit = selectedItem?.yield_unit_id ? unitMap[selectedItem.yield_unit_id] : null;

  const itemOptions = useMemo(
    () => items.map(i => ({
      id: i.id,
      label: `${i.code} — ${i.name_en} — ${i.yield_unit_id && unitMap[i.yield_unit_id] ? unitMap[i.yield_unit_id].name_en : t('kitchenProduction.fields.unitMissing')}`,
    })),
    [items, unitMap, t],
  );

  const save = useMutation({
    mutationFn: async () => {
      const newErrors: Record<string, string> = {};
      if (!productionDate) newErrors.date = t('kitchenProduction.errors.dateRequired');
      if (!branchId) newErrors.branch = t('kitchenProduction.errors.branchRequired');
      if (!department) newErrors.dept = t('kitchenProduction.errors.deptRequired');
      if (!itemId || !selectedItem) newErrors.item = t('kitchenProduction.errors.itemRequired');
      const qty = Number(quantity);
      if (!quantity.trim() || !Number.isFinite(qty) || qty <= 0) {
        newErrors.qty = t('kitchenProduction.errors.qtyPositive');
      }
      if (selectedItem) {
        const c = selectedItem.code;
        if (!(c.startsWith('1012') || c.startsWith('1013'))) {
          newErrors.item = t('kitchenProduction.errors.invalidCode');
        }
      }
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) {
        throw new Error('validation');
      }
      if (!user) throw new Error('Not authenticated');

      const unitLabel = selectedItem?.yield_unit_id && unitMap[selectedItem.yield_unit_id]
        ? unitMap[selectedItem.yield_unit_id].name_en
        : null;

      const payload = {
        production_date: productionDate,
        branch_id: branchId || null,
        department,
        item_code: selectedItem!.code,
        item_name: selectedItem!.name_en,
        // item_type is auto-set by trigger; provide a placeholder that the trigger overrides
        item_type: selectedItem!.code.startsWith('1013') ? 'MENU_ITEM' : 'BATCH_RECIPE',
        linked_recipe_id: selectedItem!.id,
        linked_recipe_code: selectedItem!.code,
        quantity_produced: qty,
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
      setQuantity('');
      setNotes('');
      setItemId('');
      setErrors({});
      qc.invalidateQueries({ queryKey: ['kitchen-production-logs'] });
    },
    onError: (e: any) => {
      if (e?.message === 'validation') return;
      toast({ title: t('kitchenProduction.saveFailed'), description: e?.message, variant: 'destructive' });
    },
  });

  function qty(v: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(v);
  }

  const branchMap = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

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

            <div className="sm:col-span-2 lg:col-span-2">
              <Label>{t('kitchenProduction.fields.item')} *</Label>
              <SearchableCombobox
                value={itemId}
                onChange={setItemId}
                options={itemOptions}
                placeholder={t('kitchenProduction.fields.itemPlaceholder')}
                searchPlaceholder={t('kitchenProduction.fields.itemPlaceholder')}
                emptyText={t('kitchenProduction.errors.noItems')}
              />
              {selectedItem && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedItem.code.startsWith('1013') ? t('kitchenProduction.types.MENU_ITEM') : t('kitchenProduction.types.BATCH_RECIPE')}
                  <> · {t('kitchenProduction.fields.unit')}: {selectedItemUnit?.name_en ?? t('kitchenProduction.fields.unitMissing')}</>
                </p>
              )}
              {errors.item && <p className="mt-1 text-xs text-destructive">{errors.item}</p>}
            </div>

            <div>
              <Label htmlFor="qty">{t('kitchenProduction.fields.quantity')} *</Label>
              <Input
                id="qty"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                className="h-12 text-lg"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
              {errors.qty && <p className="mt-1 text-xs text-destructive">{errors.qty}</p>}
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
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
            <Input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              placeholder={t('kitchenProduction.fields.productionDate')}
            />
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
                    <TableHead>{t('kitchenProduction.fields.productionDate')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.branch')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.department')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.itemCode')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.itemName')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.type')}</TableHead>
                    <TableHead className="text-right">{t('kitchenProduction.fields.quantity')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.unit')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.staff')}</TableHead>
                    <TableHead>{t('kitchenProduction.fields.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">{l.production_date}</TableCell>
                      <TableCell className="whitespace-nowrap">{l.branch_id ? (branchMap[l.branch_id]?.name ?? '—') : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{l.department ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{l.item_code}</TableCell>
                      <TableCell>{l.item_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {t(`kitchenProduction.types.${l.item_type}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{qty(Number(l.quantity_produced))}</TableCell>
                      <TableCell>{l.unit ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{l.staff_name ?? '—'}</TableCell>
                      <TableCell className="max-w-[18rem] truncate" title={l.notes ?? ''}>{l.notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}