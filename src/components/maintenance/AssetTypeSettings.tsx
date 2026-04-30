import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Loader2, Power, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useMaintenanceAssetTypesAll,
  useUpsertMaintenanceAssetType,
  useToggleMaintenanceAssetType,
  useMaintenanceAssetTypeUsage,
  type MaintenanceAssetType,
} from '@/hooks/useMaintenance';

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'type';
}

export default function AssetTypeSettings({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const { data: types = [], isLoading } = useMaintenanceAssetTypesAll();
  const { data: usage } = useMaintenanceAssetTypeUsage();
  const upsert = useUpsertMaintenanceAssetType();
  const toggle = useToggleMaintenanceAssetType();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceAssetType | null>(null);
  const [name, setName] = useState('');
  const [nameVi, setNameVi] = useState('');

  const sorted = useMemo(
    () => [...types].sort((a, b) => (a.sort_order - b.sort_order) || a.name_en.localeCompare(b.name_en)),
    [types],
  );

  const openNew = () => {
    setEditing(null); setName(''); setNameVi(''); setOpen(true);
  };
  const openEdit = (row: MaintenanceAssetType) => {
    setEditing(row); setName(row.name_en); setNameVi(row.name_vi ?? ''); setOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error(t('maintenance.settings.types.errors.nameRequired')); return; }
    try {
      if (editing) {
        await upsert.mutateAsync({
          id: editing.id,
          code: editing.code,
          name_en: trimmed,
          name_vi: nameVi.trim() || null,
        });
        toast.success(t('maintenance.settings.types.toasts.updated'));
      } else {
        const baseCode = slugify(trimmed);
        const existing = new Set(types.map(x => x.code));
        let code = baseCode; let i = 2;
        while (existing.has(code)) { code = `${baseCode}_${i++}`; }
        const maxOrder = types.reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
        await upsert.mutateAsync({
          code,
          name_en: trimmed,
          name_vi: nameVi.trim() || null,
          sort_order: maxOrder + 10,
          is_active: true,
        });
        toast.success(t('maintenance.settings.types.toasts.created'));
      }
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const handleToggle = async (row: MaintenanceAssetType) => {
    try {
      await toggle.mutateAsync({ id: row.id, is_active: !row.is_active });
      toast.success(row.is_active
        ? t('maintenance.settings.types.toasts.deactivated')
        : t('maintenance.settings.types.toasts.activated'));
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('maintenance.settings.types.description')}</p>
        {canManage && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />{t('maintenance.settings.types.addNew')}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('maintenance.settings.types.cols.name')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('maintenance.settings.types.cols.usage')}</TableHead>
                  <TableHead>{t('maintenance.settings.types.cols.status')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('maintenance.settings.types.cols.createdAt')}</TableHead>
                  {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(row => {
                  const used = usage?.get(row.id) ?? 0;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.name_en}</div>
                        {row.name_vi && <div className="text-xs text-muted-foreground">{row.name_vi}</div>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {used > 0
                          ? t('maintenance.settings.types.usedBy', { count: used })
                          : t('maintenance.settings.types.notUsed')}
                      </TableCell>
                      <TableCell>
                        {row.is_active
                          ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">{t('maintenance.settings.types.status.active')}</Badge>
                          : <Badge variant="outline" className="bg-muted text-muted-foreground border-border">{t('maintenance.settings.types.status.inactive')}</Badge>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {fmtDate(row.created_at)}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleToggle(row)}
                              title={row.is_active
                                ? t('maintenance.settings.types.actions.deactivate')
                                : t('maintenance.settings.types.actions.activate')}>
                              {row.is_active
                                ? <PowerOff className="h-3.5 w-3.5 text-amber-600" />
                                : <Power className="h-3.5 w-3.5 text-emerald-600" />}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 5 : 4} className="text-center text-muted-foreground py-8">
                      {t('maintenance.settings.types.empty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t('maintenance.settings.types.deleteHint')}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('maintenance.settings.types.editTitle') : t('maintenance.settings.types.newTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('maintenance.settings.types.fields.name')} *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Machine" />
            </div>
            <div>
              <Label>{t('maintenance.settings.types.fields.nameVi')}</Label>
              <Input value={nameVi} onChange={e => setNameVi(e.target.value)} placeholder="Máy móc" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}