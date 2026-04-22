import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Pencil, X, AlertTriangle, Upload, Image as ImageIcon, Video, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useRecipeProcedures, useSaveRecipeProcedures, PROCEDURE_TYPES,
  type ProcedureStepInput, type ProcedureType,
} from '@/hooks/useRecipeProcedures';
import { uploadRecipeMediaFile } from '@/hooks/useRecipeMedia';
import { toast } from '@/hooks/use-toast';
import VideoPreview from './VideoPreview';
import { parseVideo } from '@/lib/videoEmbed';
import MediaFrame from './MediaFrame';
import { getImageFromClipboard } from '@/lib/clipboardImage';
import MediaCollectionField from './MediaCollectionField';
import MediaCollectionView from './MediaCollectionView';
import { useMediaCollection } from '@/hooks/useMediaCollection';
import StepMediaCollection from './StepMediaCollection';

interface Props {
  recipeId: string;
  canManage: boolean;
}

interface DraftStep extends ProcedureStepInput {
  _key: string;
}

const newKey = () => Math.random().toString(36).slice(2);

export default function RecipeProcedureTab({ recipeId, canManage }: Props) {
  const { t } = useTranslation();
  const { data: steps = [], isLoading } = useRecipeProcedures(recipeId);
  const save = useSaveRecipeProcedures();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftStep[]>([]);
  const [errors, setErrors] = useState<Record<string, { instruction?: string }>>({});

  useEffect(() => {
    if (!editing) {
      setDraft(steps.map((s, i) => ({
        _key: s.id ?? newKey(),
        id: s.id,
        step_number: s.step_number ?? i + 1,
        procedure_type: s.procedure_type ?? 'prep',
        instruction_en: s.instruction_en ?? '',
        warning: s.warning,
        tool: s.tool,
        duration_minutes: s.duration_minutes,
        temperature: s.temperature,
        note: s.note,
        image_url: s.image_url ?? null,
        image_storage_path: s.image_storage_path ?? null,
        video_url: s.video_url ?? null,
        web_link: s.web_link ?? null,
      })));
    }
  }, [steps, editing]);

  const procedureTypeLabel = (key: ProcedureType) => t(`recipes.procedure.types.${key}`);

  const addStep = () => {
    setDraft(d => [
      ...d,
      {
        _key: newKey(),
        step_number: d.length + 1,
        procedure_type: 'prep',
        instruction_en: '',
        warning: null,
        tool: null,
        duration_minutes: null,
        temperature: null,
        note: null,
        image_url: null,
        image_storage_path: null,
        video_url: null,
        web_link: null,
      },
    ]);
  };

  const removeStep = (key: string) =>
    setDraft(d => d.filter(s => s._key !== key).map((s, i) => ({ ...s, step_number: i + 1 })));

  const moveStep = (key: string, dir: -1 | 1) => {
    setDraft(d => {
      const idx = d.findIndex(s => s._key === key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= d.length) return d;
      const next = [...d];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, step_number: i + 1 }));
    });
  };

  const patch = (key: string, p: Partial<DraftStep>) => {
    setDraft(d => d.map(s => s._key === key ? { ...s, ...p } : s));
    if (p.instruction_en !== undefined) {
      setErrors(e => ({ ...e, [key]: { ...e[key], instruction: '' } }));
    }
  };

  const validate = (): { ok: boolean; cleaned: DraftStep[] } => {
    // Drop steps that are entirely empty (no instruction and no other data)
    const isEmpty = (s: DraftStep) =>
      !s.instruction_en?.trim() &&
      !s.warning?.trim() &&
      !s.tool?.trim() &&
      !s.temperature?.trim() &&
      !s.note?.trim() &&
      !s.image_url &&
      !s.video_url?.trim() &&
      !s.web_link?.trim() &&
      (s.duration_minutes == null);

    const cleaned = draft.filter(s => !isEmpty(s)).map((s, i) => ({ ...s, step_number: i + 1 }));

    const errs: typeof errors = {};
    let ok = true;
    cleaned.forEach(s => {
      if (!s.instruction_en?.trim()) {
        errs[s._key] = { instruction: t('recipes.procedure.errors.instructionRequired') };
        ok = false;
      }
    });
    setErrors(errs);
    return { ok, cleaned };
  };

  const handleSave = async () => {
    const { ok, cleaned } = validate();
    if (!ok) {
      toast({ title: t('recipes.procedure.errors.fixBeforeSave'), variant: 'destructive' });
      return;
    }
    try {
      await save.mutateAsync({
        recipeId,
        steps: cleaned.map((s, i) => ({
          id: s.id,
          step_number: i + 1,
          procedure_type: s.procedure_type,
          instruction_en: s.instruction_en.trim(),
          warning: s.warning?.trim() || null,
          tool: s.tool?.trim() || null,
          duration_minutes: s.duration_minutes != null && Number.isFinite(s.duration_minutes)
            ? Number(s.duration_minutes) : null,
          temperature: s.temperature?.trim() || null,
          note: s.note?.trim() || null,
          image_url: s.image_url || null,
          image_storage_path: s.image_storage_path || null,
          video_url: s.video_url?.trim() || null,
          web_link: s.web_link?.trim() || null,
        })),
      });
      toast({ title: t('recipes.procedure.saved') });
      setEditing(false);
    } catch (e: any) {
      toast({ title: t('common.error'), description: e?.message, variant: 'destructive' });
    }
  };

  const cancel = () => {
    setEditing(false);
    setErrors({});
  };

  // Per-step image upload state
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleStepImageUpload = async (key: string, file: File) => {
    setUploadingKey(key);
    try {
      const { path, publicUrl } = await uploadRecipeMediaFile(recipeId, file);
      patch(key, { image_url: publicUrl, image_storage_path: path });
    } catch (err: any) {
      toast({ title: t('recipes.media.uploadFailed'), description: err?.message, variant: 'destructive' });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleStepImagePaste = async (key: string, e: React.ClipboardEvent<HTMLDivElement>) => {
    const file = getImageFromClipboard(e);
    if (!file) return;
    e.preventDefault();
    toast({ title: t('recipes.media.pasted') });
    await handleStepImageUpload(key, file);
  };

  // -------------------- VIEW MODE --------------------
  if (!editing) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-xl font-semibold">{t('recipes.procedure.title')}</h3>
            {canManage && (
              <Button size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> {t('recipes.procedure.editSteps')}
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('recipes.procedure.empty')}</p>
          ) : (
            <ol className="space-y-3">
              {draft.map((s) => (
                <li key={s._key} className="rounded-md border p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {s.step_number}
                    </span>
                    <Badge variant="secondary">{procedureTypeLabel(s.procedure_type)}</Badge>
                    {s.duration_minutes != null && (
                      <Badge variant="outline">{s.duration_minutes} {t('recipes.procedure.min')}</Badge>
                    )}
                    {s.temperature && <Badge variant="outline">{s.temperature}</Badge>}
                    {s.tool && <Badge variant="outline">{s.tool}</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">{s.instruction_en}</p>
                  {s.warning && (
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="whitespace-pre-wrap">{s.warning}</span>
                    </div>
                  )}
                  {s.note && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      <span className="font-semibold">{t('recipes.procedure.cols.note')}:</span> {s.note}
                    </p>
                  )}
                  <div className="mt-3">
                    <StepMediaCollection
                      recipeId={recipeId}
                      procedureId={s.id}
                      legacyImageUrl={s.image_url}
                      legacyVideoUrl={s.video_url}
                      mode="view"
                    />
                    {s.web_link && (() => {
                      const parsed = parseVideo(s.web_link);
                      const isVid = parsed.source === 'youtube' || parsed.source === 'google_drive' || parsed.source === 'private_cloud';
                      if (isVid) return null;
                      return (
                        <a href={s.web_link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <LinkIcon className="h-3.5 w-3.5" /> {s.web_link} <ExternalLink className="h-3 w-3" />
                        </a>
                      );
                    })()}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    );
  }

  // -------------------- EDIT MODE --------------------
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold">{t('recipes.procedure.editTitle')}</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cancel} disabled={save.isPending}>
              <X className="h-4 w-4" /> {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={save.isPending}>
              <Save className="h-4 w-4" /> {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('recipes.procedure.emptyEdit')}</p>
          )}

          {draft.map((s, idx) => {
            const err = errors[s._key];
            return (
              <div key={s._key} className="rounded-md border p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      {t('recipes.procedure.step')}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => moveStep(s._key, -1)} disabled={idx === 0} title={t('recipes.procedure.moveUp') as string}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => moveStep(s._key, 1)} disabled={idx === draft.length - 1} title={t('recipes.procedure.moveDown') as string}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeStep(s._key)} title={t('recipes.procedure.remove') as string}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <label className="text-xs text-muted-foreground">{t('recipes.procedure.cols.type')}</label>
                    <Select
                      value={s.procedure_type}
                      onValueChange={(v) => patch(s._key, { procedure_type: v as ProcedureType })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROCEDURE_TYPES.map(p => (
                          <SelectItem key={p} value={p}>{procedureTypeLabel(p)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="text-xs text-muted-foreground">{t('recipes.procedure.cols.tool')}</label>
                    <Input
                      value={s.tool ?? ''}
                      onChange={e => patch(s._key, { tool: e.target.value })}
                      placeholder={t('recipes.procedure.toolPh') as string}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">{t('recipes.procedure.cols.time')}</label>
                    <Input
                      type="number" inputMode="numeric" min="0" step="1"
                      value={s.duration_minutes ?? ''}
                      onChange={e => patch(s._key, {
                        duration_minutes: e.target.value === '' ? null : Number(e.target.value),
                      })}
                      placeholder={t('recipes.procedure.min') as string}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">{t('recipes.procedure.cols.temp')}</label>
                    <Input
                      value={s.temperature ?? ''}
                      onChange={e => patch(s._key, { temperature: e.target.value })}
                      placeholder={t('recipes.procedure.tempPh') as string}
                    />
                  </div>

                  <div className="sm:col-span-12">
                    <label className="text-xs text-muted-foreground">{t('recipes.procedure.cols.instruction')} *</label>
                    <Textarea
                      rows={3}
                      value={s.instruction_en}
                      onChange={e => patch(s._key, { instruction_en: e.target.value })}
                      placeholder={t('recipes.procedure.instructionPh') as string}
                    />
                    {err?.instruction && <p className="mt-1 text-xs text-destructive">{err.instruction}</p>}
                  </div>

                  <div className="sm:col-span-12">
                    <label className="text-xs text-muted-foreground">{t('recipes.procedure.cols.warning')}</label>
                    <Textarea
                      rows={2}
                      value={s.warning ?? ''}
                      onChange={e => patch(s._key, { warning: e.target.value })}
                      placeholder={t('recipes.procedure.warningPh') as string}
                    />
                  </div>

                  <div className="sm:col-span-12">
                    <label className="text-xs text-muted-foreground">{t('recipes.procedure.cols.note')}</label>
                    <Input
                      value={s.note ?? ''}
                      onChange={e => patch(s._key, { note: e.target.value })}
                      placeholder={t('recipes.procedure.notePh') as string}
                    />
                  </div>

                  <div className="sm:col-span-12 rounded-md border border-dashed p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      {t('recipes.media.stepMediaTitle')}
                    </p>
                    <StepMediaCollection
                      recipeId={recipeId}
                      procedureId={s.id}
                      legacyImageUrl={s.image_url}
                      legacyVideoUrl={s.video_url}
                      mode="edit"
                    />
                    <div className="mt-3">
                      <label className="text-xs text-muted-foreground">{t('recipes.media.stepWeb')}</label>
                      <Input
                        value={s.web_link ?? ''}
                        onChange={e => patch(s._key, { web_link: e.target.value })}
                        placeholder={t('recipes.media.webUrl') as string}
                      />
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end border-t pt-3">
          <Button variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-4 w-4" /> {t('recipes.procedure.addStep')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
