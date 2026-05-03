import { useEffect, useState } from 'react';
import { Loader2, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenanceAssets } from '@/hooks/useMaintenance';
import {
  useUpsertMaintenanceRepair,
  REPAIR_STATUSES,
  REPAIR_SEVERITIES,
  REPAIR_COST_TYPES,
  type EnrichedMaintenanceRepair,
  type MaintenanceRepairStatus,
  type MaintenanceRepairSeverity,
  type RepairCostType,
} from '@/hooks/useMaintenanceRepairs';
import { uploadToAppFilesBucket } from '@/lib/appFilesStorage';
import { optimizeChecklistImage } from '@/lib/imageCompression';
import { WORK_AREAS, DEFAULT_WORK_AREA, type WorkArea } from '@/hooks/useWorkToBeDone';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: EnrichedMaintenanceRepair | null;
  presetAssetId?: string | null;
  /** Staff can only report; UI hides management fields when true. */
  reportOnly?: boolean;
}

function toLocalDateTimeInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RepairFormDialog({ open, onOpenChange, initial, presetAssetId, reportOnly = false }: Props) {
  const { profile } = useAuth();
  const { data: assets = [] } = useMaintenanceAssets();
  const upsert = useUpsertMaintenanceRepair();

  const [form, setForm] = useState(() => buildInitialForm(initial, presetAssetId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(buildInitialForm(initial, presetAssetId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, presetAssetId]);

  const update = (k: string, v: any) => setForm(s => ({ ...s, [k]: v }));

  const MAX_PHOTOS = 4;

  const handleAddPhoto = async (file: File) => {
    const asset = assets.find(a => a.id === form.asset_id);
    if (!asset) {
      toast.error('Select equipment before uploading a photo');
      return;
    }
    if (form.photos.length >= MAX_PHOTOS) {
      toast.error(`Up to ${MAX_PHOTOS} photos allowed`);
      return;
    }
    setUploadingPhoto(true);
    try {
      let toUpload = file;
      if (file.type.startsWith('image/')) {
        try {
          const opt = await optimizeChecklistImage(file);
          toUpload = opt.file;
        } catch { /* ignore */ }
      }
      const res = await uploadToAppFilesBucket(toUpload, 'maintenance', {
        branchName: asset.branch_name ?? undefined,
        category: 'repairs',
      }, `${asset.code}-${form.title || 'repair'}-${form.photos.length + 1}`);
      setForm(s => ({ ...s, photos: [...s.photos, res.publicUrl] }));
      toast.success('Photo uploaded');
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setForm(s => ({ ...s, photos: s.photos.filter((_, i) => i !== idx) }));
  };

  // Auto-suggest cost_type when amount > 0
  useEffect(() => {
    const n = Number(form.cost_amount);
    if (!isNaN(n) && n > 0 && form.cost_type === 'Internal / No Cost') {
      setForm(s => ({ ...s, cost_type: 'External Service' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cost_amount]);

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.asset_id) errs.asset_id = 'Equipment is required';
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.severity) errs.severity = 'Severity is required';
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = errs.title || errs.asset_id || errs.severity;
      if (first) toast.error(first);
      return;
    }
    try {
      const payload: any = {
        asset_id: form.asset_id,
        title: form.title.trim(),
        issue_description: form.issue_description?.trim() || null,
        action_taken: reportOnly ? null : (form.action_taken?.trim() || null),
        status: reportOnly ? 'Reported' : form.status,
        severity: form.severity,
        reported_at: form.reported_at ? new Date(form.reported_at).toISOString() : new Date().toISOString(),
        completed_at: !reportOnly && form.completed_at ? new Date(form.completed_at).toISOString() : null,
        assigned_to: !reportOnly ? (form.assigned_to || null) : null,
        technician_name: !reportOnly ? (form.technician_name?.trim() || null) : null,
        technician_contact: !reportOnly ? (form.technician_contact?.trim() || null) : null,
        cost_amount: !reportOnly && form.cost_amount !== '' ? Number(form.cost_amount) : null,
        currency: form.currency || 'VND',
        cost_type: !reportOnly ? form.cost_type : 'Internal / No Cost',
        parts_replaced: !reportOnly ? (form.parts_replaced?.trim() || null) : null,
        // Keep legacy before/after fields untouched on edit; do not write new values to them.
        before_photo_url: initial?.before_photo_url ?? null,
        after_photo_url: initial?.after_photo_url ?? null,
        photos: form.photos,
        downtime_hours: !reportOnly && form.downtime_hours !== '' ? Number(form.downtime_hours) : null,
        work_area: form.work_area,
        updated_by: profile?.user_id ?? null,
      };
      if (initial?.id) payload.id = initial.id;
      else payload.reported_by = profile?.user_id ?? null; // Auto-fill on create only

      await upsert.mutateAsync(payload);
      toast.success(initial ? 'Repair updated' : 'Repair logged');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed');
    }
  };

  const assetOptions = assets
    .filter(a => a.status !== 'archived' || a.id === form.asset_id)
    .map(a => ({
      id: a.id,
      label: `${a.code} — ${a.name}`,
      sublabel: [a.branch_name, a.department].filter(Boolean).join(' · ') || undefined,
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Repair' : reportOnly ? 'Report an Issue' : 'New Repair'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Equipment *</Label>
            <SearchableCombobox
              value={form.asset_id}
              onChange={v => update('asset_id', v)}
              options={assetOptions}
              placeholder="Select equipment"
              searchPlaceholder="Search by code or name…"
              emptyText="No equipment found."
              disabled={!!presetAssetId && !initial}
            />
            {errors.asset_id && <p className="text-xs text-destructive mt-1">{errors.asset_id}</p>}
            {form.asset_id && (() => {
              const a = assets.find(x => x.id === form.asset_id);
              return a ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {[a.branch_name, a.department].filter(Boolean).join(' · ')}
                </p>
              ) : null;
            })()}
            {initial && (initial.reported_by_name || initial.reported_at) && (
              <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                {initial.reported_by_name && (
                  <div>Reported by: {initial.reported_by_name}</div>
                )}
                {initial.reported_at && (
                  <div>Reported at: {new Date(initial.reported_at).toLocaleString()}</div>
                )}
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => update('title', e.target.value)} placeholder="e.g. Broken door hinge" />
            {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
          </div>

          <div className="sm:col-span-2">
            <Label>Issue description</Label>
            <Textarea rows={3} value={form.issue_description} onChange={e => update('issue_description', e.target.value)} />
          </div>

          <div>
            <Label>Severity *</Label>
            <Select value={form.severity} onValueChange={v => update('severity', v as MaintenanceRepairSeverity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPAIR_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!reportOnly && (
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update('status', v as MaintenanceRepairStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPAIR_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Reported at</Label>
            <Input type="datetime-local" value={form.reported_at} onChange={e => update('reported_at', e.target.value)} />
          </div>

          {!reportOnly && (
            <div>
              <Label>Completed at</Label>
              <Input type="datetime-local" value={form.completed_at} onChange={e => update('completed_at', e.target.value)} />
            </div>
          )}

          {!reportOnly && (
            <>
              <div className="sm:col-span-2">
                <Label>Action taken</Label>
                <Textarea rows={2} value={form.action_taken} onChange={e => update('action_taken', e.target.value)} />
              </div>

              <div>
                <Label>Technician name</Label>
                <Input value={form.technician_name} onChange={e => update('technician_name', e.target.value)} />
              </div>
              <div>
                <Label>Technician contact</Label>
                <Input value={form.technician_contact} onChange={e => update('technician_contact', e.target.value)} />
              </div>

              <div>
                <Label>Cost type</Label>
                <Select value={form.cost_type} onValueChange={v => update('cost_type', v as RepairCostType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPAIR_COST_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cost amount</Label>
                <Input type="number" min={0} step="0.01" value={form.cost_amount} onChange={e => update('cost_amount', e.target.value)} />
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={form.currency} onChange={e => update('currency', e.target.value)} placeholder="VND" />
              </div>

              <div className="sm:col-span-2">
                <Label>Parts replaced</Label>
                <Textarea rows={2} value={form.parts_replaced} onChange={e => update('parts_replaced', e.target.value)} placeholder="e.g. 1x door hinge, 2x screws" />
              </div>

              <div>
                <Label>Downtime (hours)</Label>
                <Input type="number" min={0} step="0.1" value={form.downtime_hours} onChange={e => update('downtime_hours', e.target.value)} />
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <Label>Photos (up to {MAX_PHOTOS})</Label>
            <PhotosField
              photos={form.photos}
              uploading={uploadingPhoto}
              max={MAX_PHOTOS}
              onAdd={handleAddPhoto}
              onRemove={handleRemovePhoto}
              legacyBefore={initial?.before_photo_url ?? null}
              legacyAfter={initial?.after_photo_url ?? null}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildInitialForm(initial: EnrichedMaintenanceRepair | null | undefined, presetAssetId: string | null | undefined) {
  const photos: string[] = Array.isArray((initial as any)?.photos) ? (initial as any).photos.filter(Boolean) : [];
  return {
    asset_id: initial?.asset_id ?? presetAssetId ?? '',
    title: initial?.title ?? '',
    issue_description: initial?.issue_description ?? '',
    action_taken: initial?.action_taken ?? '',
    status: (initial?.status ?? 'Reported') as MaintenanceRepairStatus,
    severity: (initial?.severity ?? 'Medium') as MaintenanceRepairSeverity,
    reported_at: toLocalDateTimeInput(initial?.reported_at) || toLocalDateTimeInput(new Date().toISOString()),
    completed_at: toLocalDateTimeInput(initial?.completed_at),
    assigned_to: initial?.assigned_to ?? '',
    technician_name: initial?.technician_name ?? '',
    technician_contact: initial?.technician_contact ?? '',
    cost_amount: initial?.cost_amount != null ? String(initial.cost_amount) : '',
    currency: initial?.currency ?? 'VND',
    cost_type: ((initial as any)?.cost_type ?? 'Internal / No Cost') as RepairCostType,
    parts_replaced: initial?.parts_replaced ?? '',
    photos,
    downtime_hours: initial?.downtime_hours != null ? String(initial.downtime_hours) : '',
  };
}

function PhotosField({
  photos, uploading, max, onAdd, onRemove, legacyBefore, legacyAfter,
}: {
  photos: string[];
  uploading: boolean;
  max: number;
  onAdd: (f: File) => void;
  onRemove: (idx: number) => void;
  legacyBefore: string | null;
  legacyAfter: string | null;
}) {
  const inputId = 'repair-photos-input';
  const canAdd = photos.length < max;
  const legacy: Array<{ url: string; label: string }> = [];
  if (legacyBefore) legacy.push({ url: legacyBefore, label: 'Before (legacy)' });
  if (legacyAfter) legacy.push({ url: legacyAfter, label: 'After (legacy)' });

  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <div key={i} className="relative h-20 w-20 rounded-md border bg-muted/40 overflow-hidden">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={url} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-1 right-1 rounded-full bg-background/90 border p-0.5 hover:bg-destructive hover:text-destructive-foreground transition-colors"
              aria-label="Remove photo"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {canAdd && (
          <>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAdd(f); }}
            />
            <button
              type="button"
              onClick={() => document.getElementById(inputId)?.click()}
              disabled={uploading}
              className="h-20 w-20 rounded-md border border-dashed bg-muted/20 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              {uploading
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <><Upload className="h-5 w-5" /><span className="text-[10px]">Add photo</span></>}
            </button>
          </>
        )}
        {photos.length === 0 && !canAdd && (
          <div className="h-20 w-20 rounded-md border bg-muted/20 flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{photos.length}/{max} photos</p>

      {legacy.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Previously saved photos</p>
          <div className="flex flex-wrap gap-2">
            {legacy.map((p, i) => (
              <div key={i} className="space-y-1">
                <div className="h-20 w-20 rounded-md border bg-muted/40 overflow-hidden">
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img src={p.url} className="h-full w-full object-cover" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center">{p.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}