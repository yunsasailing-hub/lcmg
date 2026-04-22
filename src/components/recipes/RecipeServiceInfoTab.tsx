import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pencil, Save, X, Sparkles, Image as ImageIcon, Video, Link as LinkIcon,
  ExternalLink, Upload, Trash2, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  useRecipeServiceInfo, useSaveRecipeServiceInfo,
  uploadServiceInfoImage, deleteServiceInfoImage,
  type RecipeServiceInfoRow,
} from '@/hooks/useRecipeServiceInfo';
import { toast } from '@/hooks/use-toast';
import MediaFrame from './MediaFrame';
import VideoPreview from './VideoPreview';
import { parseVideo } from '@/lib/videoEmbed';
import { getImageFromClipboard } from '@/lib/clipboardImage';
import MediaCollectionField from './MediaCollectionField';
import MediaCollectionView from './MediaCollectionView';
import { useMediaCollection } from '@/hooks/useMediaCollection';

interface Props {
  recipeId: string;
  canManage: boolean;
}

interface FormState {
  short_description: string;
  staff_explanation: string;
  key_ingredients: string;
  taste_profile: string;
  allergens_to_mention: string;
  upselling_notes: string;
  pairing_suggestion: string;
  service_warning: string;
  image_url: string | null;
  image_storage_path: string | null;
  video_url: string;
  web_link: string;
}

const EMPTY: FormState = {
  short_description: '',
  staff_explanation: '',
  key_ingredients: '',
  taste_profile: '',
  allergens_to_mention: '',
  upselling_notes: '',
  pairing_suggestion: '',
  service_warning: '',
  image_url: null,
  image_storage_path: null,
  video_url: '',
  web_link: '',
};

const isValidUrl = (s: string) => {
  if (!s.trim()) return true;
  try { new URL(s); return true; } catch { return false; }
};

function fromRow(row: RecipeServiceInfoRow | null): FormState {
  if (!row) return EMPTY;
  return {
    short_description: row.short_description ?? '',
    staff_explanation: row.staff_explanation ?? '',
    key_ingredients: row.key_ingredients ?? '',
    taste_profile: row.taste_profile ?? '',
    allergens_to_mention: row.allergens_to_mention ?? '',
    upselling_notes: row.upselling_notes ?? '',
    pairing_suggestion: row.pairing_suggestion ?? '',
    service_warning: row.service_warning ?? '',
    image_url: row.image_url,
    image_storage_path: row.image_storage_path,
    video_url: row.video_url ?? '',
    web_link: row.web_link ?? '',
  };
}

const ReadField = ({ label, value }: { label: string; value: string | null }) => {
  if (!value || !value.trim()) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-foreground/90">{value}</p>
    </div>
  );
};

export default function RecipeServiceInfoTab({ recipeId, canManage }: Props) {
  const { t } = useTranslation();
  const { data: info, isLoading } = useRecipeServiceInfo(recipeId);
  const save = useSaveRecipeServiceInfo();
  const mediaConfig = {
    table: 'recipe_service_media' as const,
    parentColumn: 'recipe_id' as const,
    parentId: recipeId,
  };
  const { data: mediaItems = [] } = useMediaCollection(mediaConfig);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setForm(fromRow(info ?? null)); }, [info, editing]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => ({ ...p, [k]: '' }));
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadServiceImage(file);
  };

  const uploadServiceImage = async (file: File) => {
    setUploading(true);
    try {
      // Remove previous image if any
      if (form.image_storage_path) await deleteServiceInfoImage(form.image_storage_path);
      const { path, publicUrl } = await uploadServiceInfoImage(recipeId, file);
      update('image_url', publicUrl);
      update('image_storage_path', path);
    } catch (err: any) {
      toast({ title: t('recipes.media.uploadFailed'), description: err?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleImagePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!canManage) return;
    const file = getImageFromClipboard(e);
    if (!file) return;
    e.preventDefault();
    toast({ title: t('recipes.media.pasted') });
    await uploadServiceImage(file);
  };

  const handleRemoveImage = async () => {
    if (form.image_storage_path) await deleteServiceInfoImage(form.image_storage_path);
    update('image_url', null);
    update('image_storage_path', null);
  };

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (!isValidUrl(form.video_url)) e.video_url = t('recipes.media.invalidUrl');
    if (!isValidUrl(form.web_link)) e.web_link = t('recipes.media.invalidUrl');
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await save.mutateAsync({
        recipe_id: recipeId,
        short_description: form.short_description.trim() || null,
        staff_explanation: form.staff_explanation.trim() || null,
        key_ingredients: form.key_ingredients.trim() || null,
        taste_profile: form.taste_profile.trim() || null,
        allergens_to_mention: form.allergens_to_mention.trim() || null,
        upselling_notes: form.upselling_notes.trim() || null,
        pairing_suggestion: form.pairing_suggestion.trim() || null,
        service_warning: form.service_warning.trim() || null,
        image_url: form.image_url,
        image_storage_path: form.image_storage_path,
        video_url: form.video_url.trim() || null,
        web_link: form.web_link.trim() || null,
      });
      toast({ title: t('recipes.service.saved') });
      setEditing(false);
    } catch (err: any) {
      toast({ title: t('recipes.service.saveFailed'), description: err?.message, variant: 'destructive' });
    }
  };

  const handleCancel = () => {
    setForm(fromRow(info ?? null));
    setErrors({});
    setEditing(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{t('common.loading')}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-heading text-xl font-semibold">{t('recipes.service.title')}</h3>
            <Badge variant="secondary" className="text-[10px] uppercase">{t('recipes.service.audience')}</Badge>
          </div>
          {!editing && canManage && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> {t('common.edit')}
            </Button>
          )}
        </div>
        {editing && (
          <p className="text-xs text-muted-foreground">{t('recipes.service.hint')}</p>
        )}

        {editing && canManage ? (
          <div className="space-y-5">
            <div>
              <Label htmlFor="srv-short">{t('recipes.service.fields.shortDescription')}</Label>
              <Textarea
                id="srv-short" rows={2} value={form.short_description}
                onChange={e => update('short_description', e.target.value)}
                placeholder={t('recipes.service.placeholders.shortDescription')}
              />
            </div>
            <div>
              <Label htmlFor="srv-staff">{t('recipes.service.fields.staffExplanation')}</Label>
              <Textarea
                id="srv-staff" rows={4} value={form.staff_explanation}
                onChange={e => update('staff_explanation', e.target.value)}
                placeholder={t('recipes.service.placeholders.staffExplanation')}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="srv-key">{t('recipes.service.fields.keyIngredients')}</Label>
                <Textarea
                  id="srv-key" rows={3} value={form.key_ingredients}
                  onChange={e => update('key_ingredients', e.target.value)}
                  placeholder={t('recipes.service.placeholders.keyIngredients')}
                />
              </div>
              <div>
                <Label htmlFor="srv-taste">{t('recipes.service.fields.tasteProfile')}</Label>
                <Textarea
                  id="srv-taste" rows={3} value={form.taste_profile}
                  onChange={e => update('taste_profile', e.target.value)}
                  placeholder={t('recipes.service.placeholders.tasteProfile')}
                />
              </div>
              <div>
                <Label htmlFor="srv-all">{t('recipes.service.fields.allergens')}</Label>
                <Textarea
                  id="srv-all" rows={2} value={form.allergens_to_mention}
                  onChange={e => update('allergens_to_mention', e.target.value)}
                  placeholder={t('recipes.service.placeholders.allergens')}
                />
              </div>
              <div>
                <Label htmlFor="srv-up">{t('recipes.service.fields.upselling')}</Label>
                <Textarea
                  id="srv-up" rows={2} value={form.upselling_notes}
                  onChange={e => update('upselling_notes', e.target.value)}
                  placeholder={t('recipes.service.placeholders.upselling')}
                />
              </div>
              <div>
                <Label htmlFor="srv-pair">{t('recipes.service.fields.pairing')}</Label>
                <Textarea
                  id="srv-pair" rows={2} value={form.pairing_suggestion}
                  onChange={e => update('pairing_suggestion', e.target.value)}
                  placeholder={t('recipes.service.placeholders.pairing')}
                />
              </div>
              <div>
                <Label htmlFor="srv-warn">{t('recipes.service.fields.warning')}</Label>
                <Textarea
                  id="srv-warn" rows={2} value={form.service_warning}
                  onChange={e => update('service_warning', e.target.value)}
                  placeholder={t('recipes.service.placeholders.warning')}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('recipes.service.mediaSection')}
              </div>

              <MediaCollectionField
                recipeIdForBucket={recipeId}
                config={mediaConfig}
                items={mediaItems}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleCancel} disabled={save.isPending}>
                <X className="h-4 w-4" /> {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={save.isPending || uploading}>
                <Save className="h-4 w-4" /> {save.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {!info ? (
              <p className="text-sm text-muted-foreground">{t('recipes.service.empty')}</p>
            ) : (
              <>
                {info.service_warning && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
                        {t('recipes.service.fields.warning')}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap">{info.service_warning}</p>
                    </div>
                  </div>
                )}
                <ReadField label={t('recipes.service.fields.shortDescription')} value={info.short_description} />
                <ReadField label={t('recipes.service.fields.staffExplanation')} value={info.staff_explanation} />
                <div className="grid gap-4 md:grid-cols-2">
                  <ReadField label={t('recipes.service.fields.keyIngredients')} value={info.key_ingredients} />
                  <ReadField label={t('recipes.service.fields.tasteProfile')} value={info.taste_profile} />
                  <ReadField label={t('recipes.service.fields.allergens')} value={info.allergens_to_mention} />
                  <ReadField label={t('recipes.service.fields.upselling')} value={info.upselling_notes} />
                  <ReadField label={t('recipes.service.fields.pairing')} value={info.pairing_suggestion} />
                </div>
                {(mediaItems.length > 0 || info.image_url || info.video_url || info.web_link) && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('recipes.service.mediaSection')}
                    </div>
                    <MediaCollectionView
                      items={mediaItems}
                      legacyImageUrl={info.image_url}
                      legacyVideoUrl={info.video_url}
                      legacyExtraVideoUrls={[info.web_link]}
                    />
                    {(() => {
                      // Web link still renders as a plain link when it isn't a video URL.
                      const rawLink = (info.web_link || '').trim();
                      if (!rawLink) return null;
                      const parsed = parseVideo(rawLink);
                      const isVideoLink = parsed.source === 'youtube' || parsed.source === 'google_drive' || parsed.source === 'private_cloud';
                      if (isVideoLink) return null;
                      return (
                        <a href={rawLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                          <LinkIcon className="h-3.5 w-3.5" /> {rawLink} <ExternalLink className="h-3 w-3" />
                        </a>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
