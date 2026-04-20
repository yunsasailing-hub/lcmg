import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import {
  useRecipeCategories, useRecipeUnits, useStorehouses, useUpsertIngredient,
  isIngredientCodeTaken, INGREDIENT_TYPES, CURRENCIES,
  type Ingredient, type IngredientType, type CurrencyCode,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { ChevronDown, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type StorageType = 'dry' | 'chilled' | 'frozen' | 'ambient';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient?: Ingredient | null;
}

const emptyForm = {
  // Master Info
  code: '',
  name_en: '',
  name_vi: '',
  is_active: true,
  // Classification
  ingredient_type: 'ingredient' as IngredientType,
  category_id: '',
  base_unit_id: '',
  // Storage
  storehouse_id: '',
  storage_type: 'dry' as StorageType,
  // Pricing
  price: '',
  currency: 'VND' as CurrencyCode,
  // Notes
  notes: '',
  // Advanced
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
  const { data: categories = [] } = useRecipeCategories();
  const { data: units = [] } = useRecipeUnits();
  const { data: storehouses = [] } = useStorehouses();
  const upsert = useUpsertIngredient();
  const [form, setForm] = useState(emptyForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (open) {
      if (ingredient) {
        setForm({
          code: ingredient.code ?? '',
          name_en: ingredient.name_en ?? '',
          name_vi: ingredient.name_vi ?? '',
          is_active: ingredient.is_active,
          ingredient_type: ingredient.ingredient_type,
          category_id: ingredient.category_id ?? '',
          base_unit_id: ingredient.base_unit_id ?? '',
          storehouse_id: ingredient.storehouse_id ?? '',
          storage_type: (ingredient.storage_type ?? 'dry') as StorageType,
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
    }
  }, [open, ingredient]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

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
    if (!form.ingredient_type) {
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

      const payload = {
        ...(ingredient?.id ? { id: ingredient.id } : {}),
        code,
        name_en: nameEn,
        name_vi: form.name_vi.trim() || null,
        is_active: form.is_active,
        ingredient_type: form.ingredient_type,
        category_id: form.category_id,
        base_unit_id: form.base_unit_id,
        storehouse_id: form.storehouse_id || null,
        storage_type: form.storage_type,
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
          ? form.allergens.split(',').map(s => s.trim()).filter(Boolean)
          : null,
        ...(ingredient ? {} : { created_by: user?.id ?? null }),
      };
      await upsert.mutateAsync(payload);
      toast({ title: ingredient ? t('recipes.ingredients.updated') : t('recipes.ingredients.created') });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('recipes.ingredients.saveFailed');
      toast({ title: t('common.error'), description: msg, variant: 'destructive' });
    }
  };

  

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ingredient ? t('recipes.ingredients.edit') : t('recipes.ingredients.add')}
          </DialogTitle>
          <DialogDescription>{t('recipes.ingredients.subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pb-24 sm:pb-0">

          {/* Master Info */}
          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.master')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('recipes.ingredients.fields.id')} *</Label>
                <Input value={form.code} onChange={e => set('code', e.target.value)} required
                  placeholder="e.g. ING-0001" />
              </div>
              <div>
                <Label>{t('recipes.ingredients.fields.nameEn')} *</Label>
                <Input value={form.name_en} onChange={e => set('name_en', e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('recipes.ingredients.fields.nameVi')}</Label>
                <Input value={form.name_vi} onChange={e => set('name_vi', e.target.value)} />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch id="active" checked={form.is_active}
                  onCheckedChange={v => set('is_active', v)} />
                <Label htmlFor="active" className="cursor-pointer">
                  {t('recipes.ingredients.fields.activeStatus')}: {form.is_active ? t('common.yes') : t('common.no')}
                </Label>
              </div>
            </div>
          </section>

          {/* Classification */}
          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.classification')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('recipes.ingredients.fields.type')} *</Label>
                <Select value={form.ingredient_type} onValueChange={v => set('ingredient_type', v as IngredientType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INGREDIENT_TYPES.map(it => (
                      <SelectItem key={it} value={it}>{t(`recipes.ingredients.typeLabel.${it}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('recipes.ingredients.fields.category')} *</Label>
                <Select value={form.category_id} onValueChange={v => set('category_id', v)}>
                  <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t('recipes.ingredients.fields.baseUnit')} *</Label>
                <Select value={form.base_unit_id} onValueChange={v => set('base_unit_id', v)}>
                  <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {units.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.code} — {u.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Storage */}
          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.storage')}</h3>
            <div>
              <Label>{t('recipes.ingredients.fields.storehouse')}</Label>
              <StorehouseCombobox
                value={form.storehouse_id}
                onChange={v => set('storehouse_id', v)}
                options={storehouses.map(s => ({ id: s.id, name: s.name }))}
                placeholder={t('common.selectPlaceholder')}
                searchPlaceholder={t('common.search')}
                emptyText={t('common.noResults')}
                noneLabel={t('common.none')}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('recipes.ingredients.fields.storehouseHelp')}
              </p>
            </div>
          </section>

          {/* Pricing */}
          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.pricing')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('recipes.ingredients.fields.price')}</Label>
                <Input type="number" inputMode="decimal" step="0.01" min="0"
                  value={form.price} onChange={e => set('price', e.target.value)} />
              </div>
              <div>
                <Label>{t('recipes.ingredients.fields.currency')}</Label>
                <Select value={form.currency} onValueChange={v => set('currency', v as CurrencyCode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section>
            <h3 className={sectionTitle}>{t('recipes.ingredients.sections.notes')}</h3>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              placeholder={t('recipes.ingredients.fields.notes')} />
          </section>

          {/* Advanced — only Owner/Manager */}
          {canSeeAdvanced && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="w-full justify-between">
                {t('recipes.ingredients.sections.advanced')}
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t('recipes.ingredients.fields.purchaseUnit')}</Label>
                  <Select value={form.purchase_unit_id || 'none'}
                    onValueChange={v => set('purchase_unit_id', v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('common.none')}</SelectItem>
                      {units.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.code} — {u.name_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('recipes.ingredients.fields.purchaseFactor')}</Label>
                  <Input type="number" step="0.0001" min="0" value={form.purchase_to_base_factor}
                    onChange={e => set('purchase_to_base_factor', e.target.value)} />
                  <p className="mt-1 text-xs text-muted-foreground">{t('recipes.ingredients.fields.purchaseFactorHelp')}</p>
                </div>
                <div>
                  <Label>{t('recipes.ingredients.fields.lastPrice')}</Label>
                  <Input type="number" step="0.01" min="0" value={form.last_purchase_price}
                    onChange={e => set('last_purchase_price', e.target.value)} />
                </div>
                <div>
                  <Label>{t('recipes.ingredients.fields.supplier')}</Label>
                  <Input value={form.supplier} onChange={e => set('supplier', e.target.value)} />
                </div>
                <div>
                  <Label>{t('recipes.ingredients.fields.yield')}</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={form.yield_percent}
                    onChange={e => set('yield_percent', e.target.value)} />
                  <p className="mt-1 text-xs text-muted-foreground">{t('recipes.ingredients.fields.yieldHelp')}</p>
                </div>
                <div>
                  <Label>{t('recipes.ingredients.fields.tax')}</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={form.tax_rate}
                    onChange={e => set('tax_rate', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t('recipes.ingredients.fields.allergens')}</Label>
                  <Input value={form.allergens} onChange={e => set('allergens', e.target.value)}
                    placeholder={t('recipes.ingredients.fields.allergensPlaceholder')} />
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

interface StorehouseComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  noneLabel: string;
}

function StorehouseCombobox({
  value, onChange, options, placeholder, searchPlaceholder, emptyText, noneLabel,
}: StorehouseComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
          )}
        >
          {selected ? selected.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => { onChange(''); setOpen(false); }}
              >
                <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                {noneLabel}
              </CommandItem>
              {options.map(o => (
                <CommandItem
                  key={o.id}
                  value={o.name}
                  onSelect={() => { onChange(o.id); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  {o.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
