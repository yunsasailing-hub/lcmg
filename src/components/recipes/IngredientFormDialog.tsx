import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import {
  useRecipeCategories, useRecipeUnits, useUpsertIngredient,
  type Ingredient,
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
import { toast } from '@/hooks/use-toast';

type StorageType = 'dry' | 'chilled' | 'frozen' | 'ambient';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient?: Ingredient | null;
}

const emptyForm = {
  name_en: '',
  name_vi: '',
  code: '',
  category_id: '',
  base_unit_id: '',
  purchase_unit_id: '',
  purchase_to_base_factor: '1',
  last_purchase_price: '',
  supplier: '',
  storage_type: 'dry' as StorageType,
  yield_percent: '100',
  tax_rate: '0',
  allergens: '',
  notes: '',
};

export default function IngredientFormDialog({ open, onOpenChange, ingredient }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: categories = [] } = useRecipeCategories();
  const { data: units = [] } = useRecipeUnits();
  const upsert = useUpsertIngredient();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      if (ingredient) {
        setForm({
          name_en: ingredient.name_en ?? '',
          name_vi: ingredient.name_vi ?? '',
          code: ingredient.code ?? '',
          category_id: ingredient.category_id ?? '',
          base_unit_id: ingredient.base_unit_id ?? '',
          purchase_unit_id: ingredient.purchase_unit_id ?? '',
          purchase_to_base_factor: String(ingredient.purchase_to_base_factor ?? '1'),
          last_purchase_price: ingredient.last_purchase_price != null ? String(ingredient.last_purchase_price) : '',
          supplier: ingredient.supplier ?? '',
          storage_type: (ingredient.storage_type ?? 'dry') as StorageType,
          yield_percent: String(ingredient.yield_percent ?? '100'),
          tax_rate: String(ingredient.tax_rate ?? '0'),
          allergens: (ingredient.allergens ?? []).join(', '),
          notes: ingredient.notes ?? '',
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, ingredient]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name_en.trim()) {
      toast({ title: t('common.error'), description: t('validation.required'), variant: 'destructive' });
      return;
    }
    if (!form.base_unit_id) {
      toast({ title: t('common.error'), description: t('recipes.ingredients.fields.baseUnit'), variant: 'destructive' });
      return;
    }
    try {
      const payload = {
        ...(ingredient?.id ? { id: ingredient.id } : {}),
        name_en: form.name_en.trim(),
        name_vi: form.name_vi.trim() || null,
        code: form.code.trim() || null,
        category_id: form.category_id || null,
        base_unit_id: form.base_unit_id,
        purchase_unit_id: form.purchase_unit_id || null,
        purchase_to_base_factor: Number(form.purchase_to_base_factor) || 1,
        last_purchase_price: form.last_purchase_price ? Number(form.last_purchase_price) : null,
        supplier: form.supplier.trim() || null,
        storage_type: form.storage_type,
        yield_percent: Number(form.yield_percent) || 100,
        tax_rate: Number(form.tax_rate) || 0,
        allergens: form.allergens
          ? form.allergens.split(',').map(s => s.trim()).filter(Boolean)
          : null,
        notes: form.notes.trim() || null,
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

  const storageOpts: StorageType[] = ['dry', 'chilled', 'frozen', 'ambient'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ingredient ? t('recipes.ingredients.edit') : t('recipes.ingredients.add')}
          </DialogTitle>
          <DialogDescription>{t('recipes.ingredients.subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pb-20 sm:pb-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('recipes.ingredients.fields.nameEn')}</Label>
              <Input value={form.name_en} onChange={e => set('name_en', e.target.value)} required />
            </div>
            <div>
              <Label>{t('recipes.ingredients.fields.nameVi')}</Label>
              <Input value={form.name_vi} onChange={e => set('name_vi', e.target.value)} />
            </div>
            <div>
              <Label>{t('recipes.ingredients.fields.code')}</Label>
              <Input value={form.code} onChange={e => set('code', e.target.value)} />
            </div>
            <div>
              <Label>{t('recipes.ingredients.fields.category')}</Label>
              <Select value={form.category_id || 'none'} onValueChange={v => set('category_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.none')}</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('recipes.ingredients.fields.baseUnit')}</Label>
              <Select value={form.base_unit_id} onValueChange={v => set('base_unit_id', v)}>
                <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {units.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.code} — {u.name_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('recipes.ingredients.fields.purchaseUnit')}</Label>
              <Select value={form.purchase_unit_id || 'none'} onValueChange={v => set('purchase_unit_id', v === 'none' ? '' : v)}>
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
              <Label>{t('recipes.ingredients.fields.storage')}</Label>
              <Select value={form.storage_type} onValueChange={v => set('storage_type', v as StorageType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {storageOpts.map(s => (
                    <SelectItem key={s} value={s}>{t(`recipes.ingredients.storageType.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>
          <div>
            <Label>{t('recipes.ingredients.fields.allergens')}</Label>
            <Input value={form.allergens} onChange={e => set('allergens', e.target.value)}
              placeholder={t('recipes.ingredients.fields.allergensPlaceholder')} />
          </div>
          <div>
            <Label>{t('recipes.ingredients.fields.notes')}</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
          </div>

          <DialogFooter className="sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t sm:border-0 sm:bg-transparent sm:static sm:mx-0 sm:px-0 sm:py-0">
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
