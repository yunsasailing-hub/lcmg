import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/layout/AppShell';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Wrench, Plus, Search, Pencil, Archive, ArchiveRestore, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import AssetTypeSettings from '@/components/maintenance/AssetTypeSettings';
import SchedulesList from '@/components/maintenance/SchedulesList';
import ScheduleFormDialog from '@/components/maintenance/ScheduleFormDialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  useMaintenanceAssets, useMaintenanceAssetTypes, useUpsertMaintenanceAsset,
  useArchiveMaintenanceAsset, useBranchesAll,
  type EnrichedMaintenanceAsset, type MaintenanceStatus,
} from '@/hooks/useMaintenance';
import type { Database } from '@/integrations/supabase/types';
import { uploadToAppFilesBucket, APP_FILES_BUCKET } from '@/lib/appFilesStorage';
import { optimizeChecklistImage } from '@/lib/imageCompression';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Trash2, Image as ImageIcon, ChevronDown, CalendarClock, History, ShieldAlert, FileImage } from 'lucide-react';
import { ChecklistPhotoPreview } from '@/components/checklists/ChecklistPhotoPreview';

type Department = Database['public']['Enums']['department'];
const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];
const STATUSES: MaintenanceStatus[] = ['active', 'inactive', 'archived'];

const STATUS_BADGE: Record<MaintenanceStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  inactive: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

/* -------------------------- Dashboard -------------------------- */
function MaintenanceDashboard({ assets }: { assets: EnrichedMaintenanceAsset[] }) {
  const { t } = useTranslation();
  const totalActive = assets.filter(a => a.status === 'active').length;
  const totalArchived = assets.filter(a => a.status === 'archived').length;
  const byBranch = new Map<string, number>();
  const byDept = new Map<string, number>();
  assets.filter(a => a.status !== 'archived').forEach(a => {
    const b = a.branch_name || t('common.unassigned');
    byBranch.set(b, (byBranch.get(b) ?? 0) + 1);
    byDept.set(a.department, (byDept.get(a.department) ?? 0) + 1);
  });
  const recent = [...assets].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  ).slice(0, 5);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('maintenance.dashboard.activeTotal')}</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-heading font-semibold">{totalActive}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('maintenance.dashboard.archivedTotal')}</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-heading font-semibold">{totalArchived}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('maintenance.dashboard.byBranch')}</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {byBranch.size === 0 ? <p className="text-muted-foreground">—</p> :
            [...byBranch.entries()].map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="truncate">{k}</span><span className="font-semibold">{v}</span></div>
            ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('maintenance.dashboard.byDepartment')}</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {byDept.size === 0 ? <p className="text-muted-foreground">—</p> :
            [...byDept.entries()].map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="font-semibold">{v}</span></div>
            ))}
        </CardContent>
      </Card>
      <Card className="sm:col-span-2 lg:col-span-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('maintenance.dashboard.recent')}</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ul className="divide-y">
              {recent.map(a => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.code} — {a.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.branch_name ?? '—'} · <span className="capitalize">{a.department}</span></div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------- Form Dialog -------------------------- */
function AssetFormDialog({
  open, onOpenChange, initial, canPickBranch,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: EnrichedMaintenanceAsset | null;
  canPickBranch: boolean;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { data: branches = [] } = useBranchesAll();
  const { data: types = [] } = useMaintenanceAssetTypes();
  const upsert = useUpsertMaintenanceAsset();

  const defaultBranch = canPickBranch ? '' : (profile?.branch_id ?? '');
  const [form, setForm] = useState(() => ({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    branch_id: initial?.branch_id ?? defaultBranch,
    department: (initial?.department ?? '') as Department | '',
    asset_type_id: initial?.asset_type_id ?? '',
    status: (initial?.status ?? 'active') as MaintenanceStatus,
    location: initial?.location ?? '',
    brand: initial?.brand ?? '',
    model: initial?.model ?? '',
    serial_number: initial?.serial_number ?? '',
    purchase_date: initial?.purchase_date ?? '',
    installation_date: initial?.installation_date ?? '',
    warranty_expiry_date: initial?.warranty_expiry_date ?? '',
    supplier_vendor: initial?.supplier_vendor ?? '',
    technician_contact: initial?.technician_contact ?? '',
    notes: initial?.notes ?? '',
    photo_url: initial?.photo_url ?? '',
    photo_storage_path: initial?.photo_storage_path ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const update = (k: string, v: any) => setForm(s => ({ ...s, [k]: v }));

  // ---------------------------------------------------------------
  // Maintenance photo upload — uses unified `app-files` bucket.
  // Path: maintenance/{branchCode}/{categoryCode}/
  // Filename: {uuid}_{clean-asset-name}.{ext} (asset name is in the
  // filename, NOT in the folder path).
  // ---------------------------------------------------------------
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!form.branch_id || !form.asset_type_id || !form.name.trim()) {
      toast.error(t('maintenance.errors.photoNeedsBranchTypeName',
        'Select branch, type and name before uploading photo'));
      return;
    }
    const branch = branches.find(b => b.id === form.branch_id);
    const type = types.find(tt => tt.id === form.asset_type_id);
    setUploading(true);
    try {
      // Compress images; non-image files (rare here) upload as-is.
      let toUpload: File = file;
      if (file.type.startsWith('image/')) {
        try {
          const optimized = await optimizeChecklistImage(file);
          toUpload = optimized.file;
        } catch {
          // fall back to original if compression fails
        }
      }
      // Asset/equipment name becomes the readable suffix in the filename.
      // Folder path is `maintenance/{branchCode}/{categoryCode}/`.
      const result = await uploadToAppFilesBucket(
        toUpload,
        'maintenance',
        {
          branchName: branch?.name,
          category: type?.code || type?.name_en || 'general',
        },
        form.name.trim(),
      );
      // Required testing log
      console.log('[maintenance.upload.fixed]', {
        bucket: result.bucket,
        path: result.path,
        publicUrl: result.publicUrl,
        branch: branch?.name,
        category: type?.code || type?.name_en,
        asset: form.name.trim(),
      });
      // Best-effort cleanup of any previously attached photo for this draft
      if (form.photo_storage_path) {
        await supabase.storage.from(APP_FILES_BUCKET)
          .remove([form.photo_storage_path]).catch(() => {});
      }
      setForm(s => ({ ...s, photo_url: result.publicUrl, photo_storage_path: result.path }));
      toast.success(t('maintenance.toasts.photoUploaded', 'Photo uploaded'));
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoRemove = async () => {
    if (form.photo_storage_path) {
      await supabase.storage.from(APP_FILES_BUCKET)
        .remove([form.photo_storage_path]).catch(() => {});
    }
    setForm(s => ({ ...s, photo_url: '', photo_storage_path: '' }));
  };

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = t('maintenance.errors.codeRequired');
    if (!form.name.trim()) errs.name = t('maintenance.errors.nameRequired');
    if (!form.branch_id) errs.branch_id = t('maintenance.errors.branchRequired');
    if (!form.department) errs.department = t('maintenance.errors.departmentRequired');
    if (!form.asset_type_id) errs.asset_type_id = t('maintenance.errors.typeRequired');
    if (!form.status) errs.status = t('maintenance.errors.statusRequired');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      const payload: any = {
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        purchase_date: form.purchase_date || null,
        installation_date: form.installation_date || null,
        warranty_expiry_date: form.warranty_expiry_date || null,
        location: form.location || null,
        brand: form.brand || null,
        model: form.model || null,
        serial_number: form.serial_number || null,
        supplier_vendor: form.supplier_vendor || null,
        technician_contact: form.technician_contact || null,
        notes: form.notes || null,
        photo_url: form.photo_url || null,
        photo_storage_path: form.photo_storage_path || null,
        archived_at: form.status === 'archived' ? (initial?.archived_at ?? new Date().toISOString()) : null,
      };
      if (initial?.id) payload.id = initial.id;
      else payload.created_by = profile?.user_id;
      await upsert.mutateAsync(payload);
      toast.success(initial ? t('maintenance.toasts.updated') : t('maintenance.toasts.created'));
      onOpenChange(false);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.toLowerCase().includes('duplicate') || msg.includes('maintenance_assets_code_key')) {
        toast.error(t('maintenance.errors.codeExists'));
        setErrors(s => ({ ...s, code: t('maintenance.errors.codeExists') }));
      } else {
        toast.error(msg || 'Save failed');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t('maintenance.form.editTitle') : t('maintenance.form.newTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>{t('maintenance.fields.code')} *</Label>
            <Input value={form.code} onChange={e => update('code', e.target.value)} placeholder="B26-BAR-CM-001" />
            <p className="text-xs text-muted-foreground mt-1">{t('maintenance.helpers.code')}</p>
            {errors.code && <p className="text-xs text-destructive mt-1">{errors.code}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label>{t('maintenance.fields.name')} *</Label>
            <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Coffee Machine 1" />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>
          <div>
            <Label>{t('maintenance.fields.branch')} *</Label>
            <Select value={form.branch_id} onValueChange={v => update('branch_id', v)} disabled={!canPickBranch}>
              <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.branch_id && <p className="text-xs text-destructive mt-1">{errors.branch_id}</p>}
          </div>
          <div>
            <Label>{t('maintenance.fields.department')} *</Label>
            <Select value={form.department} onValueChange={v => update('department', v)}>
              <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.department && <p className="text-xs text-destructive mt-1">{errors.department}</p>}
          </div>
          <div>
            <Label>{t('maintenance.fields.type')} *</Label>
            <Select value={form.asset_type_id} onValueChange={v => update('asset_type_id', v)}>
              <SelectTrigger><SelectValue placeholder={t('common.selectPlaceholder')} /></SelectTrigger>
              <SelectContent>
                {types.map(t2 => <SelectItem key={t2.id} value={t2.id}>{t2.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.asset_type_id && <p className="text-xs text-destructive mt-1">{errors.asset_type_id}</p>}
          </div>
          <div>
            <Label>{t('maintenance.fields.status')} *</Label>
            <Select value={form.status} onValueChange={v => update('status', v as MaintenanceStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{t(`maintenance.status.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t('maintenance.fields.location')}</Label>
            <Input value={form.location} onChange={e => update('location', e.target.value)} />
          </div>
          <div><Label>{t('maintenance.fields.brand')}</Label><Input value={form.brand} onChange={e => update('brand', e.target.value)} /></div>
          <div><Label>{t('maintenance.fields.model')}</Label><Input value={form.model} onChange={e => update('model', e.target.value)} /></div>
          <div><Label>{t('maintenance.fields.serialNumber')}</Label><Input value={form.serial_number} onChange={e => update('serial_number', e.target.value)} /></div>
          <div><Label>{t('maintenance.fields.supplier')}</Label><Input value={form.supplier_vendor} onChange={e => update('supplier_vendor', e.target.value)} /></div>
          <div><Label>{t('maintenance.fields.purchaseDate')}</Label><Input type="date" value={form.purchase_date} onChange={e => update('purchase_date', e.target.value)} /></div>
          <div><Label>{t('maintenance.fields.installationDate')}</Label><Input type="date" value={form.installation_date} onChange={e => update('installation_date', e.target.value)} /></div>
          <div><Label>{t('maintenance.fields.warrantyDate')}</Label><Input type="date" value={form.warranty_expiry_date} onChange={e => update('warranty_expiry_date', e.target.value)} /></div>
          <div><Label>{t('maintenance.fields.technicianContact')}</Label><Input value={form.technician_contact} onChange={e => update('technician_contact', e.target.value)} /></div>
          <div className="sm:col-span-2">
            <Label>{t('maintenance.fields.photo', 'Photo')}</Label>
            <div className="flex items-start gap-3 mt-1">
              <div className="h-24 w-24 rounded-md border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
                {form.photo_url ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <img src={form.photo_url} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  id="maintenance-photo-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={handlePhotoUpload}
                />
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => document.getElementById('maintenance-photo-input')?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {form.photo_url
                    ? t('maintenance.actions.replacePhoto', 'Replace photo')
                    : t('maintenance.actions.uploadPhoto', 'Upload photo')}
                </Button>
                {form.photo_url && (
                  <Button type="button" size="sm" variant="ghost" onClick={handlePhotoRemove} disabled={uploading}>
                    <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                    {t('maintenance.actions.removePhoto', 'Remove photo')}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>{t('maintenance.fields.notes')}</Label>
            <Textarea rows={3} value={form.notes} onChange={e => update('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- Detail View -------------------------- */
function AssetDetail({ asset, onBack, canEdit, canCreate, onArchiveToggle, onEdit }: {
  asset: EnrichedMaintenanceAsset;
  onBack: () => void;
  canEdit: boolean;
  canCreate: boolean;
  onArchiveToggle: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const isArchived = asset.status === 'archived';
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />{t('common.back')}
        </Button>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onArchiveToggle}>
              {isArchived
                ? <><ArchiveRestore className="h-4 w-4 mr-1" />{t('maintenance.actions.restore')}</>
                : <><Archive className="h-4 w-4 mr-1" />{t('maintenance.actions.archive')}</>}
            </Button>
            <Button size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-1" />{t('common.edit')}
            </Button>
          </div>
        )}
      </div>

      {/* Header card — always visible */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-xs font-mono text-muted-foreground">{asset.code}</div>
              <CardTitle className="text-xl sm:text-2xl mt-1 break-words">{asset.name}</CardTitle>
              {(asset.branch_name || asset.department) && (
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {asset.branch_name ?? '—'}
                  {asset.department ? <> · <span className="capitalize">{asset.department}</span></> : null}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {asset.type_name_en && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {asset.type_name_en}
                </Badge>
              )}
              <Badge variant="outline" className={STATUS_BADGE[asset.status]}>
                {t(`maintenance.status.${asset.status}`)}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Basic Information — default open */}
      <DetailSection
        title={t('maintenance.sections.basicInfo', 'Basic Information')}
        defaultOpen
      >
        <BasicInfoGrid asset={asset} />
      </DetailSection>

      {/* Scheduled Maintenance — placeholder */}
      <DetailSection
        title={t('maintenance.sections.scheduled', 'Scheduled Maintenance')}
        icon={<CalendarClock className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('maintenance.sections.scheduledPlaceholder',
              'Scheduled maintenance will be managed here in the next step.')}
          </p>
          <Button size="sm" variant="outline" disabled>
            <Plus className="h-4 w-4 mr-1" />
            {t('maintenance.actions.addSchedule', 'Add Schedule')}
          </Button>
        </div>
      </DetailSection>

      {/* Maintenance History — placeholder */}
      <DetailSection
        title={t('maintenance.sections.history', 'Maintenance History')}
        icon={<History className="h-4 w-4" />}
      >
        <p className="text-sm text-muted-foreground">
          {t('maintenance.sections.historyEmpty', 'No maintenance records yet.')}
        </p>
      </DetailSection>

      {/* Repair History — placeholder */}
      <DetailSection
        title={t('maintenance.sections.repairs', 'Repair History')}
        icon={<ShieldAlert className="h-4 w-4" />}
      >
        <p className="text-sm text-muted-foreground">
          {t('maintenance.sections.repairsEmpty', 'No repair records yet.')}
        </p>
      </DetailSection>

      {/* Documents / Photos */}
      <DetailSection
        title={t('maintenance.sections.documents', 'Documents / Photos')}
        icon={<FileImage className="h-4 w-4" />}
      >
        {asset.photo_url ? (
          <div className="space-y-2">
            <div className="max-w-md">
              <ChecklistPhotoPreview
                imageUrl={asset.photo_url}
                altText={asset.name}
                className="[&_img]:max-h-[340px] [&_img]:md:max-h-[380px]"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('maintenance.sections.documentsPending',
                'Additional documents and photos will be connected after storage setup is finalized.')}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('maintenance.sections.documentsPending',
              'Documents and photos will be connected after storage setup is finalized.')}
          </p>
        )}
      </DetailSection>
    </div>
  );
}

function DetailSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left hover:bg-accent/40 transition-colors"
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              {icon ? <span className="text-muted-foreground">{icon}</span> : null}
              {title}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-3 border-t">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function BasicInfoGrid({ asset }: { asset: EnrichedMaintenanceAsset }) {
  const { t } = useTranslation();
  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  const push = (label: string, value: any) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' && value.trim() === '') return;
    rows.push({ label, value });
  };
  push(t('maintenance.fields.location'), asset.location);
  push(t('maintenance.fields.brand'), asset.brand);
  push(t('maintenance.fields.model'), asset.model);
  push(t('maintenance.fields.serialNumber'), asset.serial_number);
  if (asset.purchase_date) push(t('maintenance.fields.purchaseDate'), fmtDate(asset.purchase_date));
  if (asset.installation_date) push(t('maintenance.fields.installationDate'), fmtDate(asset.installation_date));
  if (asset.warranty_expiry_date) push(t('maintenance.fields.warrantyDate'), fmtDate(asset.warranty_expiry_date));
  push(t('maintenance.fields.supplier'), asset.supplier_vendor);
  push(t('maintenance.fields.technicianContact'), asset.technician_contact);

  if (rows.length === 0 && !asset.notes) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
      {rows.map(r => <Info key={r.label} label={r.label} value={r.value} />)}
      {asset.notes && (
        <div className="sm:col-span-2">
          <Info
            label={t('maintenance.fields.notes')}
            value={<span className="whitespace-pre-wrap">{asset.notes}</span>}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------- List View -------------------------- */
function AssetList({
  assets, onOpen, canManage, onEdit, onArchiveToggle, isOwner,
}: {
  assets: EnrichedMaintenanceAsset[];
  onOpen: (a: EnrichedMaintenanceAsset) => void;
  canManage: (a: EnrichedMaintenanceAsset) => boolean;
  onEdit: (a: EnrichedMaintenanceAsset) => void;
  onArchiveToggle: (a: EnrichedMaintenanceAsset) => void;
  isOwner: boolean;
}) {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranchesAll();
  const { data: types = [] } = useMaintenanceAssetTypes();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('not_archived');

  const filtered = useMemo(() => {
    return assets.filter(a => {
      if (statusFilter === 'not_archived' && a.status === 'archived') return false;
      if (statusFilter !== 'all' && statusFilter !== 'not_archived' && a.status !== statusFilter) return false;
      if (branchFilter !== 'all' && a.branch_id !== branchFilter) return false;
      if (deptFilter !== 'all' && a.department !== deptFilter) return false;
      if (typeFilter !== 'all' && a.asset_type_id !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.code.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [assets, search, branchFilter, deptFilter, typeFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t('maintenance.list.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder={t('maintenance.fields.branch')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')} {t('maintenance.fields.branch')}</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder={t('maintenance.fields.department')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')} {t('maintenance.fields.department')}</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder={t('maintenance.fields.type')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')} {t('maintenance.fields.type')}</SelectItem>
              {types.map(ty => <SelectItem key={ty.id} value={ty.id}>{ty.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="not_archived">{t('maintenance.list.activeAndInactive')}</SelectItem>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{t(`maintenance.status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wrench} title={t('maintenance.list.emptyTitle')} description={t('maintenance.list.emptyDesc')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(a => (
            <Card key={a.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => onOpen(a)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-muted-foreground truncate">{a.code}</div>
                    <div className="font-semibold truncate">{a.name}</div>
                  </div>
                  <Badge variant="outline" className={STATUS_BADGE[a.status]}>{t(`maintenance.status.${a.status}`)}</Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div className="truncate">{a.branch_name ?? '—'} · <span className="capitalize">{a.department}</span></div>
                  <div className="truncate">{a.type_name_en ?? '—'}{a.location ? ` · ${a.location}` : ''}</div>
                  <div>{t('maintenance.fields.lastUpdated')}: {fmtDate(a.updated_at)}</div>
                </div>
                {canManage(a) && (
                  <div className="flex gap-1 pt-1" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => onEdit(a)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />{t('common.edit')}
                    </Button>
                    {(isOwner || a.status !== 'archived') && (
                      <Button size="sm" variant="outline" onClick={() => onArchiveToggle(a)}>
                        {a.status === 'archived'
                          ? <><ArchiveRestore className="h-3.5 w-3.5 mr-1" />{t('maintenance.actions.restore')}</>
                          : <><Archive className="h-3.5 w-3.5 mr-1" />{t('maintenance.actions.archive')}</>}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------- Page -------------------------- */
export default function Maintenance() {
  const { t } = useTranslation();
  const { hasRole, profile } = useAuth();
  const isOwner = hasRole('owner');
  const isManager = hasRole('manager');
  const canCreate = isOwner || isManager;

  const { data: assets = [], isLoading } = useMaintenanceAssets();
  const archive = useArchiveMaintenanceAsset();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedMaintenanceAsset | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EnrichedMaintenanceAsset | null>(null);

  const selected = assets.find(a => a.id === selectedId) ?? null;

  const canManageAsset = (a: EnrichedMaintenanceAsset) => {
    if (isOwner) return true;
    if (isManager && profile?.branch_id && a.branch_id === profile.branch_id) return true;
    return false;
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    try {
      await archive.mutateAsync({ id: archiveTarget.id, archive: archiveTarget.status !== 'archived' });
      toast.success(archiveTarget.status === 'archived' ? t('maintenance.toasts.restored') : t('maintenance.toasts.archived'));
      setArchiveTarget(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  return (
    <AppShell>
      <PageHeader title={t('pages.maintenance.title')} description={t('pages.maintenance.subtitle')}>
        {canCreate && !selected && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />{t('maintenance.actions.addAsset')}
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : selected ? (
        <AssetDetail
          asset={selected}
          onBack={() => setSelectedId(null)}
          canEdit={canManageAsset(selected)}
          onArchiveToggle={() => setArchiveTarget(selected)}
          onEdit={() => { setEditing(selected); setFormOpen(true); }}
        />
      ) : (
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">{t('maintenance.tabs.dashboard')}</TabsTrigger>
            <TabsTrigger value="list">{t('maintenance.tabs.list')}</TabsTrigger>
            {isOwner && (
              <TabsTrigger value="settings">{t('maintenance.tabs.settings')}</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="dashboard"><MaintenanceDashboard assets={assets} /></TabsContent>
          <TabsContent value="list">
            <AssetList
              assets={assets}
              onOpen={a => setSelectedId(a.id)}
              canManage={canManageAsset}
              onEdit={a => { setEditing(a); setFormOpen(true); }}
              onArchiveToggle={a => setArchiveTarget(a)}
              isOwner={isOwner}
            />
          </TabsContent>
          {isOwner && (
            <TabsContent value="settings">
              <AssetTypeSettings canManage={isOwner} />
            </TabsContent>
          )}
        </Tabs>
      )}

      {formOpen && (
        <AssetFormDialog
          open={formOpen}
          onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
          initial={editing}
          canPickBranch={isOwner}
        />
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={(v) => !v && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.status === 'archived' ? t('maintenance.confirm.restoreTitle') : t('maintenance.confirm.archiveTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.status === 'archived' ? t('maintenance.confirm.restoreDesc') : t('maintenance.confirm.archiveDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
