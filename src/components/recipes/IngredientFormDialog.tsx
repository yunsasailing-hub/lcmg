import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import {
  useRecipeCategories, useRecipeUnits, useStorehouses, useUpsertIngredient,
  useIngredientTypes, isIngredientCodeTaken, mapNameToLegacyEnum,
  CURRENCIES,
  type Ingredient, type CurrencyCode,
} from '@/hooks/useIngredients';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient?: Ingredient | null;
}

const emptyForm = {
  code: '',
  name_en: '',
  name_vi: '',
  is_active: true,
  ingredient_type_id: '',
  category_id: '',
  base_unit_id: '',
  storehouse_id: '',
  price: '',
  currency: 'VND' as CurrencyCode,
  notes: '',
  purchase_unit_id: '',
  purchase_to_base_factor: '1',
  last_purchase_price: '',
  supplier: '',
  yield_percent: '100',
  tax_rate: '0',
  allergens: '',
};

const sectionTitle = 'mb-3 text-sm font-semibold text-foreground/80 uppercase tracking-wide';

export default function IngredientFormDialog({ open, onOpenChange, ingredient }: Props) {
  const { t } = useTranslation();
  const { user, hasAnyRole } = useAuth();
  const canSeeAdvanced = hasAnyRole(['owner', 'manager']);
  const archivedLabel = t('common.archived');

  const { data: types = [] } = useIngredientTypes(true);
  const { data: categories = [] } = useRecipeCategories(true);
  const { data: units = [] } = useRecipeUnits(true);
  const { data: storehouses = [] } = useStorehouses(true);
  const upsert = useUpsertIngredient();

  const [form, setForm] = useState(emptyForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (ingredient) {
      setForm({
        code: ingredient.code ?? '',
        name_en: ingredient.name_en ?? '',
        name_vi: ingredient.name_vi ?? '',
        is_active: ingredient.is_active,
        ingredient_type_id: ingredient.ingredient_type_id ?? '',
        category_id: ingredient.category_id ?? '',
        base_unit_id: ingredient.base_unit_id ?? '',
        storehouse_id: ingredient.storehouse_id ?? '',
        price: ingredient.price != null ? String(ingredient.price) : '',
        currency: ingredient.currency,
        notes: ingredient.notes ?? '',
        purchase_unit_id: ingredient.purchase_unit_id ?? '',
        purchase_to_base_factor: String(ingredient.purchase_to_base_factor ?? '1'),
        last_purchase_price: ingredient.last_purchase_price != null ? String(ingredient.last_purchase_price) : '',
        supplier: ingredient.supplier ?? '',
        yield_percent: String(ingredient.yield_percent ?? '100'),
        tax_rate: String(ingredient.tax_rate ?? '0'),
        allergens: (ingredient.allergens ?? []).join(', '),
      });
    } else {
      setForm(emptyForm);
    }

    setAdvancedOpen(false);
  }, [open, ingredient]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildManagedOptions = <T extends { id: string; is_active: boolean }>(
    items: T[],
    selectedId: string,
    getLabel: (item: T) => string,
    getSublabel?: (item: T) => string | undefined,
  ) => {
    const activeOptions = items
      .filter((item) => item.is_active)
      .map((item) => ({ id: item.id, label: getLabel(item), sublabel: getSublabel?.(item) }));

    if (!selectedId) return activeOptions;

    const selectedItem = items.find((item) => item.id === selectedId);
    if (!selectedItem || selectedItem.is_active || activeOptions.some((option) => option.id === selectedId)) {
      return activeOptions;
    }

    return [{
      id: selectedItem.id,
      label: getLabel(selectedItem),
      sublabel: getSublabel?.(selectedItem)
        ? `${getSublabel(selectedItem)} · ${archivedLabel}`
        : archivedLabel,
    }, ...activeOptions];
  };

  const typeOptions = useMemo(
    () => buildManagedOptions(types, form.ingredient_type_id, (item) => item.name_en, (item) => item.name_vi ?? undefined),
    [types, form.ingredient_type_id, archivedLabel],
  );

  const categoryOptions = useMemo(
    () => buildManagedOptions(categories, form.category_id, (item) => item.name_en, (item) => item.name_vi ?? undefined),
    [categories, form.category_id, archivedLabel],
  );

  const unitOptions = useMemo(
    () => buildManagedOptions(units, form.base_unit_id, (item) => `${item.code} — ${item.name_en}`, (item) => item.name_vi ?? undefined),
    [units, form.base_unit_id, archivedLabel],
  );

  const purchaseUnitOptions = useMemo(
    () => buildManagedOptions(units, form.purchase_unit_id, (item) => `${item.code} — ${item.name_en}`, (item) => item.name_vi ?? undefined),
    [units, form.purchase_unit_id, archivedLabel],
  );

  const storehouseOptions = useMemo(
    () => buildManagedOptions(storehouses, form.storehouse_id, (item) => item.name),
    [storehouses, form.storehouse_id, archivedLabel],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = form.code.trim();
    const nameEn = form.name_en.trim();

    if (!code) {
      toast({ title: t('common.error'), description: t('recipes.ingredients.errors.idRequired'), variant: 'destructive' });
      return;
    }
    if (!nameEn) {
      toast({ title: t('common.error'), description: t('recipes.ingredients.errors.nameRequired'), variant: 'destructive' });
      return;
    }
    if (!form.ingredient_type_id) {
      toast({ title: t('common.error'), description: t('recipes.ingredients.errors.typeRequired'), variant: 'destructive' });
      return;
    }
    if (!form.category_id) {
      toast({ title: t('common.error'), description: t('recipes.ingredients.errors.categoryRequired'), variant: 'destructive' });
      return;
    }
    if (!form.base_unit_id) {
      toast({ title: t('common.error'), description: t('recipes.ingredients.errors.unitRequired'), variant: 'destructive' });
      return;
    }

    try {
      const taken = await isIngredientCodeTaken(code, ingredient?.id);
      if (taken) {
        toast({ title: t('common.error'), description: t('recipes.ingredients.errors.idDuplicate'), variant: 'destructive' });
        return;
      }

      const selectedType = types.find((item) => item.id === form.ingredient_type_id);
      const legacyEnum = selectedType ? mapNameToLegacyEnum(selectedType.name_en) : 'other';

      const payload = {
        ...(ingredient?.id ? { id: ingredient.id } : {}),
        code,
        name_en: nameEn,
        name_vi: form.name_vi.trim() || null,
        is_active: form.is_active,
        ingredient_type: legacyEnum,
        ingredient_type_id: form.ingredient_type_id,
        category_id: form.category_id,
        base_unit_id: form.base_unit_id,
        storehouse_id: form.storehouse_id || null,
        price: form.price ? Number(form.price) : null,
        currency: form.currency,
        notes: form.notes.trim() || null,
        purchase_unit_id: form.purchase_unit_id || null,
        purchase_to_base_factor: Number(form.purchase_to_base_factor) || 1,
        last_purchase_price: form.last_purchase_price ? Number(form.last_purchase_price) : null,
        supplier: form.supplier.trim() || null,
        yield_percent: Number(form.yield_percent) || 100,
        tax_rate: Number(form.tax_rate) || 0,
        allergens: form.allergens
          ? form.allergens.split(',').map((item) => item.trim()).filter(Boolean)
          : null,
        ...(ingredient ? {} : { created_by: user?.id ?? null }),
      };

      await upsert.mutateAsync(payload as any);
      toast({ title: ingredient ? t('recipes.ingredients.updated') : t('recipes.ingredients.created') });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('recipes.ingredients.saveFailed');
      toast({ title: t('common.error'), description: message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ingredient ? t('recipes.ingredients.edit') : t('recipes.ingredients.add')}
          </DialogTitle>
          <DialogDescription>{t('recipes.ingredients.subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pb-24 sm:pb-0">
          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.master')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>{t('recipes.ingredients.fields.id')} *</Label>
                <Input value={form.code} onChange={(e) => set('code', e.target.value)} required placeholder="e.g. ING-0001" />
              </div>
              <div>
                <Label>{t('recipes.ingredients.fields.nameEn')} *</Label>
                <Input value={form.name_en} onChange={(e) => set('name_en', e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('recipes.ingredients.fields.nameVi')}</Label>
                <Input value={form.name_vi} onChange={(e) => set('name_vi', e.target.value)} />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch id="active" checked={form.is_active} onCheckedChange={(checked) => set('is_active', checked)} />
                <Label htmlFor="active" className="cursor-pointer">
                  {t('recipes.ingredients.fields.activeStatus')}: {form.is_active ? t('common.yes') : t('recipes.ingredients.statusNot')}
                </Label>
              </div>
            </div>
          </section>

          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.classification')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>{t('recipes.ingredients.fields.type')} *</Label>
                <SearchableCombobox
                  value={form.ingredient_type_id}
                  onChange={(value) => set('ingredient_type_id', value)}
                  options={typeOptions}
                  placeholder={t('common.selectPlaceholder')}
                  searchPlaceholder={t('common.searchPlaceholder')}
                  emptyText={t('common.noResults')}
                />
              </div>
              <div>
                <Label>{t('recipes.ingredients.fields.category')} *</Label>
                <SearchableCombobox
                  value={form.category_id}
                  onChange={(value) => set('category_id', value)}
                  options={categoryOptions}
                  placeholder={t('common.selectPlaceholder')}
                  searchPlaceholder={t('common.searchPlaceholder')}
                  emptyText={t('common.noResults')}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('recipes.ingredients.fields.baseUnit')} *</Label>
                <SearchableCombobox
                  value={form.base_unit_id}
                  onChange={(value) => set('base_unit_id', value)}
                  options={unitOptions}
                  placeholder={t('common.selectPlaceholder')}
                  searchPlaceholder={t('common.searchPlaceholder')}
                  emptyText={t('common.noResults')}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.storage')}</h3>
            <div>
              <Label>{t('recipes.ingredients.fields.storehouse')}</Label>
              <SearchableCombobox
                value={form.storehouse_id}
                onChange={(value) => set('storehouse_id', value)}
                options={storehouseOptions}
                placeholder={t('common.selectPlaceholder')}
                searchPlaceholder={t('common.searchPlaceholder')}
                emptyText={t('common.noResults')}
                noneLabel={t('common.none')}
                allowNone
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('recipes.ingredients.fields.storehouseHelp', { defaultValue: 'Choose a managed storehouse for storage and stock mapping.' })}
              </p>
            </div>
          </section>

          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.pricing')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>{t('recipes.ingredients.fields.price')}</Label>
                <Input type="number" inputMode="decimal" step="0.01" min="0" value={form.price} onChange={(e) => set('price', e.target.value)} />
              </div>
              <div>
                <Label>{t('recipes.ingredients.fields.currency')}</Label>
                <Select value={form.currency} onValueChange={(value) => set('currency', value as CurrencyCode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.notes')}</h3>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder={t('recipes.ingredients.fields.notes')} />
          </section>

          {canSeeAdvanced && (
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-full justify-between">
                  {t('recipes.ingredients.sections.advanced')}
                  <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>{t('recipes.ingredients.fields.yield')}</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={form.yield_percent} onChange={(e) => set('yield_percent', e.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">{t('recipes.ingredients.fields.yieldHelp')}</p>
                  </div>
                  <div>
                    <Label>{t('recipes.ingredients.fields.tax')}</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={form.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t('recipes.ingredients.fields.allergens')}</Label>
                    <Input
                      value={form.allergens}
                      onChange={(e) => set('allergens', e.target.value)}
                      placeholder={t('recipes.ingredients.fields.allergensPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label>{t('recipes.ingredients.fields.supplier')}</Label>
                    <Input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('recipes.ingredients.fields.lastPrice')}</Label>
                    <Input type="number" step="0.01" min="0" value={form.last_purchase_price} onChange={(e) => set('last_purchase_price', e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('recipes.ingredients.fields.purchaseUnit')}</Label>
                    <SearchableCombobox
                      value={form.purchase_unit_id}
                      onChange={(value) => set('purchase_unit_id', value)}
                      options={purchaseUnitOptions}
                      placeholder={t('common.selectPlaceholder')}
                      searchPlaceholder={t('common.searchPlaceholder')}
                      emptyText={t('common.noResults')}
                      noneLabel={t('common.none')}
                      allowNone
                    />
                  </div>
                  <div>
                    <Label>{t('recipes.ingredients.fields.purchaseFactor')}</Label>
                    <Input type="number" step="0.0001" min="0" value={form.purchase_to_base_factor} onChange={(e) => set('purchase_to_base_factor', e.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">{t('recipes.ingredients.fields.purchaseFactorHelp')}</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <DialogFooter className="sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t sm:border-0 sm:bg-transparent sm:static sm:mx-0 sm:px-0 sm:py-0 z-10">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
