import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useUpsertMaintenanceSchedule,
  useStaffProfiles,
  type EnrichedScheduleTemplate,
  type MaintenanceScheduleFrequency,
  type MaintenanceScheduleStatus,
} from '@/hooks/useMaintenanceSchedules';
import { useMaintenanceAssets } from '@/hooks/useMaintenance';
import type { Database } from '@/integrations/supabase/types';

type Department = Database['public']['Enums']['department'];
const DEPARTMENTS: Department[] = ['kitchen', 'pizza', 'bar', 'service', 'office', 'management', 'bakery'];

const FREQUENCIES: MaintenanceScheduleFrequency[] = [
  'daily', 'weekly', 'monthly', 'every_90_days', 'custom_interval',
];
const STATUSES: MaintenanceScheduleStatus[] = ['active', 'inactive', 'archived'];

const FREQ_LABEL: Record<MaintenanceScheduleFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  every_90_days: 'Every 90 Days',
  custom_interval: 'Custom Interval',
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: EnrichedScheduleTemplate | null;
  presetAssetId?: string | null;
}

export default function ScheduleFormDialog({ open, onOpenChange, initial, presetAssetId }: Props) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { data: assets = [] } = useMaintenanceAssets();
  const { data: staff = [] } = useStaffProfiles();
  const upsert = useUpsertMaintenanceSchedule();

  const [form, setForm] = useState(() => ({
    asset_id: initial?.asset_id ?? presetAssetId ?? '',
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    frequency: (initial?.frequency ?? 'monthly') as MaintenanceScheduleFrequency,
    custom_interval_days: initial?.custom_interval_days ?? '',
    due_time: initial?.due_time ?? '09:00',
    assigned_staff_id: initial?.assigned_staff_id ?? '',
    assigned_department: (initial?.assigned_department ?? '') as Department | '',
    note_required: initial?.note_required ?? false,
    photo_required: initial?.photo_required ?? false,
    status: (initial?.status ?? 'active') as MaintenanceScheduleStatus,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when initial/presetAssetId changes (re-mount on open)
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      asset_id: initial?.asset_id ?? presetAssetId ?? '',
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      frequency: (initial?.frequency ?? 'monthly') as MaintenanceScheduleFrequency,
      custom_interval_days: (initial?.custom_interval_days as any) ?? '',
      due_time: initial?.due_time ?? '09:00',
      assigned_staff_id: initial?.assigned_staff_id ?? '',
      assigned_department: (initial?.assigned_department ?? '') as Department | '',
      note_required: initial?.note_required ?? false,
      photo_required: initial?.photo_required ?? false,
      status: (initial?.status ?? 'active') as MaintenanceScheduleStatus,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, presetAssetId]);

  const update = (k: string, v: any) => setForm(s => ({ ...s, [k]: v }));

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.asset_id) errs.asset_id = 'Equipment is required';
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.due_time) errs.due_time = 'Due time is required';
    if (form.frequency === 'custom_interval') {
      const n = Number(form.custom_interval_days);
      if (!n || n <= 0) errs.custom_interval_days = 'Custom interval must be > 0';
    }
    if (!form.assigned_staff_id && !form.assigned_department) {
      errs.assignment = 'Assign to a staff member or a department';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      const payload: any = {
        asset_id: form.asset_id,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        frequency: form.frequency,
        custom_interval_days:
          form.frequency === 'custom_interval' ? Number(form.custom_interval_days) : null,
        due_time: form.due_time,
        assigned_staff_id: form.assigned_staff_id || null,
        assigned_department: form.assigned_department || null,
        note_required: form.note_required,
        photo_required: form.photo_required,
        status: form.status,
      };
      if (initial?.id) payload.id = initial.id;
      else payload.created_by = profile?.user_id ?? null;

      await upsert.mutateAsync(payload);
      toast.success(initial ? 'Schedule updated' : 'Schedule created');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed');
    }
  };

  const eligibleStaff = staff;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? 'Edit Schedule' : 'New Maintenance Schedule'}
          </DialogTitle>
        </DialogHeader>

        <Section title="Basic Schedule Info" defaultOpen>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Equipment / Area *</Label>
              <Select
                value={form.asset_id}
                onValueChange={v => update('asset_id', v)}
                disabled={!!presetAssetId && !initial}
              >
                <SelectTrigger><SelectValue placeholder="Select equipment" /></SelectTrigger>
                <SelectContent>
                  {assets
                    .filter(a => a.status !== 'archived' || a.id === form.asset_id)
                    .map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.asset_id && <p className="text-xs text-destructive mt-1">{errors.asset_id}</p>}
            </div>

            <div className="sm:col-span-2">
              <Label>Schedule Title *</Label>
              <Input
                value={form.title}
                onChange={e => update('title', e.target.value)}
                placeholder="e.g. Monthly filter cleaning"
              />
              {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
            </div>

            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={e => update('description', e.target.value)}
              />
            </div>

            <div>
              <Label>Frequency *</Label>
              <Select value={form.frequency} onValueChange={v => update('frequency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => (
                    <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Due Time *</Label>
              <Input
                type="time"
                value={form.due_time}
                onChange={e => update('due_time', e.target.value)}
              />
              {errors.due_time && <p className="text-xs text-destructive mt-1">{errors.due_time}</p>}
            </div>

            {form.frequency === 'custom_interval' && (
              <div className="sm:col-span-2">
                <Label>Custom Interval (days) *</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.custom_interval_days as any}
                  onChange={e => update('custom_interval_days', e.target.value)}
                />
                {errors.custom_interval_days && (
                  <p className="text-xs text-destructive mt-1">{errors.custom_interval_days}</p>
                )}
              </div>
            )}

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update('status', v as MaintenanceScheduleStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <Section title="Assignment" defaultOpen>
          <p className="text-xs text-muted-foreground mb-2">
            Assign to a staff member, a department, or both. At least one is required.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Assign to Staff</Label>
              <Select
                value={form.assigned_staff_id || '__none__'}
                onValueChange={v => update('assigned_staff_id', v === '__none__' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {eligibleStaff.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.full_name || s.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign to Department</Label>
              <Select
                value={form.assigned_department || '__none__'}
                onValueChange={v => update('assigned_department', v === '__none__' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errors.assignment && (
              <p className="text-xs text-destructive sm:col-span-2">{errors.assignment}</p>
            )}
          </div>
        </Section>

        <Section title="Completion Requirements">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Note required</div>
                <div className="text-xs text-muted-foreground">Staff must add a note when completing.</div>
              </div>
              <Switch
                checked={form.note_required}
                onCheckedChange={v => update('note_required', v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Photo required</div>
                <div className="text-xs text-muted-foreground">Staff must attach a photo when completing.</div>
              </div>
              <Switch
                checked={form.photo_required}
                onCheckedChange={v => update('photo_required', v)}
              />
            </div>
          </div>
        </Section>

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

function Section({
  title, defaultOpen = false, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border mb-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold hover:bg-accent/40"
          >
            {title}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-2 border-t">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export { FREQ_LABEL };
