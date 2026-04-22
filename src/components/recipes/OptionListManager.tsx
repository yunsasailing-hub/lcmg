import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Archive, ArchiveRestore, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useUpsertOption, useArchiveOption, useReorderOption } from '@/hooks/useIngredients';
import { toast } from '@/hooks/use-toast';

export type FieldDef =
  | { key: string; label: string; type: 'text'; required?: boolean; placeholder?: string }
  | { key: string; label: string; type: 'select'; required?: boolean; options: { value: string; label: string }[] };

interface Row {
  id: string;
  is_active: boolean;
  sort_order: number;
  [k: string]: any;
}

interface Props {
  table:
    | 'ingredient_types'
    | 'ingredient_categories'
    | 'recipe_types'
    | 'recipe_categories'
    | 'recipe_units'
    | 'storehouses';
  rows: Row[];
  isLoading: boolean;
  fields: FieldDef[];
  primaryLabel: (row: Row) => string;
  secondaryLabel?: (row: Row) => string | null;
  emptyTitle: string;
  addLabel: string;
  canManage: boolean;
}

const normalizeValue = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export default function OptionListManager({
  table, rows, isLoading, fields, primaryLabel, secondaryLabel,
  emptyTitle, addLabel, canManage,
}: Props) {
  const { t } = useTranslation();
  const upsert = useUpsertOption(table);
  const archive = useArchiveOption(table);
  const reorder = useReorderOption(table);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const query = normalizeValue(search);
    if (!query) return sortedRows;

    return sortedRows.filter((row) => {
      const haystack = [primaryLabel(row), secondaryLabel?.(row) ?? '']
        .join(' ')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [search, sortedRows, primaryLabel, secondaryLabel]);

  const openAdd = () => {
    const initial: Record<string, any> = {
      is_active: true,
      sort_order: (sortedRows[sortedRows.length - 1]?.sort_order ?? 0) + 10,
    };
    fields.forEach((field) => {
      initial[field.key] = field.type === 'select' ? field.options[0]?.value ?? '' : '';
    });
    setForm(initial);
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    const nextForm: Record<string, any> = { is_active: row.is_active, sort_order: row.sort_order };
    fields.forEach((field) => {
      nextForm[field.key] = row[field.key] ?? '';
    });
    setForm(nextForm);
    setEditing(row);
    setOpen(true);
  };

  const handleSave = async () => {
    for (const field of fields) {
      if (field.required && !String(form[field.key] ?? '').trim()) {
        toast({
          title: t('common.error'),
          description: `${field.label} ${t('common.required').toLowerCase()}`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const payload: Record<string, any> = { ...form };
      if (editing) payload.id = editing.id;

      for (const field of fields) {
        if (field.type === 'text' && typeof payload[field.key] === 'string') {
          payload[field.key] = payload[field.key].trim() || null;
        }
      }

      payload.sort_order = Number(payload.sort_order) || 0;

      const primaryNew = normalizeValue(String(primaryLabel({ ...(editing ?? {} as Row), ...payload })));
      if (primaryNew) {
        const duplicate = rows.find(
          (row) => row.id !== editing?.id && normalizeValue(primaryLabel(row)) === primaryNew,
        );
        if (duplicate) {
          toast({
            title: t('common.error'),
            description: `Duplicate value: "${primaryLabel(duplicate)}"`,
            variant: 'destructive',
          });
          return;
        }
      }

      await upsert.mutateAsync(payload);
      toast({ title: editing ? `${t('common.update')} ✓` : `${t('common.create')} ✓` });
      setOpen(false);
    } catch (err) {
      toast({ title: t('common.error'), description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleArchiveToggle = async () => {
    if (!archiveTarget) return;
    try {
      await archive.mutateAsync({ id: archiveTarget.id, is_active: !archiveTarget.is_active });
      toast({ title: archiveTarget.is_active ? t('common.archived') : t('common.restored') });
    } catch (err) {
      toast({ title: t('common.error'), description: (err as Error).message, variant: 'destructive' });
    }
    setArchiveTarget(null);
  };

  const move = async (row: Row, direction: -1 | 1) => {
    const idx = sortedRows.findIndex(r => r.id === row.id);
    const target = sortedRows[idx + direction];
    if (!target) return;
    try {
      await reorder.mutateAsync({ id: row.id, sort_order: target.sort_order });
      await reorder.mutateAsync({ id: target.id, sort_order: row.sort_order });
    } catch (err) {
      toast({ title: t('common.error'), description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} {t('common.total')}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.searchPlaceholder')}
              className="pl-9"
            />
          </div>
          {canManage && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" /> {addLabel}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyTitle}</p>
      ) : filteredRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('recipes.ingredients.fields.activeStatus')}</TableHead>
                <TableHead className="text-right">{t('recipes.ingredients.cols.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row, idx) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">{row.sort_order}</TableCell>
                  <TableCell>
                    <div className="font-medium">{primaryLabel(row)}</div>
                    {secondaryLabel?.(row) && (
                      <div className="text-xs text-muted-foreground">{secondaryLabel(row)}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? 'default' : 'secondary'}>
                      {row.is_active ? 'YES' : 'NOT'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canManage && (
                        <>
                          <Button size="icon" variant="ghost" disabled={idx === 0 || filteredRows[idx - 1]?.id !== sortedRows[sortedRows.findIndex((r) => r.id === row.id) - 1]?.id} onClick={() => move(row, -1)}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled={idx === filteredRows.length - 1 || filteredRows[idx + 1]?.id !== sortedRows[sortedRows.findIndex((r) => r.id === row.id) + 1]?.id} onClick={() => move(row, 1)}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setArchiveTarget(row)}>
                            {row.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('common.edit') : addLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.key}>
                <Label>{field.label}{field.required ? ' *' : ''}</Label>
                {field.type === 'text' ? (
                  <Input
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <Select
                    value={form[field.key] ?? ''}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
            <div>
              <Label>{t('recipes.settings.sortOrder')}</Label>
              <Input
                type="number"
                value={form.sort_order ?? 0}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active ?? true}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
              />
              <Label className="cursor-pointer">
                {t('recipes.ingredients.fields.activeStatus')}: {form.is_active ? 'YES' : 'NOT'}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiveTarget} onOpenChange={o => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.is_active ? t('recipes.settings.archiveConfirmTitle') : t('recipes.settings.restoreConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.is_active ? t('recipes.settings.archiveConfirmDesc') : t('recipes.settings.restoreConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveToggle}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
